import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { event, order, orderItem, organizer, payment, sector, ticket, tier, venue } from '../db/index.js';
import { canManageOrganizer, type AuthUser } from '../auth/access.js';

export const ORDER_STATUSES = ['PAGADA', 'PENDIENTE_PAGO', 'EXPIRADA'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

interface OrderFilters {
  status?: OrderStatus;
  q?: string;
}

// Sin tildes ni mayúsculas: "maria" encuentra "María"
const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const foldedCol = (col: unknown) => sql`translate(lower(${col}), 'áéíóúüñ', 'aeiouun')`;
const money = (v: unknown) => (v === null || v === undefined ? '0.00' : String(v));

// Criterio de venta: una orden PAGADA. Las pendientes se muestran aparte ("en espera"); las
// expiradas no cuentan. Las cortesías no pasan por órdenes: no son ingreso.
const PAID = sql`${order.status} = 'PAGADA'`;
const lineTotal = sql`${orderItem.quantity} * ${orderItem.unitPrice}`;

export interface SummaryRow {
  id: string; name: string; startsAt: Date; status: string; organizerName: string; venueName: string;
  commissionPct: string | null; orders: number; sold: number; gross: string;
  commission: string | null; net: string | null; pendingOrders: number; pendingAmount: string;
}

@Injectable()
export class SalesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private async managedEvent(eventId: string, actor: AuthUser) {
    const [ev] = await this.db.select().from(event).where(eq(event.id, eventId)).limit(1);
    if (!ev || !canManageOrganizer(actor, ev.organizerId)) throw new NotFoundException('Evento no encontrado');
    return ev;
  }

  // Comisión y neto a partir del bruto y el porcentaje del evento. Se calcula en centavos enteros
  // (bruto y porcentaje traen a lo sumo 2 decimales), sin acumular errores de coma flotante.
  private commission(gross: string, pct: string | null) {
    if (pct === null) return { commission: null as string | null, net: null as string | null };
    const grossCents = Math.round(Number(gross) * 100);
    const commissionCents = Math.round((grossCents * Math.round(Number(pct) * 100)) / 10000);
    return { commission: (commissionCents / 100).toFixed(2), net: ((grossCents - commissionCents) / 100).toFixed(2) };
  }

  // ---------- Resumen por evento (página "Ventas") ----------

  async summary(actor: AuthUser, organizerId?: string) {
    const scope: SQL | undefined =
      actor.role === 'SUPERADMIN'
        ? organizerId
          ? eq(event.organizerId, organizerId)
          : undefined
        : eq(event.organizerId, actor.organizerId ?? '00000000-0000-0000-0000-000000000000');

    const events = await this.db
      .select({
        id: event.id,
        name: event.name,
        startsAt: event.startsAt,
        status: event.status,
        commissionPct: event.commissionPct,
        organizerName: organizer.name,
        venueName: venue.name,
      })
      .from(event)
      .innerJoin(organizer, eq(organizer.id, event.organizerId))
      .innerJoin(venue, eq(venue.id, event.venueId))
      .where(scope)
      .orderBy(desc(event.startsAt));

    const ids = events.map((e) => e.id);
    const agg = new Map<string, { paidOrders: number; sold: number; gross: string; pendingOrders: number; pendingAmount: string }>();
    if (ids.length) {
      const rows = await this.db
        .select({
          eventId: order.eventId,
          paidOrders: sql<number>`count(distinct ${order.id}) filter (where ${PAID})::int`,
          sold: sql<number>`coalesce(sum(${orderItem.quantity}) filter (where ${PAID}), 0)::int`,
          gross: sql<string>`coalesce(sum(${lineTotal}) filter (where ${PAID}), 0)::text`,
          pendingOrders: sql<number>`count(distinct ${order.id}) filter (where ${order.status} = 'PENDIENTE_PAGO')::int`,
          pendingAmount: sql<string>`coalesce(sum(${lineTotal}) filter (where ${order.status} = 'PENDIENTE_PAGO'), 0)::text`,
        })
        .from(order)
        .innerJoin(orderItem, eq(orderItem.orderId, order.id))
        .where(inArray(order.eventId, ids))
        .groupBy(order.eventId);
      rows.forEach((r) => agg.set(r.eventId, r));
    }

    const out: SummaryRow[] = [];
    for (const e of events) {
      const a = agg.get(e.id) ?? { paidOrders: 0, sold: 0, gross: '0', pendingOrders: 0, pendingAmount: '0' };
      const c = this.commission(a.gross, e.commissionPct);
      out.push({
        id: e.id, name: e.name, startsAt: e.startsAt, status: e.status, organizerName: e.organizerName, venueName: e.venueName,
        commissionPct: e.commissionPct,
        orders: a.paidOrders, sold: a.sold, gross: money(a.gross), commission: c.commission, net: c.net,
        pendingOrders: a.pendingOrders, pendingAmount: money(a.pendingAmount),
      });
    }

    // Totales: la comisión solo se suma entre eventos que ya tienen porcentaje definido
    const sum = (f: (r: (typeof out)[number]) => number) => out.reduce((s, r) => s + f(r), 0);
    const totals = {
      orders: sum((r) => r.orders),
      sold: sum((r) => r.sold),
      gross: sum((r) => Number(r.gross)).toFixed(2),
      commission: sum((r) => Number(r.commission ?? 0)).toFixed(2),
      net: sum((r) => Number(r.net ?? 0)).toFixed(2),
      eventsWithoutCommission: out.filter((r) => r.commissionPct === null && Number(r.gross) > 0).length,
      pendingAmount: sum((r) => Number(r.pendingAmount)).toFixed(2),
    };

    let reviewCount: number | null = null;
    if (actor.role === 'SUPERADMIN') {
      const [r] = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(payment)
        .where(inArray(payment.status, ['CONFIRMADO_SIN_ORDEN', 'ERROR']));
      reviewCount = r?.n ?? 0;
    }
    return { events: out, totals, reviewCount };
  }

  // ---------- Un evento: totales, por tier, por día ----------

  async eventSales(eventId: string, actor: AuthUser) {
    const ev = await this.managedEvent(eventId, actor);

    const [t] = await this.db
      .select({
        paidOrders: sql<number>`count(distinct ${order.id}) filter (where ${PAID})::int`,
        sold: sql<number>`coalesce(sum(${orderItem.quantity}) filter (where ${PAID}), 0)::int`,
        gross: sql<string>`coalesce(sum(${lineTotal}) filter (where ${PAID}), 0)::text`,
        pendingOrders: sql<number>`count(distinct ${order.id}) filter (where ${order.status} = 'PENDIENTE_PAGO')::int`,
        pendingAmount: sql<string>`coalesce(sum(${lineTotal}) filter (where ${order.status} = 'PENDIENTE_PAGO'), 0)::text`,
        expiredOrders: sql<number>`count(distinct ${order.id}) filter (where ${order.status} = 'EXPIRADA')::int`,
      })
      .from(order)
      .innerJoin(orderItem, eq(orderItem.orderId, order.id))
      .where(eq(order.eventId, eventId));

    const gross = money(t?.gross);
    const c = this.commission(gross, ev.commissionPct);

    // Por tier: lo vendido sale de las líneas de órdenes pagadas (precio congelado al comprar);
    // "asignadas" son los tickets que el organizador puso a la venta en ese tier.
    const tierRows = await this.db
      .select({
        id: tier.id,
        name: tier.name,
        kind: tier.kind,
        price: tier.price,
        sectorName: sector.name,
        assigned: sql<number>`(select count(*) from ticket tk where tk.tier_id = "tier"."id" and tk.status <> 'ANULADO')::int`,
        sold: sql<number>`coalesce((select sum(oi.quantity) from order_item oi join "order" o on o.id = oi.order_id where oi.tier_id = "tier"."id" and o.status = 'PAGADA'), 0)::int`,
        revenue: sql<string>`coalesce((select sum(oi.quantity * oi.unit_price) from order_item oi join "order" o on o.id = oi.order_id where oi.tier_id = "tier"."id" and o.status = 'PAGADA'), 0)::text`,
      })
      .from(tier)
      .innerJoin(sector, eq(sector.id, tier.sectorId))
      .where(and(eq(tier.eventId, eventId), eq(tier.kind, 'VENTA')))
      .orderBy(tier.createdAt);

    // Por día (hora de Bolivia): fecha de creación de la orden pagada
    const dayRows = await this.db
      .select({
        day: sql<string>`to_char(timezone('America/La_Paz', ${order.createdAt}), 'YYYY-MM-DD')`,
        orders: sql<number>`count(distinct ${order.id})::int`,
        sold: sql<number>`sum(${orderItem.quantity})::int`,
        gross: sql<string>`sum(${lineTotal})::text`,
      })
      .from(order)
      .innerJoin(orderItem, eq(orderItem.orderId, order.id))
      .where(and(eq(order.eventId, eventId), PAID))
      .groupBy(sql`1`)
      .orderBy(sql`1 desc`)
      .limit(60);

    return {
      event: { id: ev.id, name: ev.name, status: ev.status, startsAt: ev.startsAt },
      commissionPct: ev.commissionPct,
      totals: {
        orders: t?.paidOrders ?? 0, sold: t?.sold ?? 0, gross, commission: c.commission, net: c.net,
        pendingOrders: t?.pendingOrders ?? 0, pendingAmount: money(t?.pendingAmount), expiredOrders: t?.expiredOrders ?? 0,
      },
      tiers: tierRows.map((r) => ({ ...r, price: money(r.price), revenue: money(r.revenue) })),
      byDay: dayRows.map((r) => ({ ...r, gross: money(r.gross) })),
    };
  }

  // ---------- Órdenes ----------

  private orderWhere(eventId: string, f: OrderFilters): SQL {
    const parts: SQL[] = [eq(order.eventId, eventId)];
    if (f.status) parts.push(eq(order.status, f.status));
    const term = f.q?.trim();
    if (term && term.length >= 2) {
      const like = `%${fold(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      parts.push(
        sql`(${foldedCol(order.buyerName)} like ${like} or ${foldedCol(order.buyerEmail)} like ${like} or ${order.buyerPhone} like ${like} or ${order.id}::text like ${like})`,
      );
    }
    return and(...parts) as SQL;
  }

  private orderRows(where: SQL) {
    return this.db
      .select({
        id: order.id,
        status: order.status,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        buyerPhone: order.buyerPhone,
        createdAt: order.createdAt,
        // Subconsultas con alias explícitos: drizzle omite el prefijo de tabla en selects de una sola
        // tabla y "id" quedaría ambiguo dentro de la subconsulta.
        quantity: sql<number>`(select coalesce(sum(oi.quantity), 0) from order_item oi where oi.order_id = "order"."id")::int`,
        total: sql<string>`(select coalesce(sum(oi.quantity * oi.unit_price), 0) from order_item oi where oi.order_id = "order"."id")::text`,
        items: sql<string>`(select string_agg(oi.quantity || ' × ' || t.name, '; ' order by t.name) from order_item oi join tier t on t.id = oi.tier_id where oi.order_id = "order"."id")`,
        paymentStatus: sql<string | null>`(select p.status from payment p where p.order_id = "order"."id" order by p.created_at desc limit 1)`,
        entered: sql<number>`(select count(*) from ticket tk join order_item oi on oi.id = tk.order_item_id where oi.order_id = "order"."id" and tk.status = 'UTILIZADO')::int`,
      })
      .from(order)
      .where(where)
      .orderBy(desc(order.createdAt), order.id);
  }

  // Referencia corta y legible; el access_token de la orden es un secreto y nunca se expone aquí
  private ref(id: string) {
    return id.slice(0, 8).toUpperCase();
  }

  async listOrders(eventId: string, actor: AuthUser, f: OrderFilters & { limit: number; offset: number }) {
    await this.managedEvent(eventId, actor);
    const where = this.orderWhere(eventId, f);
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)::int` }).from(order).where(where);
    const rows = await this.orderRows(where).limit(f.limit).offset(f.offset);
    return {
      total: n,
      orders: rows.map((r) => ({ ...r, ref: this.ref(r.id), total: money(r.total) })),
    };
  }

  async orderDetail(eventId: string, orderId: string, actor: AuthUser) {
    await this.managedEvent(eventId, actor);
    const [o] = await this.orderRows(and(eq(order.id, orderId), eq(order.eventId, eventId)) as SQL).limit(1);
    if (!o) throw new NotFoundException('Orden no encontrada');
    const [ex] = await this.db.select({ expiresAt: order.expiresAt }).from(order).where(eq(order.id, orderId));

    const items = await this.db
      .select({ tierName: tier.name, quantity: orderItem.quantity, unitPrice: orderItem.unitPrice })
      .from(orderItem)
      .innerJoin(tier, eq(tier.id, orderItem.tierId))
      .where(eq(orderItem.orderId, orderId))
      .orderBy(tier.name);

    const tickets = await this.db
      .select({ id: ticket.id, shortCode: ticket.shortCode, status: ticket.status, tierName: tier.name, sectorName: sector.name })
      .from(ticket)
      .innerJoin(orderItem, eq(orderItem.id, ticket.orderItemId))
      .innerJoin(sector, eq(sector.id, ticket.sectorId))
      .leftJoin(tier, eq(tier.id, ticket.tierId))
      .where(eq(orderItem.orderId, orderId))
      .orderBy(ticket.shortCode);

    const payments = await this.db
      .select({
        id: payment.id, status: payment.status, provider: payment.provider, amount: payment.amount,
        currency: payment.currency, createdAt: payment.createdAt, providerPaymentId: payment.providerPaymentId,
      })
      .from(payment)
      .where(eq(payment.orderId, orderId))
      .orderBy(desc(payment.createdAt));

    return {
      ...o,
      ref: this.ref(o.id),
      total: money(o.total),
      expiresAt: ex?.expiresAt ?? null,
      items: items.map((i) => ({ ...i, unitPrice: money(i.unitPrice), subtotal: (Number(i.unitPrice) * i.quantity).toFixed(2) })),
      tickets,
      // El identificador del banco es dato de conciliación: solo lo ve el superadmin
      payments: payments.map((p) => ({
        ...p, amount: money(p.amount), providerPaymentId: actor.role === 'SUPERADMIN' ? p.providerPaymentId : null,
      })),
    };
  }

  // ---------- Exportación a Excel (CSV) ----------

  async exportCsv(eventId: string, actor: AuthUser, f: OrderFilters) {
    const ev = await this.managedEvent(eventId, actor);
    const rows = await this.orderRows(this.orderWhere(eventId, f)).limit(20000);

    // Los nombres los escribe el comprador: una celda que empiece con = + - @ sería una fórmula en Excel
    const cell = (v: unknown) => {
      let s = v === null || v === undefined ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const when = (d: Date) =>
      new Date(d.getTime() - 4 * 3600_000).toISOString().slice(0, 16).replace('T', ' '); // Bolivia: UTC-4 fijo
    const STATUS: Record<string, string> = { PAGADA: 'Pagada', PENDIENTE_PAGO: 'Pendiente de pago', EXPIRADA: 'Expirada' };

    const header = ['Referencia', 'Fecha', 'Comprador', 'Correo', 'Teléfono', 'Estado', 'Entradas', 'Detalle', 'Total (Bs)', 'Ya ingresaron'];
    const lines = [header.map(cell).join(';')];
    for (const r of rows) {
      lines.push(
        [this.ref(r.id), when(r.createdAt), r.buyerName, r.buyerEmail, r.buyerPhone, STATUS[r.status] ?? r.status, r.quantity, r.items ?? '', money(r.total), r.entered]
          .map(cell)
          .join(';'),
      );
    }
    // BOM + punto y coma: Excel en español lo abre en columnas y con tildes correctas
    void ev;
    return '﻿' + lines.join('\r\n') + '\r\n';
  }

  // ---------- Pagos por revisar (superadmin) ----------

  async reviewPayments() {
    const rows = await this.db
      .select({
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        provider: payment.provider,
        providerPaymentId: payment.providerPaymentId,
        createdAt: payment.createdAt,
        orderId: order.id,
        orderStatus: order.status,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        buyerPhone: order.buyerPhone,
        eventId: event.id,
        eventName: event.name,
        organizerName: organizer.name,
      })
      .from(payment)
      .innerJoin(order, eq(order.id, payment.orderId))
      .innerJoin(event, eq(event.id, order.eventId))
      .innerJoin(organizer, eq(organizer.id, event.organizerId))
      .where(inArray(payment.status, ['CONFIRMADO_SIN_ORDEN', 'ERROR']))
      .orderBy(desc(payment.createdAt))
      .limit(200);
    return rows.map((r) => ({ ...r, ref: this.ref(r.orderId), amount: money(r.amount) }));
  }
}
