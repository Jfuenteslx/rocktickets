import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { event, eventTable, eventTableBlock, orderItem, seat, sector, sectorTable, tablePackage, ticket, tier } from '../db/index.js';
import { generateTicketsForEvent, setSeatingMode } from './inventory.js';
import { assignPackageToTables, createPackage, setTableValidUntil, updatePackage } from './mesas.js';

// Asistente de configuración de un evento: UNA operación que deja el evento listo para vender
// (modo + tickets + tiers + reparto + paquetes de mesa), en lugar de pasos manuales sueltos.
// Solo para eventos sin ventas. Es idempotente: se puede volver a aplicar con otros precios.
//
// Cómo se vende cada sector depende del modo y de cómo está dibujado en el plano:
//   cantidad  → entradas sueltas por sector (precio + cantidad)
//   asientos  → modo BUTACAS y el sector tiene asientos: un precio para todos sus asientos
//   mesas     → modo MESAS_FIJAS y el sector tiene mesas: se vende por mesa según su tamaño
//   sin_mesa  → modo MESAS_FIJAS, sector con asientos pero sin mesas: no se vende

export type SectorKind = 'cantidad' | 'asientos' | 'mesas' | 'sin_mesa';
type Mode = (typeof event.$inferSelect)['seatingMode'];

export interface SetupInput {
  seatingMode: Mode;
  sectors?: { sectorId: string; price: number; quantity?: number }[];
  tablePrices?: { people: number; price: number }[];
  tableValidUntil?: string;
  blockedTableIds?: string[];
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const isUniqueViolation = (e: unknown) =>
  (e as { code?: string })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505';

function kindOf(mode: Mode, seats: number, tables: number): SectorKind {
  if (mode === 'BUTACAS') return seats > 0 ? 'asientos' : 'cantidad';
  if (mode === 'MESAS_FIJAS') return tables > 0 ? 'mesas' : seats > 0 ? 'sin_mesa' : 'cantidad';
  return 'cantidad';
}

async function loadSectors(db: Database | Tx, venueId: string) {
  const sectors = await db.select().from(sector).where(and(eq(sector.venueId, venueId), eq(sector.sellable, true))).orderBy(asc(sector.name));
  const ids = sectors.map((s) => s.id);
  if (ids.length === 0) return [];
  const seatRows = await db
    .select({ sectorId: seat.sectorId, n: sql<number>`count(*)::int`, withTable: sql<number>`count(${seat.tableId})::int` })
    .from(seat)
    .where(and(inArray(seat.sectorId, ids), eq(seat.active, true)))
    .groupBy(seat.sectorId);
  const tableRows = await db
    .select({ sectorId: sectorTable.sectorId, n: sql<number>`count(*)::int` })
    .from(sectorTable)
    .where(inArray(sectorTable.sectorId, ids))
    .groupBy(sectorTable.sectorId);
  const seatsBy = new Map(seatRows.map((r) => [r.sectorId, r]));
  const tablesBy = new Map(tableRows.map((r) => [r.sectorId, r.n]));
  return sectors.map((s) => ({
    id: s.id,
    name: s.name,
    capacity: s.capacity,
    seats: seatsBy.get(s.id)?.n ?? 0,
    tables: tablesBy.get(s.id) ?? 0,
  }));
}

// Tamaños de mesa del plano: cuántas mesas hay de cada cantidad de asientos (solo sectores con mesas)
async function loadTableSizes(db: Database | Tx, sectorIds: string[]) {
  if (sectorIds.length === 0) return [];
  const rows = await db
    .select({ tableId: seat.tableId, sectorId: seat.sectorId, n: sql<number>`count(*)::int` })
    .from(seat)
    .where(and(inArray(seat.sectorId, sectorIds), eq(seat.active, true), sql`${seat.tableId} is not null`))
    .groupBy(seat.tableId, seat.sectorId);
  return rows.map((r) => ({ tableId: r.tableId!, sectorId: r.sectorId, people: r.n }));
}

async function hasSales(db: Database | Tx, eventId: string) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(ticket)
    .where(and(eq(ticket.eventId, eventId), sql`(${ticket.status} in ('RESERVADO','VALIDO','UTILIZADO') or ${ticket.courtesyId} is not null)`));
  return n > 0;
}

// Tier de venta "simple" de un sector: el que no pertenece a un paquete de mesas
async function simpleSectorTier(db: Database | Tx, eventId: string, sectorId: string) {
  const managed = db.select({ t: eventTable.tierId }).from(eventTable).where(eq(eventTable.eventId, eventId));
  const [row] = await db
    .select()
    .from(tier)
    .where(and(eq(tier.eventId, eventId), eq(tier.sectorId, sectorId), eq(tier.kind, 'VENTA'), notInArray(tier.id, managed)))
    .orderBy(asc(tier.createdAt))
    .limit(1);
  return row;
}

// Estado actual, con la forma que necesita el asistente
export async function getSetupState(db: Database, eventId: string) {
  const [ev] = await db.select().from(event).where(eq(event.id, eventId)).limit(1);
  if (!ev) throw new NotFoundException('Evento no encontrado');
  const mode = ev.seatingMode;
  const sectors = await loadSectors(db, ev.venueId);

  const sectorsOut = [];
  for (const s of sectors) {
    const kind = kindOf(mode, s.seats, s.tables);
    const t = kind === 'cantidad' || kind === 'asientos' ? await simpleSectorTier(db, eventId, s.id) : undefined;
    let quantity: number | null = null;
    let generated = 0;
    if (t) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(ticket).where(eq(ticket.tierId, t.id));
      quantity = n;
    }
    const [{ g }] = await db.select({ g: sql<number>`count(*)::int` }).from(ticket).where(and(eq(ticket.eventId, eventId), eq(ticket.sectorId, s.id)));
    generated = g;
    sectorsOut.push({
      id: s.id, name: s.name, capacity: s.capacity, seats: s.seats, tables: s.tables, kind,
      // lugares que salen a la venta si no se indica otra cantidad
      sellable: kind === 'asientos' ? s.seats : kind === 'cantidad' ? s.capacity : 0,
      price: t ? t.price : null, tierId: t ? t.id : null, quantity, generated,
    });
  }

  // los tamaños de mesa se informan siempre (para ofrecerlos si se elige mesas fijas)
  const mesaSectorIds = sectorsOut.filter((s) => s.tables > 0).map((s) => s.id);
  const sizes = await loadTableSizes(db, mesaSectorIds);
  const packages = await db.select().from(tablePackage).where(eq(tablePackage.eventId, eventId));
  const assigned = await db.select({ tableId: eventTable.tableId, packageId: eventTable.packageId }).from(eventTable).where(eq(eventTable.eventId, eventId));
  const pkgOfTable = new Map(assigned.map((a) => [a.tableId, a.packageId]));
  const tableSizes = [...new Set(sizes.map((x) => x.people))].sort((a, b) => a - b).map((people) => {
    const mine = sizes.filter((x) => x.people === people);
    const pkg = packages.find((p) => p.people === people);
    return {
      people,
      tables: mine.length,
      packageId: pkg?.id ?? null,
      price: pkg?.price ?? null,
      assigned: mine.filter((m) => pkg && pkgOfTable.get(m.tableId) === pkg.id).length,
    };
  });

  const blocked = await db.select({ t: eventTableBlock.tableId }).from(eventTableBlock).where(eq(eventTableBlock.eventId, eventId));
  return {
    eventId,
    seatingMode: mode,
    hasSales: await hasSales(db, eventId),
    tableValidUntil: ev.tableValidUntil,
    sectors: sectorsOut,
    tableSizes,
    blockedTableIds: blocked.map((b) => b.t),
  };
}

export async function applySetup(db: Database, eventId: string, input: SetupInput) {
  const [ev0] = await db.select().from(event).where(eq(event.id, eventId)).limit(1);
  if (!ev0) throw new NotFoundException('Evento no encontrado');
  if (ev0.status !== 'ACTIVO') throw new BadRequestException('El evento está cancelado');
  if (await hasSales(db, eventId)) {
    throw new ConflictException('Este evento ya tiene tickets reservados, vendidos o de cortesía: el asistente solo sirve para eventos sin ventas. Usa Ubicación y Entradas para ajustarlo.');
  }

  const mode = input.seatingMode;
  const sectors = await loadSectors(db, ev0.venueId);
  const kinds = new Map(sectors.map((s) => [s.id, kindOf(mode, s.seats, s.tables)]));

  // --- Validación completa antes de tocar nada ---
  const wanted = new Map<string, { price: number; quantity?: number }>();
  for (const s of input.sectors ?? []) {
    const k = kinds.get(s.sectorId);
    if (!k) throw new BadRequestException('Algún sector no es vendible o no es del local de este evento');
    if (k !== 'cantidad' && k !== 'asientos') {
      throw new BadRequestException(`El sector «${sectors.find((x) => x.id === s.sectorId)!.name}» no se vende por precio de sector en este modo`);
    }
    if (!Number.isFinite(s.price) || s.price < 0) throw new BadRequestException('Precio inválido');
    if (wanted.has(s.sectorId)) throw new BadRequestException('Sector repetido');
    wanted.set(s.sectorId, { price: s.price, quantity: s.quantity });
  }
  for (const [id, w] of wanted) {
    const s = sectors.find((x) => x.id === id)!;
    const max = kinds.get(id) === 'asientos' ? s.seats : s.capacity;
    if (w.quantity !== undefined) {
      if (kinds.get(id) === 'asientos') throw new BadRequestException(`En «${s.name}» se venden todos los asientos: no lleva cantidad`);
      if (!Number.isInteger(w.quantity) || w.quantity < 0 || w.quantity > max) {
        throw new BadRequestException(`La cantidad de «${s.name}» debe estar entre 0 y ${max}`);
      }
    }
  }
  const sizePrices = new Map<number, number>();
  for (const t of input.tablePrices ?? []) {
    if (mode !== 'MESAS_FIJAS') throw new BadRequestException('Los precios por tamaño de mesa son solo para mesas fijas');
    if (!Number.isInteger(t.people) || t.people < 1 || !Number.isFinite(t.price) || t.price <= 0) throw new BadRequestException('Precio de mesa inválido');
    if (Math.round(t.price * 100) % t.people !== 0) {
      throw new BadRequestException(`El precio de la mesa de ${t.people} debe repartirse en partes iguales entre las ${t.people} personas (en centavos exactos)`);
    }
    sizePrices.set(t.people, t.price);
  }

  // --- 1) Modo y tickets ---
  await setSeatingMode(db, eventId, mode);
  await generateTicketsForEvent(db, eventId);

  // --- 2) Mesas fijas: un paquete por tamaño y asignarlo a todas las mesas de ese tamaño ---
  const warnings: string[] = [];
  if (mode === 'MESAS_FIJAS') {
    const mesaSectors = sectors.filter((s) => kinds.get(s.id) === 'mesas').map((s) => s.id);
    const tables = await loadTableSizes(db, mesaSectors);
    const existing = await db.select().from(tablePackage).where(eq(tablePackage.eventId, eventId));
    const sizes = [...new Set(tables.map((t) => t.people))].sort((a, b) => a - b);
    for (const people of sizes) {
      const ids = tables.filter((t) => t.people === people).map((t) => t.tableId);
      const price = sizePrices.get(people);
      let pkg = existing.find((p) => p.people === people);
      if (price === undefined) {
        if (pkg) await assignPackageToTables(db, eventId, null, ids);
        warnings.push(`${ids.length === 1 ? 'La mesa' : `Las ${ids.length} mesas`} de ${people} personas no ${ids.length === 1 ? 'tiene' : 'tienen'} precio: no se vende${ids.length === 1 ? '' : 'n'}.`);
        continue;
      }
      if (!pkg) pkg = await createPackage(db, eventId, { name: `Mesa de ${people}`, people, price });
      else if (Number(pkg.price) !== price) await updatePackage(db, pkg.id, { price });
      await assignPackageToTables(db, eventId, pkg.id, ids);
    }
    // paquetes de tamaños que ya no existen en el plano
    for (const p of existing) {
      if (!sizes.includes(p.people)) {
        await db.delete(eventTable).where(eq(eventTable.packageId, p.id));
        await db.delete(tablePackage).where(eq(tablePackage.id, p.id));
      }
    }
    for (const s of sectors.filter((x) => kinds.get(x.id) === 'sin_mesa')) {
      warnings.push(`El sector «${s.name}» tiene asientos sin mesa: en mesas fijas no se vende.`);
    }
  }

  if (mode !== 'MESAS_FIJAS') {
    // al salir de mesas fijas no quedan paquetes (las asignaciones ya las borró el cambio de modo)
    await db.delete(tablePackage).where(eq(tablePackage.eventId, eventId));
  }

  // --- 3) Tiers por sector (precio + cantidad), en una sola transacción ---
  const used = new Set<string>();
  await db.transaction(async (tx) => {
    await tx.select({ id: event.id }).from(event).where(eq(event.id, eventId)).for('update');
    if (await hasSales(tx, eventId)) throw new ConflictException('Mientras se configuraba, el evento recibió una compra. Revisa Entradas.');

    for (const s of sectors) {
      const kind = kinds.get(s.id)!;
      if (kind !== 'cantidad' && kind !== 'asientos') continue;
      const w = wanted.get(s.id);
      let t = await simpleSectorTier(tx, eventId, s.id);

      if (!w) {
        // sin precio: el sector no se vende; sus tickets quedan sin tier
        if (t) await tx.update(ticket).set({ tierId: null }).where(eq(ticket.tierId, t.id));
        if (kind === 'cantidad') warnings.push(`El sector «${s.name}» no se vende (sin precio).`);
        continue;
      }
      if (!t) {
        try {
          [t] = await tx.insert(tier).values({ eventId, sectorId: s.id, name: s.name, price: w.price.toFixed(2) }).returning();
        } catch (e) {
          if (isUniqueViolation(e)) throw new ConflictException(`Ya hay un tier llamado «${s.name}» en ese sector`);
          throw e;
        }
      } else if (Number(t.price) !== w.price) {
        await tx.update(tier).set({ price: w.price.toFixed(2) }).where(eq(tier.id, t.id));
      }
      used.add(t.id);

      if (kind === 'asientos') {
        await tx.update(ticket).set({ tierId: t.id })
          .where(and(eq(ticket.eventId, eventId), eq(ticket.sectorId, s.id), sql`${ticket.seatId} is not null`, eq(ticket.status, 'DISPONIBLE')));
      } else {
        const [{ n: pool }] = await tx.select({ n: sql<number>`count(*)::int` }).from(ticket)
          .where(and(eq(ticket.eventId, eventId), eq(ticket.sectorId, s.id), isNull(ticket.seatId), eq(ticket.status, 'DISPONIBLE')));
        const target = Math.min(w.quantity ?? pool, pool);
        const [{ n: current }] = await tx.select({ n: sql<number>`count(*)::int` }).from(ticket)
          .where(and(eq(ticket.tierId, t.id), isNull(ticket.seatId), eq(ticket.status, 'DISPONIBLE')));
        if (target > current) {
          const pick = await tx.select({ id: ticket.id }).from(ticket)
            .where(and(eq(ticket.eventId, eventId), eq(ticket.sectorId, s.id), isNull(ticket.seatId), isNull(ticket.tierId), eq(ticket.status, 'DISPONIBLE')))
            .orderBy(asc(ticket.id)).limit(target - current).for('update');
          if (pick.length > 0) await tx.update(ticket).set({ tierId: t.id }).where(inArray(ticket.id, pick.map((p) => p.id)));
        } else if (target < current) {
          const pick = await tx.select({ id: ticket.id }).from(ticket)
            .where(and(eq(ticket.tierId, t.id), isNull(ticket.seatId), eq(ticket.status, 'DISPONIBLE')))
            .orderBy(asc(ticket.id)).limit(current - target).for('update');
          if (pick.length > 0) await tx.update(ticket).set({ tierId: null }).where(inArray(ticket.id, pick.map((p) => p.id)));
        }
      }
    }

    // Tiers de venta que quedaron sin tickets ni órdenes (restos de otro modo o de pruebas)
    const orphans = await tx.select({ id: tier.id }).from(tier).where(and(
      eq(tier.eventId, eventId), eq(tier.kind, 'VENTA'),
      sql`not exists (select 1 from ticket where ticket.tier_id = ${tier.id})`,
      sql`not exists (select 1 from order_item where order_item.tier_id = ${tier.id})`,
      sql`not exists (select 1 from event_table where event_table.tier_id = ${tier.id})`,
    ));
    for (const o of orphans) {
      if (!used.has(o.id)) await tx.delete(tier).where(eq(tier.id, o.id));
    }
  });

  // --- 4) Mesas: hora límite y mesas fuera de la reserva ---
  if (input.tableValidUntil !== undefined) await setTableValidUntil(db, eventId, input.tableValidUntil);
  if (mode === 'MESAS_FLEXIBLES' && input.blockedTableIds) {
    const ids = [...new Set(input.blockedTableIds)];
    if (ids.length > 0) {
      const owned = await db.select({ id: sectorTable.id }).from(sectorTable).innerJoin(sector, eq(sector.id, sectorTable.sectorId))
        .where(and(inArray(sectorTable.id, ids), eq(sector.venueId, ev0.venueId)));
      if (owned.length !== ids.length) throw new BadRequestException('Alguna mesa no existe en el local de este evento');
    }
    await db.delete(eventTableBlock).where(eq(eventTableBlock.eventId, eventId));
    if (ids.length > 0) await db.insert(eventTableBlock).values(ids.map((tableId) => ({ eventId, tableId })));
  }

  return { ...(await getSetupState(db, eventId)), warnings };
}
