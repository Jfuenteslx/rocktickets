import { BadRequestException, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { courtesy, event, sector, ticket, tier } from '../db/index.js';

// Lógica de inventario en funciones puras sobre `db`, SIN depender de Nest:
// la usan tanto la API (EventsService) como el panel AdminJS, que vive
// fuera del árbol de inyección. Una sola implementación, dos puertas de entrada.
//
// Concurrencia: toda operación que mueve tickets de/hacia un tier primero
// bloquea la fila del tier (FOR UPDATE). Así "asignar", "liberar", "emitir
// cortesía" y "reservar por compra" se serializan por tier y nunca se pisan.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0/I/1: se confunden a mano

function newShortCode(): string {
  let code = 'RT-';
  for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export interface GenerateResult {
  created: number;
  venueCapacity: number;
  bySector: { sectorId: string; sector: string; capacity: number; existing: number; created: number }[];
}

// "Generar tickets": crea los tickets que FALTAN para llenar la capacidad de
// cada sector del venue. Se puede volver a correr: no duplica lo existente
// (cuenta TODOS los tickets del sector, incluidos los ANULADOS, para que
// anular un ticket no "libere" un cupo físico).
export async function generateTicketsForEvent(db: Database, eventId: string): Promise<GenerateResult> {
  return db.transaction(async (tx) => {
    // Bloquea el evento: dos "Generar" simultáneos se serializan y el segundo
    // ya ve lo creado por el primero.
    const [ev] = await tx.select().from(event).where(eq(event.id, eventId)).for('update').limit(1);
    if (!ev) throw new NotFoundException('Evento no encontrado');
    if (ev.status !== 'ACTIVO') throw new BadRequestException('El evento está cancelado');

    const sectors = await tx.select().from(sector).where(eq(sector.venueId, ev.venueId));
    if (sectors.length === 0) {
      throw new BadRequestException('El venue no tiene sectores: créalos primero');
    }

    const existing = await tx
      .select({ sectorId: ticket.sectorId, shortCode: ticket.shortCode })
      .from(ticket)
      .where(eq(ticket.eventId, eventId));

    const usedCodes = new Set(existing.map((t) => t.shortCode));
    const countBySector = new Map<string, number>();
    for (const t of existing) countBySector.set(t.sectorId, (countBySector.get(t.sectorId) ?? 0) + 1);

    const rows: (typeof ticket.$inferInsert)[] = [];
    const bySector: GenerateResult['bySector'] = [];

    for (const s of sectors) {
      const have = countBySector.get(s.id) ?? 0;
      const missing = Math.max(0, s.capacity - have);
      for (let i = 0; i < missing; i++) {
        let code = newShortCode();
        let attempts = 0;
        while (usedCodes.has(code)) {
          if (++attempts > 1000) throw new Error('No se pudo generar un short_code único');
          code = newShortCode();
        }
        usedCodes.add(code);
        rows.push({ eventId, sectorId: s.id, shortCode: code });
      }
      bySector.push({ sectorId: s.id, sector: s.name, capacity: s.capacity, existing: have, created: missing });
    }

    for (let i = 0; i < rows.length; i += 500) {
      await tx.insert(ticket).values(rows.slice(i, i + 500));
    }

    return {
      created: rows.length,
      venueCapacity: sectors.reduce((sum, s) => sum + s.capacity, 0),
      bySector,
    };
  });
}

async function lockTier(tx: Parameters<Parameters<Database['transaction']>[0]>[0], tierId: string) {
  const [t] = await tx.select().from(tier).where(eq(tier.id, tierId)).for('update').limit(1);
  if (!t) throw new NotFoundException('Tier no encontrado');
  const [ev] = await tx.select().from(event).where(eq(event.id, t.eventId)).limit(1);
  if (ev!.status !== 'ACTIVO') throw new BadRequestException('El evento está cancelado');
  return t;
}

// quantity > 0: toma tickets sin tier del mismo sector y los asigna al tier.
// quantity < 0: devuelve al "pool sin tier" tickets DISPONIBLES de este tier.
// Un ticket reservado/vendido/regalado nunca se mueve.
export async function assignTicketsToTier(
  db: Database,
  tierId: string,
  quantity: number,
): Promise<{ moved: number; availableInTier: number }> {
  if (!Number.isInteger(quantity) || quantity === 0) {
    throw new BadRequestException('La cantidad debe ser un entero distinto de 0');
  }

  return db.transaction(async (tx) => {
    const t = await lockTier(tx, tierId);
    const want = Math.abs(quantity);

    const candidates =
      quantity > 0
        ? await tx
            .select({ id: ticket.id })
            .from(ticket)
            .where(
              and(
                eq(ticket.eventId, t.eventId),
                eq(ticket.sectorId, t.sectorId),
                eq(ticket.status, 'DISPONIBLE'),
                sql`${ticket.tierId} IS NULL`,
              ),
            )
            .orderBy(ticket.shortCode)
            .limit(want)
            .for('update')
        : await tx
            .select({ id: ticket.id })
            .from(ticket)
            .where(and(eq(ticket.tierId, tierId), eq(ticket.status, 'DISPONIBLE')))
            .orderBy(ticket.shortCode)
            .limit(want)
            .for('update');

    if (candidates.length < want) {
      throw new BadRequestException(
        quantity > 0
          ? `Solo hay ${candidates.length} tickets sin tier en este sector (pediste ${want}). ¿Falta correr "Generar tickets"?`
          : `Este tier solo tiene ${candidates.length} tickets disponibles para liberar (pediste ${want}).`,
      );
    }

    await tx
      .update(ticket)
      .set({ tierId: quantity > 0 ? tierId : null })
      .where(inArray(ticket.id, candidates.map((c) => c.id)));

    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(ticket)
      .where(and(eq(ticket.tierId, tierId), eq(ticket.status, 'DISPONIBLE')));

    return { moved: quantity > 0 ? want : -want, availableInTier: n };
  });
}

export interface IssueCourtesyInput {
  recipientName: string;
  recipientEmail: string;
  reason?: string;
  quantity: number;
}

// Cortesía: registro propio (courtesy) + tickets DISPONIBLE → VALIDO, sin
// pasar por Order/Payment. Solo desde tiers de tipo CORTESIA.
export async function issueCourtesy(
  db: Database,
  tierId: string,
  input: IssueCourtesyInput,
  issuedBy: string,
) {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new BadRequestException('La cantidad debe ser al menos 1');
  }

  return db.transaction(async (tx) => {
    const t = await lockTier(tx, tierId);
    if (t.kind !== 'CORTESIA') {
      throw new BadRequestException('Este tier no es de tipo CORTESIA');
    }

    const picked = await tx
      .select({ id: ticket.id, shortCode: ticket.shortCode })
      .from(ticket)
      .where(and(eq(ticket.tierId, tierId), eq(ticket.status, 'DISPONIBLE')))
      .orderBy(ticket.shortCode)
      .limit(input.quantity)
      .for('update');

    if (picked.length < input.quantity) {
      throw new BadRequestException(
        `El tier de cortesía solo tiene ${picked.length} tickets disponibles (pediste ${input.quantity}).`,
      );
    }

    const [created] = await tx
      .insert(courtesy)
      .values({
        eventId: t.eventId,
        recipientName: input.recipientName,
        recipientEmail: input.recipientEmail,
        reason: input.reason,
        issuedBy,
      })
      .returning();

    await tx
      .update(ticket)
      .set({ status: 'VALIDO', courtesyId: created.id })
      .where(inArray(ticket.id, picked.map((p) => p.id)));

    return { courtesyId: created.id, accessToken: created.accessToken, tickets: picked };
  });
}

// Conteo de tickets por tier y estado — la "disponibilidad" nunca se guarda,
// siempre se deriva de acá.
export async function ticketCountsByTier(db: Database, eventId: string) {
  const rows = await db
    .select({ tierId: ticket.tierId, status: ticket.status, n: sql<number>`count(*)::int` })
    .from(ticket)
    .where(eq(ticket.eventId, eventId))
    .groupBy(ticket.tierId, ticket.status);

  const byTier = new Map<string, Record<string, number>>();
  const unassigned: Record<string, number> = {};
  for (const r of rows) {
    if (r.tierId === null) {
      unassigned[r.status] = (unassigned[r.status] ?? 0) + r.n;
    } else {
      const m = byTier.get(r.tierId) ?? {};
      m[r.status] = r.n;
      byTier.set(r.tierId, m);
    }
  }
  return { byTier, unassigned };
}
