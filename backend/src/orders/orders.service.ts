import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { event, eventTable, orderTable, tableHold, sector, seat, sectorTable, tablePackage, tier, order, orderItem, payment, ticket, venue } from '../db/index.js';
import { MAX_SEATS_PER_ORDER } from '../events/inventory.js';
import { MAX_TABLES_PER_ORDER } from '../events/mesas.js';
import { chooseTables, freeOf, loadFlexTables, splitPeople } from '../events/mesas-flex.js';
import { seatLabel, seatLabelOrNull } from '../events/seat-label.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import { expireOrder } from './expire-order.js';
import { TERMS_VERSION } from './terms.js';
import { paymentInfo, reviewHoldHours } from '../payments/manual-payment.js';

// Del pago, el comprador solo ve estado, monto y (si lo rechazaron) el motivo. Los datos que declaró
// y quién lo revisó son del superadmin.
const publicPayment = (p: { id: string; status: string; amount: string; currency: string; createdAt: Date; declaredAt: Date | null; reviewNote: string | null }) => ({
  id: p.id,
  status: p.status,
  amount: p.amount,
  currency: p.currency,
  createdAt: p.createdAt,
  declaredAt: p.declaredAt,
  rejectionReason: p.status === 'RECHAZADO' ? p.reviewNote : null,
});

const RESERVATION_MINUTES = 15;
const RECONCILIATION_HOURS = 2;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue('order-expiration') private readonly expirationQueue: Queue,
  ) {}

  private async runCreateOrderTransaction(dto: CreateOrderDto, buyerId: string | null) {
    const [eventRow] = await this.db.select().from(event).where(eq(event.id, dto.eventId)).limit(1);
    if (!eventRow) throw new NotFoundException('Evento no encontrado');
    if (eventRow.status !== 'ACTIVO') {
      throw new BadRequestException('El evento no está activo para venta');
    }

    // Una línea por tier: si el comprador repite un tier se suman las cantidades
    // (OrderItem es UNIQUE(order_id, tier_id)).
    const wanted = new Map<string, number>();
    for (const item of dto.items ?? []) {
      wanted.set(item.tierId, (wanted.get(item.tierId) ?? 0) + item.quantity);
    }
    const seatIds = [...new Set(dto.seatIds ?? [])];
    const tablesWanted = new Set((dto.tables ?? []).map((t) => t.tableId));

    if (wanted.size === 0 && seatIds.length === 0 && tablesWanted.size === 0) {
      throw new BadRequestException('Elige al menos una entrada o una mesa');
    }
    if (tablesWanted.size > MAX_TABLES_PER_ORDER) {
      throw new BadRequestException(`Puedes reservar hasta ${MAX_TABLES_PER_ORDER} mesas por compra`);
    }
    if (tablesWanted.size > 0 && eventRow.seatingMode !== 'MESAS_FIJAS') {
      throw new BadRequestException('Este evento no vende mesas');
    }
    const tableRequest = dto.tableRequest;
    if (tableRequest && eventRow.seatingMode !== 'MESAS_FLEXIBLES') {
      throw new BadRequestException('Este evento no reserva mesas por grupo');
    }
    if (seatIds.length > MAX_SEATS_PER_ORDER) {
      throw new BadRequestException(`Puedes elegir hasta ${MAX_SEATS_PER_ORDER} asientos por compra`);
    }
    if (seatIds.length > 0 && eventRow.seatingMode !== 'BUTACAS') {
      throw new BadRequestException('Este evento no vende por asiento');
    }

    // Toda la reserva es una única transacción: si cualquier línea falla,
    // ninguna queda reservada (invariante: no hay orden parcialmente reservada).
    return this.db.transaction(async (tx) => {
      // Reserva por grupo: se serializa por evento para que dos grupos no reciban la misma mesa.
      // Orden de bloqueos en toda la app: evento → tiers → tickets.
      if (tableRequest) await tx.select({ id: event.id }).from(event).where(eq(event.id, dto.eventId)).for('update');

      // Mesas fijas: cada mesa es su paquete; se compran todos sus asientos a la vez
      const mesaIds = [...tablesWanted];
      const mesas =
        mesaIds.length > 0
          ? await tx
              .select({
                tableId: eventTable.tableId,
                tierId: eventTable.tierId,
                label: sectorTable.label,
                packageName: tablePackage.name,
                people: tablePackage.people,
                price: tablePackage.price,
                bottleOptions: tablePackage.bottleOptions,
              })
              .from(eventTable)
              .innerJoin(tablePackage, eq(tablePackage.id, eventTable.packageId))
              .innerJoin(sectorTable, eq(sectorTable.id, eventTable.tableId))
              .where(and(eq(eventTable.eventId, dto.eventId), inArray(eventTable.tableId, mesaIds)))
          : [];
      if (mesas.length !== mesaIds.length) {
        throw new BadRequestException('Alguna mesa no está a la venta en este evento');
      }
      const mesaSeats =
        mesaIds.length > 0
          ? await tx.select({ id: seat.id, tableId: seat.tableId }).from(seat).where(and(inArray(seat.tableId, mesaIds), eq(seat.active, true)))
          : [];
      for (const m of mesas) {
        if (mesaSeats.filter((x) => x.tableId === m.tableId).length !== m.people) {
          throw new ConflictException({ message: `La mesa ${m.label} cambió: ya no está disponible`, unavailableTableIds: [m.tableId] });
        }
      }
      const allSeatIds = [...new Set([...seatIds, ...mesaSeats.map((x) => x.id)])];
      const expectedTier = new Map(mesaSeats.map((x) => [x.id, mesas.find((m) => m.tableId === x.tableId)!.tierId]));

      // Asientos elegidos: de ahí sale a qué tiers pertenecen (y, para los mensajes, su etiqueta)
      const seatRows =
        allSeatIds.length > 0
          ? await tx
              .select({
                ticketId: ticket.id,
                seatId: ticket.seatId,
                tierId: ticket.tierId,
                rowLabel: seat.rowLabel,
                label: seat.label,
                tableLabel: sectorTable.label,
              })
              .from(ticket)
              .innerJoin(seat, eq(seat.id, ticket.seatId))
              .leftJoin(sectorTable, eq(sectorTable.id, seat.tableId))
              .where(and(eq(ticket.eventId, dto.eventId), inArray(ticket.seatId, allSeatIds)))
          : [];
      if (seatRows.length !== allSeatIds.length) {
        throw new BadRequestException('Algún asiento no existe en este evento');
      }

      // Se bloquean TODOS los tiers involucrados en orden de id: dos compras simultáneas
      // nunca se esperan en círculo. Luego se bloquean los tickets (mismo orden en todo el código).
      const tierIds = [
        ...new Set([
          ...wanted.keys(),
          ...seatRows.map((r) => r.tierId).filter((id): id is string => id !== null),
        ]),
      ].sort();

      const tiersById = new Map<string, typeof tier.$inferSelect>();
      for (const tierId of tierIds) {
        // FOR UPDATE sobre el tier: serializa a los compradores del mismo
        // tier (y también a "asignar" y "emitir cortesía"), de modo que dos
        // compras simultáneas nunca elijan los mismos tickets.
        const [t] = await tx.select().from(tier).where(eq(tier.id, tierId)).for('update').limit(1);

        if (!t) throw new BadRequestException(`Tier ${tierId} no encontrado`);

        // Invariante: todos los tiers de la Order pertenecen al mismo Event.
        if (t.eventId !== dto.eventId) {
          throw new BadRequestException(`El tier ${tierId} no pertenece al evento ${dto.eventId}`);
        }
        if (t.kind !== 'VENTA') {
          throw new BadRequestException(`El tier "${t.name}" no está a la venta`);
        }

        const now = new Date();
        if (
          t.isPaused ||
          (t.startsAt !== null && now < t.startsAt) ||
          (t.endsAt !== null && now >= t.endsAt)
        ) {
          throw new BadRequestException(`El tier "${t.name}" no está disponible para compra`);
        }
        tiersById.set(tierId, t);
      }

      const reserved = new Map<string, string[]>(); // tierId → tickets elegidos

      for (const [tierId, quantity] of wanted) {
        const t = tiersById.get(tierId)!;

        // El stock ES el conjunto de tickets DISPONIBLE del tier. Los tickets con asiento
        // quedan fuera: solo se venden eligiendo ese asiento.
        const available = await tx
          .select({ id: ticket.id })
          .from(ticket)
          .where(and(eq(ticket.tierId, tierId), eq(ticket.status, 'DISPONIBLE'), sql`${ticket.seatId} IS NULL`))
          .orderBy(ticket.shortCode)
          .limit(quantity)
          .for('update');

        if (available.length < quantity) {
          const [{ n }] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(ticket)
            .where(and(eq(ticket.tierId, tierId), eq(ticket.status, 'DISPONIBLE'), sql`${ticket.seatId} IS NULL`));
          throw new BadRequestException(
            `Stock insuficiente para "${t.name}": quedan ${n}, se pidieron ${quantity}`,
          );
        }
        reserved.set(tierId, available.map((a) => a.id));
      }

      if (seatRows.length > 0) {
        // Bloqueo de los tickets de los asientos elegidos (orden por id) y verificación bajo bloqueo
        const locked = await tx
          .select({ id: ticket.id, seatId: ticket.seatId, status: ticket.status, tierId: ticket.tierId })
          .from(ticket)
          .where(inArray(ticket.id, seatRows.map((r) => r.ticketId)))
          .orderBy(ticket.id)
          .for('update');

        const labelBySeat = new Map(seatRows.map((r) => [r.seatId, seatLabel(r)]));
        const unavailable = locked.filter(
          (r) =>
            r.status !== 'DISPONIBLE' ||
            r.tierId === null ||
            !tiersById.has(r.tierId) ||
            (expectedTier.has(r.seatId!) && expectedTier.get(r.seatId!) !== r.tierId),
        );
        const badTables = mesas.filter((m) => unavailable.some((u) => mesaSeats.find((x) => x.id === u.seatId)?.tableId === m.tableId));
        if (badTables.length > 0) {
          throw new ConflictException({
            message: `Ya no están disponibles: ${badTables.map((m) => `Mesa ${m.label}`).join(', ')}`,
            unavailableTableIds: badTables.map((m) => m.tableId),
          });
        }
        if (unavailable.length > 0) {
          throw new ConflictException({
            message: `Ya no están disponibles: ${unavailable.map((r) => labelBySeat.get(r.seatId)).join(', ')}`,
            unavailableSeatIds: unavailable.map((r) => r.seatId),
          });
        }
        for (const r of locked) {
          reserved.set(r.tierId!, [...(reserved.get(r.tierId!) ?? []), r.id]);
        }
      }

      // Mesas flexibles: el grupo no puede ser mayor que sus entradas de ese sector
      let flexPlan: { table: { id: string; label: string }; people: number }[] = [];
      if (tableRequest) {
        const inSector = [...reserved].reduce(
          (n, [tierId, ids]) => n + (tiersById.get(tierId)!.sectorId === tableRequest.sectorId ? ids.length : 0),
          0,
        );
        if (inSector < tableRequest.people) {
          throw new BadRequestException(
            `Para reservar mesa para ${tableRequest.people} personas necesitas al menos ${tableRequest.people} entradas de ese sector (tienes ${inSector})`,
          );
        }
        const rows = await loadFlexTables(tx, dto.eventId, eventRow.venueId, tableRequest.sectorId);
        const chosen = chooseTables(freeOf(rows), tableRequest.people);
        if (!chosen) {
          throw new ConflictException({
            message: `No hay mesa disponible para ${tableRequest.people} personas en este sector. Puedes comprar solo las entradas.`,
            noTableAvailable: true,
          });
        }
        flexPlan = splitPeople(chosen, tableRequest.people);
      }

      const reservedItems = [...reserved].map(([tierId, ticketIds]) => ({
        tierId,
        quantity: ticketIds.length,
        unitPrice: tiersById.get(tierId)!.price, // precio congelado al momento de la reserva
        ticketIds,
      }));

      const totalAmount = reservedItems
        .reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0)
        .toFixed(2);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
      const reconciliationExpiresAt = new Date(now.getTime() + RECONCILIATION_HOURS * 3_600_000);

      const [createdOrder] = await tx
        .insert(order)
        .values({
          eventId: dto.eventId,
          // Los datos del comprador se piden en la pantalla de pago (al avisar "ya pagué");
          // hasta entonces quedan vacíos. Si el cliente los manda igual, se guardan.
          buyerName: dto.buyerName ?? '',
          buyerEmail: dto.buyerEmail ?? '',
          buyerPhone: dto.buyerPhone ?? '',
          status: 'PENDIENTE_PAGO',
          expiresAt,
          buyerId,
          ...(dto.acceptTerms ? { termsAcceptedAt: now, termsVersion: TERMS_VERSION } : {}),
        })
        .returning();

      const createdItems = await tx
        .insert(orderItem)
        .values(
          reservedItems.map((i) => ({
            orderId: createdOrder.id,
            tierId: i.tierId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        )
        .returning();

      // Reserva concreta: cada ticket elegido pasa a RESERVADO y queda
      // enlazado a su línea de la orden.
      for (const item of createdItems) {
        const picked = reservedItems.find((r) => r.tierId === item.tierId)!;
        await tx
          .update(ticket)
          .set({ status: 'RESERVADO', orderItemId: item.id })
          .where(inArray(ticket.id, picked.ticketIds));
      }

      // Mesas flexibles: se aparta la mesa y queda el voucher (sin precio: el consumo mínimo se paga en el local)
      if (flexPlan.length > 0) {
        await tx.insert(tableHold).values(
          flexPlan.map((f) => ({ eventId: dto.eventId, tableId: f.table.id, orderId: createdOrder.id, people: f.people })),
        );
        await tx.insert(orderTable).values(
          flexPlan.map((f) => ({
            orderId: createdOrder.id,
            tableId: f.table.id,
            packageName: 'Reserva de mesa',
            people: f.people,
            price: '0.00',
            bottle: 'Consumo mínimo: 1 botella, se paga en el local',
          })),
        );
      }

      // Voucher de mesa: paquete, personas, precio y botella quedan congelados en la orden
      if (mesas.length > 0) {
        await tx.insert(orderTable).values(
          mesas.map((m) => ({
            orderId: createdOrder.id,
            tableId: m.tableId,
            packageName: m.packageName,
            people: m.people,
            price: m.price,
            // Solo informativo: la botella se elige en el local, no al comprar
            bottle: m.bottleOptions.length > 0 ? m.bottleOptions.join(' / ') : null,
          })),
        );
      }

      // Payment PENDIENTE, sin providerPaymentId todavía — la llamada real a
      // la API de BNB para generar el QR es responsabilidad de PaymentsModule
      // (no existe aún). Acá solo se deja el registro listo para que ese
      // módulo lo tome y complete providerPaymentId cuando el banco responda.
      const [createdPayment] = await tx
        .insert(payment)
        .values({
          orderId: createdOrder.id,
          status: 'PENDIENTE',
          provider: 'MANUAL',
          amount: totalAmount,
          reconciliationExpiresAt,
        })
        .returning();

      return {
        order: createdOrder,
        items: reservedItems.map(({ tierId, quantity, unitPrice }) => ({ tierId, quantity, unitPrice })),
        payment: createdPayment,
      };
    });
  }

  async createOrder(dto: CreateOrderDto, buyerId: string | null = null) {
    const result = await this.runCreateOrderTransaction(dto, buyerId);

    // jobId = order.id: si por algún motivo este método se llamara dos
    // veces para la misma orden, BullMQ deduplica y no crea un segundo job.
    await this.expirationQueue.add(
      'expire-order',
      { orderId: result.order.id },
      { delay: RESERVATION_MINUTES * 60_000, jobId: result.order.id },
    );

    return { ...result, payment: publicPayment(result.payment) };
  }

  async getOrderByToken(accessToken: string) {
    const [foundOrder] = await this.db
      .select()
      .from(order)
      .where(eq(order.accessToken, accessToken))
      .limit(1);

    if (!foundOrder) throw new NotFoundException('Orden no encontrada');

    const items = await this.db
      .select()
      .from(orderItem)
      .where(eq(orderItem.orderId, foundOrder.id));

    const payments = await this.db
      .select()
      .from(payment)
      .where(eq(payment.orderId, foundOrder.id));

    // Tickets generados (si la Order ya está PAGADA). Se traen con el
    // nombre del Tier para que el frontend no tenga que hacer otro request.
    const itemIds = items.map((i) => i.id);
    const tickets =
      itemIds.length > 0
        ? await this.db
            .select({
              id: ticket.id,
              shortCode: ticket.shortCode,
              status: ticket.status,
              orderItemId: ticket.orderItemId,
              tierId: ticket.tierId,
              tierName: tier.name,
              sectorName: sector.name,
              seatLabel: seat.label,
              rowLabel: seat.rowLabel,
              tableLabel: sectorTable.label,
            })
            .from(ticket)
            .innerJoin(tier, eq(ticket.tierId, tier.id))
            .innerJoin(sector, eq(ticket.sectorId, sector.id))
            .leftJoin(seat, eq(seat.id, ticket.seatId))
            .leftJoin(sectorTable, eq(sectorTable.id, seat.tableId))
            .where(inArray(ticket.orderItemId, itemIds))
        : [];
    // Ubicación legible del asiento ("Fila C · 12", "Mesa 4 · B"); null si la entrada no tiene asiento
    const ticketsOut = tickets.map(({ seatLabel: sl, rowLabel, tableLabel, ...t }) => ({
      ...t,
      seat: seatLabelOrNull({ seatLabel: sl, rowLabel, tableLabel }),
    }));

    // Datos del evento para dibujar el ticket en el frontend
    const [ev] = await this.db.select().from(event).where(eq(event.id, foundOrder.eventId)).limit(1);
    const [ven] = ev
      ? await this.db.select().from(venue).where(eq(venue.id, ev.venueId)).limit(1)
      : [];

    // Mesas reservadas (voucher): se muestra tal cual, sin QR ni escaneo
    const mesaRows = await this.db
      .select({
        packageName: orderTable.packageName,
        people: orderTable.people,
        price: orderTable.price,
        bottle: orderTable.bottle,
        tableLabel: sectorTable.label,
        sectorName: sector.name,
      })
      .from(orderTable)
      .innerJoin(sectorTable, eq(sectorTable.id, orderTable.tableId))
      .innerJoin(sector, eq(sector.id, sectorTable.sectorId))
      .where(eq(orderTable.orderId, foundOrder.id));

    return {
      ...foundOrder,
      items,
      payments: payments.map(publicPayment),
      paymentInfo: paymentInfo(),
      reviewHoldHours: reviewHoldHours(),
      tickets: ticketsOut,
      tables: mesaRows,
      event: ev ? { id: ev.id, name: ev.name, startsAt: ev.startsAt, endsAt: ev.endsAt, venueName: ven?.name ?? null, tableValidUntil: ev.tableValidUntil } : null,
    };
  }

  // Llamado por el worker de BullMQ (OrderExpirationProcessor) cuando se cumplen los 15 min de la
  // reserva. Idempotente: si la Order ya no está PENDIENTE_PAGO (se pagó o ya expiró antes), no hace
  // nada. Si el comprador ya avisó su pago (EN_REVISION) tampoco libera, salvo `force` (fin del plazo
  // máximo de revisión).
  async expireOrderIfStillPending(orderId: string, opts: { force?: boolean } = {}): Promise<{ expired: boolean }> {
    return expireOrder(this.db, orderId, opts);
  }
}
