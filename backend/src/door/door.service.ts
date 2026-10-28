import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { access, courtesy, event, order, orderItem, organizer, sector, staffEvent, ticket, tier, user, venue } from '../db/index.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { canManageOrganizer, type AuthUser } from '../auth/access.js';

// Un evento sigue "abierto para puerta" hasta 24 h después de terminar (por si se alarga o hay reingresos)
const DOOR_GRACE_MS = 24 * 3600 * 1000;

@Injectable()
export class DoorService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLog: AuditLogService,
  ) {}

  private async getManagedEvent(eventId: string, actor: AuthUser) {
    const [ev] = await this.db.select().from(event).where(eq(event.id, eventId)).limit(1);
    if (!ev || !canManageOrganizer(actor, ev.organizerId)) throw new NotFoundException('Evento no encontrado');
    return ev;
  }

  // ---------- Administración: quién trabaja la puerta de este evento ----------

  async overview(eventId: string, actor: AuthUser) {
    const ev = await this.getManagedEvent(eventId, actor);

    const assigned = await this.db
      .select({ id: user.id, name: user.name, email: user.email, isActive: user.isActive, organizerName: organizer.name })
      .from(staffEvent)
      .innerJoin(user, eq(user.id, staffEvent.userId))
      .leftJoin(organizer, eq(organizer.id, user.organizerId))
      .where(eq(staffEvent.eventId, eventId))
      .orderBy(user.name);

    // Candidatos: personal aprobado y activo, del organizador del evento. El personal
    // de Rocktickets (sin organizador) solo lo puede asignar el superadmin.
    const eligibility =
      actor.role === 'SUPERADMIN'
        ? sql`(${user.organizerId} = ${ev.organizerId} or ${user.organizerId} is null)`
        : sql`${user.organizerId} = ${ev.organizerId}`;
    const candidates = await this.db
      .select({ id: user.id, name: user.name, email: user.email, organizerName: organizer.name })
      .from(user)
      .leftJoin(organizer, eq(organizer.id, user.organizerId))
      .where(and(eq(user.role, 'STAFF_PUERTA'), eq(user.approvalStatus, 'APROBADO'), eq(user.isActive, true), eligibility))
      .orderBy(user.name);
    const taken = new Set(assigned.map((a) => a.id));

    return { status: ev.status, assigned, available: candidates.filter((c) => !taken.has(c.id)) };
  }

  async assign(eventId: string, userId: string, actor: AuthUser) {
    const ev = await this.getManagedEvent(eventId, actor);
    if (ev.status === 'CANCELADO') throw new BadRequestException('El evento está cancelado');

    const [staff] = await this.db.select().from(user).where(and(eq(user.id, userId), eq(user.role, 'STAFF_PUERTA'))).limit(1);
    const ownStaff = staff && staff.organizerId === ev.organizerId;
    const platformStaff = staff && staff.organizerId === null && actor.role === 'SUPERADMIN';
    if (!staff || !(ownStaff || platformStaff)) throw new NotFoundException('Personal no encontrado');
    if (staff.approvalStatus !== 'APROBADO' || !staff.isActive) {
      throw new BadRequestException('Esta cuenta todavía no está aprobada o está sin acceso');
    }

    await this.db.insert(staffEvent).values({ userId, eventId, assignedBy: actor.sub }).onConflictDoNothing();
    await this.auditLog.log(actor.sub, 'DOOR_STAFF_ASSIGNED', 'Event', eventId, { userId });
    return { ok: true };
  }

  async unassign(eventId: string, userId: string, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    await this.db.delete(staffEvent).where(and(eq(staffEvent.eventId, eventId), eq(staffEvent.userId, userId)));
    await this.auditLog.log(actor.sub, 'DOOR_STAFF_UNASSIGNED', 'Event', eventId, { userId });
    return { ok: true };
  }

  // ---------- Lo que usa la app de puerta ----------

  private async counts(eventIds: string[]) {
    const out = new Map<string, { expected: number; entered: number }>();
    if (eventIds.length === 0) return out;
    const rows = await this.db
      .select({
        eventId: ticket.eventId,
        expected: sql<number>`count(*) filter (where ${ticket.status} in ('VALIDO','UTILIZADO'))::int`,
        entered: sql<number>`count(*) filter (where ${ticket.status} = 'UTILIZADO')::int`,
      })
      .from(ticket)
      .where(inArray(ticket.eventId, eventIds))
      .groupBy(ticket.eventId);
    rows.forEach((r) => out.set(r.eventId, { expected: r.expected, entered: r.entered }));
    return out;
  }

  // Eventos que este usuario puede trabajar en puerta (no cancelados, vigentes)
  async myEvents(actor: AuthUser) {
    const since = new Date(Date.now() - DOOR_GRACE_MS);
    const base = and(ne(event.status, 'CANCELADO'), gte(event.endsAt, since));
    const rows =
      actor.role === 'SUPERADMIN'
        ? await this.db
            .select({ ev: event, venueName: venue.name })
            .from(event)
            .innerJoin(venue, eq(venue.id, event.venueId))
            .where(base)
            .orderBy(event.startsAt)
        : await this.db
            .select({ ev: event, venueName: venue.name })
            .from(staffEvent)
            .innerJoin(event, eq(event.id, staffEvent.eventId))
            .innerJoin(venue, eq(venue.id, event.venueId))
            .where(and(eq(staffEvent.userId, actor.sub), base))
            .orderBy(event.startsAt);

    const counts = await this.counts(rows.map((r) => r.ev.id));
    return rows.map((r) => ({
      id: r.ev.id,
      name: r.ev.name,
      startsAt: r.ev.startsAt,
      endsAt: r.ev.endsAt,
      venueName: r.venueName,
      expected: counts.get(r.ev.id)?.expected ?? 0,
      entered: counts.get(r.ev.id)?.entered ?? 0,
    }));
  }

  async myEvent(eventId: string, actor: AuthUser) {
    const all = await this.myEvents(actor);
    const found = all.find((e) => e.id === eventId);
    if (!found) throw new NotFoundException('Evento no encontrado');
    return found;
  }

  // Últimos escaneos de ESTE usuario en el evento (los rechazos sin ticket real no se guardan)
  async myHistory(actor: AuthUser, eventId: string, limit: number) {
    await this.myEvent(eventId, actor);
    const rows = await this.db
      .select({
        id: access.id,
        result: access.result,
        scannedAt: access.scannedAt,
        method: access.method,
        shortCode: ticket.shortCode,
        tierName: tier.name,
        sectorName: sector.name,
        buyerName: order.buyerName,
        recipientName: courtesy.recipientName,
      })
      .from(access)
      .innerJoin(ticket, eq(ticket.id, access.ticketId))
      .leftJoin(tier, eq(tier.id, ticket.tierId))
      .leftJoin(sector, eq(sector.id, ticket.sectorId))
      .leftJoin(orderItem, eq(orderItem.id, ticket.orderItemId))
      .leftJoin(order, eq(order.id, orderItem.orderId))
      .leftJoin(courtesy, eq(courtesy.id, ticket.courtesyId))
      .where(and(eq(access.performedBy, actor.sub), eq(ticket.eventId, eventId)))
      .orderBy(desc(access.scannedAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      result: r.result,
      scannedAt: r.scannedAt,
      method: r.method,
      shortCode: r.shortCode,
      tierName: r.tierName,
      sectorName: r.sectorName,
      holder: r.recipientName ?? r.buyerName ?? null,
    }));
  }

  // Búsqueda manual (QR dañado, pantalla rota, "perdí mi entrada"): por nombre del comprador/invitado
  // o por código corto, solo entre entradas vigentes de ESTE evento.
  async search(actor: AuthUser, eventId: string, q: string) {
    await this.myEvent(eventId, actor);
    const term = q.trim();
    if (term.length < 2) throw new BadRequestException('Escribe al menos 2 letras');
    // Sin tildes ni mayúsculas: "maria" encuentra "María", "nunez" a "Núñez"
    const fold = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const like = `%${fold(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const folded = (col: unknown) => sql`translate(lower(${col}), 'áéíóúüñ', 'aeiouun')`;

    const rows = await this.db
      .select({
        id: ticket.id,
        shortCode: ticket.shortCode,
        status: ticket.status,
        tierName: tier.name,
        sectorName: sector.name,
        buyerName: order.buyerName,
        recipientName: courtesy.recipientName,
      })
      .from(ticket)
      .innerJoin(sector, eq(sector.id, ticket.sectorId))
      .leftJoin(tier, eq(tier.id, ticket.tierId))
      .leftJoin(orderItem, eq(orderItem.id, ticket.orderItemId))
      .leftJoin(order, eq(order.id, orderItem.orderId))
      .leftJoin(courtesy, eq(courtesy.id, ticket.courtesyId))
      .where(
        and(
          eq(ticket.eventId, eventId),
          inArray(ticket.status, ['VALIDO', 'UTILIZADO']),
          or(
            sql`${folded(order.buyerName)} like ${like}`,
            sql`${folded(courtesy.recipientName)} like ${like}`,
            sql`${folded(ticket.shortCode)} like ${like}`,
          ),
        ),
      )
      .orderBy(sql`coalesce(${courtesy.recipientName}, ${order.buyerName})`, ticket.shortCode)
      .limit(25);

    return rows.map((r) => ({
      id: r.id,
      shortCode: r.shortCode,
      status: r.status,
      tierName: r.tierName,
      sectorName: r.sectorName,
      kind: r.recipientName ? 'CORTESIA' : 'VENTA',
      holder: r.recipientName ?? r.buyerName ?? null,
    }));
  }

  // Lista descargable para validar sin conexión. Solo lo imprescindible, con claves cortas
  // para que un evento grande pese poco: id, código, estado, titular, tier, sector, tipo, hora de ingreso.
  async manifest(actor: AuthUser, eventId: string) {
    await this.myEvent(eventId, actor);
    const firstIn = sql<string | null>`(select min(${access.scannedAt}) from ${access} where ${access.ticketId} = ${ticket.id} and ${access.result} = 'ADMITIDO')`;
    const rows = await this.db
      .select({
        id: ticket.id,
        shortCode: ticket.shortCode,
        status: ticket.status,
        tierName: tier.name,
        sectorName: sector.name,
        buyerName: order.buyerName,
        recipientName: courtesy.recipientName,
        usedAt: firstIn,
      })
      .from(ticket)
      .innerJoin(sector, eq(sector.id, ticket.sectorId))
      .leftJoin(tier, eq(tier.id, ticket.tierId))
      .leftJoin(orderItem, eq(orderItem.id, ticket.orderItemId))
      .leftJoin(order, eq(order.id, orderItem.orderId))
      .leftJoin(courtesy, eq(courtesy.id, ticket.courtesyId))
      .where(
        and(
          eq(ticket.eventId, eventId),
          or(
            inArray(ticket.status, ['VALIDO', 'UTILIZADO']),
            and(eq(ticket.status, 'ANULADO'), or(sql`${ticket.orderItemId} is not null`, sql`${ticket.courtesyId} is not null`)),
          ),
        ),
      );

    const code = { VALIDO: 'V', UTILIZADO: 'U', ANULADO: 'A' } as Record<string, string>;
    return {
      generatedAt: new Date().toISOString(),
      tickets: rows.map((r) => ({
        id: r.id,
        c: r.shortCode,
        s: code[r.status] ?? 'A',
        h: r.recipientName ?? r.buyerName ?? null,
        t: r.tierName,
        x: r.sectorName,
        k: r.recipientName ? 'C' : 'V',
        u: r.usedAt ? new Date(r.usedAt).toISOString() : null,
      })),
    };
  }
}
