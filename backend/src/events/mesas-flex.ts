import { BadRequestException, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { event, eventTableBlock, order, seat, sector, sectorTable, tableHold } from '../db/index.js';

// Modo MESAS_FLEXIBLES. El comprador compra sus entradas normalmente y, si quiere, pide una mesa
// para su grupo de N personas; el sistema aparta la mesa libre más ajustada dentro del sector de
// esas entradas (o junta mesas vecinas si el grupo no cabe en una). La mesa se aparta entera.

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Tx;

export const MAX_PARTY = 30;
const MAX_COMBINED_TABLES = 4;

export interface FlexTable {
  id: string;
  label: string;
  sectorId: string;
  x: number;
  y: number;
  capacity: number;
}

const natural = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });

// Elige las mesas para un grupo (función pura, sin base de datos).
//  1) La mesa libre más chica donde entra todo el grupo.
//  2) Si ninguna alcanza, junta mesas cercanas: la combinación con menos sillas sobrantes
//     (luego la de menos mesas y la más compacta), hasta MAX_COMBINED_TABLES.
export function chooseTables(free: FlexTable[], people: number): FlexTable[] | null {
  if (people < 1) return null;
  const single = free
    .filter((t) => t.capacity >= people)
    .sort((a, b) => a.capacity - b.capacity || natural(a.label, b.label))[0];
  if (single) return [single];

  let best: { tables: FlexTable[]; waste: number; spread: number } | null = null;
  for (const seed of free) {
    const near = free
      .filter((t) => t.id !== seed.id)
      .map((t) => ({ t, d: Math.hypot(t.x - seed.x, t.y - seed.y) }))
      .sort((a, b) => a.d - b.d || natural(a.t.label, b.t.label));
    const picked = [seed];
    let cap = seed.capacity;
    let spread = 0;
    for (const { t, d } of near) {
      if (cap >= people || picked.length >= MAX_COMBINED_TABLES) break;
      picked.push(t);
      cap += t.capacity;
      spread = Math.max(spread, d);
    }
    if (cap < people) continue;
    const cand = { tables: picked, waste: cap - people, spread };
    if (
      !best ||
      cand.waste < best.waste ||
      (cand.waste === best.waste && cand.tables.length < best.tables.length) ||
      (cand.waste === best.waste && cand.tables.length === best.tables.length && cand.spread < best.spread)
    ) {
      best = cand;
    }
  }
  return best ? best.tables.sort((a, b) => natural(a.label, b.label)) : null;
}

// Reparte las personas entre las mesas elegidas (llena primero las más grandes)
export function splitPeople(tables: FlexTable[], people: number): { table: FlexTable; people: number }[] {
  let left = people;
  return [...tables]
    .sort((a, b) => b.capacity - a.capacity || natural(a.label, b.label))
    .map((table) => {
      const n = Math.min(table.capacity, left);
      left -= n;
      return { table, people: n };
    })
    .filter((x) => x.people > 0)
    .sort((a, b) => natural(a.table.label, b.table.label));
}

// Mesas con sus sillas activas, con su estado para este evento
export async function loadFlexTables(db: Executor, eventId: string, venueId: string, sectorId?: string) {
  const tables = await db
    .select({ id: sectorTable.id, label: sectorTable.label, sectorId: sectorTable.sectorId, x: sectorTable.x, y: sectorTable.y, sellable: sector.sellable })
    .from(sectorTable)
    .innerJoin(sector, eq(sector.id, sectorTable.sectorId))
    .where(and(eq(sector.venueId, venueId), sectorId ? eq(sectorTable.sectorId, sectorId) : sql`true`));
  const ids = tables.map((t) => t.id);
  if (ids.length === 0) return [];

  const caps = await db
    .select({ tableId: seat.tableId, n: sql<number>`count(*)::int` })
    .from(seat)
    .where(and(inArray(seat.tableId, ids), eq(seat.active, true)))
    .groupBy(seat.tableId);
  const capOf = new Map(caps.map((c) => [c.tableId!, c.n]));
  const blocked = new Set(
    (await db.select({ t: eventTableBlock.tableId }).from(eventTableBlock).where(eq(eventTableBlock.eventId, eventId))).map((r) => r.t),
  );
  const held = new Set(
    (
      await db
        .select({ t: tableHold.tableId })
        .from(tableHold)
        .innerJoin(order, eq(order.id, tableHold.orderId))
        .where(and(eq(tableHold.eventId, eventId), inArray(order.status, ['PENDIENTE_PAGO', 'PAGADA'])))
    ).map((r) => r.t),
  );
  return tables
    .filter((t) => t.sellable && (capOf.get(t.id) ?? 0) > 0)
    .map((t) => ({ ...t, capacity: capOf.get(t.id)!, blocked: blocked.has(t.id), held: held.has(t.id) }));
}

export const freeOf = (rows: Awaited<ReturnType<typeof loadFlexTables>>): FlexTable[] =>
  rows.filter((t) => !t.blocked && !t.held).map(({ id, label, sectorId, x, y, capacity }) => ({ id, label, sectorId, x, y, capacity }));

// ¿Hay mesa para N personas en este sector? (consulta pública; no dice cuál)
export async function flexAvailability(db: Database, eventId: string, sectorId: string, people: number) {
  if (!Number.isInteger(people) || people < 1 || people > MAX_PARTY) throw new BadRequestException('Cantidad de personas inválida');
  const [ev] = await db.select().from(event).where(eq(event.id, eventId)).limit(1);
  if (!ev) throw new NotFoundException('Evento no encontrado');
  if (ev.seatingMode !== 'MESAS_FLEXIBLES') throw new BadRequestException('Este evento no reserva mesas por grupo');
  const rows = await loadFlexTables(db, eventId, ev.venueId, sectorId);
  const free = freeOf(rows);
  const chosen = chooseTables(free, people);
  return {
    available: chosen !== null,
    tables: chosen ? chosen.length : 0,
    // la mayor cantidad de personas que aún se puede acomodar en el sector
    maxPeople: Math.min(MAX_PARTY, free.sort((a, b) => b.capacity - a.capacity).slice(0, MAX_COMBINED_TABLES).reduce((a, t) => a + t.capacity, 0)),
    validUntil: ev.tableValidUntil,
  };
}

// Admin: mesas del plano con su estado en este evento
export async function listFlexTables(db: Database, eventId: string) {
  const [ev] = await db.select().from(event).where(eq(event.id, eventId)).limit(1);
  if (!ev) throw new NotFoundException('Evento no encontrado');
  const rows = await loadFlexTables(db, eventId, ev.venueId);
  return rows.map((t) => ({
    id: t.id, label: t.label, sectorId: t.sectorId, x: t.x, y: t.y, capacity: t.capacity,
    status: t.held ? 'RESERVADA' : t.blocked ? 'BLOQUEADA' : 'LIBRE',
  }));
}

// Admin: saca (o devuelve) mesas de la reserva. Solo mesas del local del evento.
export async function setTableBlocks(db: Database, eventId: string, tableIds: string[], blocked: boolean) {
  const unique = [...new Set(tableIds)];
  return db.transaction(async (tx) => {
    const [ev] = await tx.select().from(event).where(eq(event.id, eventId)).for('update').limit(1);
    if (!ev) throw new NotFoundException('Evento no encontrado');
    if (ev.seatingMode !== 'MESAS_FLEXIBLES') throw new BadRequestException('Este evento no usa mesas flexibles');
    const owned = await tx
      .select({ id: sectorTable.id })
      .from(sectorTable)
      .innerJoin(sector, eq(sector.id, sectorTable.sectorId))
      .where(and(inArray(sectorTable.id, unique), eq(sector.venueId, ev.venueId)));
    if (owned.length !== unique.length) throw new BadRequestException('Alguna mesa no existe en el local de este evento');
    if (blocked) {
      await tx.insert(eventTableBlock).values(unique.map((tableId) => ({ eventId, tableId }))).onConflictDoNothing();
    } else {
      await tx.delete(eventTableBlock).where(and(eq(eventTableBlock.eventId, eventId), inArray(eventTableBlock.tableId, unique)));
    }
    return { updated: unique.length, blocked };
  });
}
