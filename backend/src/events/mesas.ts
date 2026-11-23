import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { event, eventTable, seat, sector, sectorTable, ticket, tier, tablePackage } from '../db/index.js';

// Modo MESAS_FIJAS. Un paquete ("6 personas + botella = Bs 600") se asigna a mesas concretas del
// plano. Cada paquete tiene UN tier por sector (se crea solo, con el nombre del paquete) cuyo
// precio por ticket es precio / personas; los tickets del tier son los asientos de esas mesas.
// Comprar una mesa = comprar todos sus asientos a la vez (ver OrdersService).

export const MAX_TABLES_PER_ORDER = 3;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface PackageInput {
  name: string;
  people: number;
  price: number;
  bottleOptions?: string[];
}

function cleanPackage(input: PackageInput) {
  const name = input.name?.trim();
  if (!name) throw new BadRequestException('El paquete necesita un nombre');
  if (name.length > 60) throw new BadRequestException('El nombre del paquete es demasiado largo (máx. 60)');
  if (!Number.isInteger(input.people) || input.people < 1 || input.people > 30) {
    throw new BadRequestException('Las personas del paquete deben ser un número entre 1 y 30');
  }
  const cents = Math.round(Number(input.price) * 100);
  if (!Number.isFinite(cents) || cents <= 0) throw new BadRequestException('El precio del paquete debe ser mayor a 0');
  if (cents % input.people !== 0) {
    throw new BadRequestException(
      `El precio se reparte en partes iguales entre las ${input.people} personas (cada ticket cuesta un monto exacto en centavos). Ajusta el precio.`,
    );
  }
  const bottles = [...new Set((input.bottleOptions ?? []).map((b) => b.trim()).filter(Boolean))];
  if (bottles.length > 10 || bottles.some((b) => b.length > 40)) {
    throw new BadRequestException('Máximo 10 botellas de hasta 40 caracteres cada una');
  }
  return { name, people: input.people, price: (cents / 100).toFixed(2), bottleOptions: bottles, unit: (cents / input.people / 100).toFixed(2) };
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const isUniqueViolation = (e: unknown) =>
  (e as { code?: string })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505';

async function lockedMesasEvent(tx: Tx, eventId: string) {
  const [ev] = await tx.select().from(event).where(eq(event.id, eventId)).for('update').limit(1);
  if (!ev) throw new NotFoundException('Evento no encontrado');
  if (ev.status !== 'ACTIVO') throw new BadRequestException('El evento está cancelado');
  if (ev.seatingMode !== 'MESAS_FIJAS') throw new BadRequestException('Este evento no usa mesas fijas');
  return ev;
}

export async function setTableValidUntil(db: Database, eventId: string, value: string) {
  if (!TIME_RE.test(value)) throw new BadRequestException('La hora debe ser HH:MM (ej. 23:00)');
  const res = await db.update(event).set({ tableValidUntil: value }).where(eq(event.id, eventId)).returning({ id: event.id });
  if (res.length === 0) throw new NotFoundException('Evento no encontrado');
  return { tableValidUntil: value };
}

export async function listPackages(db: Database, eventId: string) {
  const packages = await db.select().from(tablePackage).where(eq(tablePackage.eventId, eventId)).orderBy(asc(tablePackage.people), asc(tablePackage.name));
  const assigned = await db
    .select({ packageId: eventTable.packageId, tableId: eventTable.tableId, label: sectorTable.label, sectorId: sectorTable.sectorId })
    .from(eventTable)
    .innerJoin(sectorTable, eq(sectorTable.id, eventTable.tableId))
    .where(eq(eventTable.eventId, eventId));
  return packages.map((p) => ({
    id: p.id,
    name: p.name,
    people: p.people,
    price: p.price,
    unitPrice: (Math.round(Number(p.price) * 100) / p.people / 100).toFixed(2),
    bottleOptions: p.bottleOptions,
    tables: assigned.filter((a) => a.packageId === p.id).map((a) => ({ id: a.tableId, label: a.label, sectorId: a.sectorId })),
  }));
}

export async function createPackage(db: Database, eventId: string, input: PackageInput) {
  const c = cleanPackage(input);
  return db.transaction(async (tx) => {
    await lockedMesasEvent(tx, eventId);
    try {
      const [row] = await tx
        .insert(tablePackage)
        .values({ eventId, name: c.name, people: c.people, price: c.price, bottleOptions: c.bottleOptions })
        .returning();
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya hay un paquete con ese nombre en este evento');
      throw e;
    }
  });
}

// Tiers de un paquete (uno por sector donde se vende), bloqueados en orden de id
async function lockPackageTiers(tx: Tx, packageId: string) {
  const rows = await tx.select({ tierId: eventTable.tierId }).from(eventTable).where(eq(eventTable.packageId, packageId));
  const ids = [...new Set(rows.map((r) => r.tierId))].sort();
  for (const id of ids) await tx.select().from(tier).where(eq(tier.id, id)).for('update');
  return ids;
}

export async function updatePackage(db: Database, packageId: string, input: Partial<PackageInput>) {
  return db.transaction(async (tx) => {
    const [pkg0] = await tx.select().from(tablePackage).where(eq(tablePackage.id, packageId)).limit(1);
    if (!pkg0) throw new NotFoundException('Paquete no encontrado');
    await lockedMesasEvent(tx, pkg0.eventId);
    const [pkg] = await tx.select().from(tablePackage).where(eq(tablePackage.id, packageId)).for('update').limit(1);

    const c = cleanPackage({
      name: input.name ?? pkg!.name,
      people: input.people ?? pkg!.people,
      price: input.price ?? Number(pkg!.price),
      bottleOptions: input.bottleOptions ?? pkg!.bottleOptions,
    });
    const tierIds = await lockPackageTiers(tx, packageId);
    const structural = c.people !== pkg!.people || c.price !== pkg!.price || c.name !== pkg!.name;

    if (tierIds.length > 0 && structural) {
      if (c.people !== pkg!.people) {
        throw new ConflictException('Quita el paquete de sus mesas antes de cambiar la cantidad de personas');
      }
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(ticket)
        .where(and(inArray(ticket.tierId, tierIds), sql`${ticket.status} <> 'DISPONIBLE'`));
      if (n > 0) throw new ConflictException('Ya hay mesas reservadas o vendidas con este paquete: no se puede cambiar su nombre ni su precio');
      try {
        await tx.update(tier).set({ name: c.name, price: c.unit }).where(inArray(tier.id, tierIds));
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictException('Ya existe un tier con ese nombre en uno de los sectores');
        throw e;
      }
    }
    try {
      const [row] = await tx
        .update(tablePackage)
        .set({ name: c.name, people: c.people, price: c.price, bottleOptions: c.bottleOptions })
        .where(eq(tablePackage.id, packageId))
        .returning();
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya hay un paquete con ese nombre en este evento');
      throw e;
    }
  });
}

export async function deletePackage(db: Database, packageId: string) {
  return db.transaction(async (tx) => {
    const [pkg] = await tx.select().from(tablePackage).where(eq(tablePackage.id, packageId)).limit(1);
    if (!pkg) throw new NotFoundException('Paquete no encontrado');
    await lockedMesasEvent(tx, pkg.eventId);
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(eventTable).where(eq(eventTable.packageId, packageId));
    if (n > 0) throw new ConflictException('El paquete está asignado a mesas: quítalo de ellas primero');
    await tx.delete(tablePackage).where(eq(tablePackage.id, packageId));
    return { deleted: true };
  });
}

// Asigna un paquete a mesas (o lo quita con packageId = null). Solo mesas sin ventas.
export async function assignPackageToTables(db: Database, eventId: string, packageId: string | null, tableIds: string[]) {
  const unique = [...new Set(tableIds)];
  if (unique.length === 0) throw new BadRequestException('Elige al menos una mesa');

  return db.transaction(async (tx) => {
    const ev = await lockedMesasEvent(tx, eventId);

    const tables = await tx
      .select({ id: sectorTable.id, label: sectorTable.label, sectorId: sectorTable.sectorId, venueId: sector.venueId, sellable: sector.sellable })
      .from(sectorTable)
      .innerJoin(sector, eq(sector.id, sectorTable.sectorId))
      .where(inArray(sectorTable.id, unique));
    if (tables.length !== unique.length || tables.some((t) => t.venueId !== ev.venueId)) {
      throw new BadRequestException('Alguna mesa no existe en el local de este evento');
    }
    if (tables.some((t) => !t.sellable)) throw new BadRequestException('Alguna mesa está en un sector que no es vendible');

    const seats = await tx
      .select({ id: seat.id, tableId: seat.tableId })
      .from(seat)
      .where(and(inArray(seat.tableId, unique), eq(seat.active, true)));
    const seatsOf = new Map<string, string[]>();
    for (const s of seats) seatsOf.set(s.tableId!, [...(seatsOf.get(s.tableId!) ?? []), s.id]);

    let pkg: typeof tablePackage.$inferSelect | undefined;
    if (packageId) {
      [pkg] = await tx.select().from(tablePackage).where(eq(tablePackage.id, packageId)).limit(1);
      if (!pkg || pkg.eventId !== eventId) throw new NotFoundException('Paquete no encontrado en este evento');
      for (const t of tables) {
        const n = seatsOf.get(t.id)?.length ?? 0;
        if (n !== pkg.people) {
          throw new BadRequestException(`La mesa ${t.label} tiene ${n} asientos y el paquete es de ${pkg.people} personas`);
        }
      }
    }

    // Tiers que se tocan: los actuales de estas mesas + los del paquete en cada sector
    const current = await tx.select().from(eventTable).where(and(eq(eventTable.eventId, eventId), inArray(eventTable.tableId, unique)));
    const sectorIds = [...new Set(tables.map((t) => t.sectorId))];
    const existingTiers = pkg
      ? await tx.select().from(tier).where(and(eq(tier.eventId, eventId), eq(tier.name, pkg.name), inArray(tier.sectorId, sectorIds)))
      : [];
    const lockIds = [...new Set([...current.map((c) => c.tierId), ...existingTiers.map((t) => t.id)])].sort();
    for (const id of lockIds) await tx.select().from(tier).where(eq(tier.id, id)).for('update');

    // Tickets de las mesas (bloqueo por id, como en toda la app)
    const allSeatIds = seats.map((s) => s.id);
    const tickets = allSeatIds.length
      ? await tx
          .select({ id: ticket.id, seatId: ticket.seatId, status: ticket.status })
          .from(ticket)
          .where(and(eq(ticket.eventId, eventId), inArray(ticket.seatId, allSeatIds)))
          .orderBy(ticket.id)
          .for('update')
      : [];
    if (tickets.length !== allSeatIds.length) {
      throw new BadRequestException('Faltan tickets en algunas mesas. ¿Falta correr "Generar tickets"?');
    }
    if (tickets.some((t) => t.status !== 'DISPONIBLE')) {
      throw new ConflictException('Alguna mesa ya está reservada o vendida: no se puede cambiar su paquete');
    }

    const ticketsOf = (tableId: string) => {
      const ids = new Set(seatsOf.get(tableId) ?? []);
      return tickets.filter((t) => ids.has(t.seatId!)).map((t) => t.id);
    };

    if (!pkg) {
      for (const t of tables) await tx.update(ticket).set({ tierId: null }).where(inArray(ticket.id, ticketsOf(t.id)));
      await tx.delete(eventTable).where(and(eq(eventTable.eventId, eventId), inArray(eventTable.tableId, unique)));
      return { assigned: 0, cleared: tables.length };
    }

    const unit = (Math.round(Number(pkg.price) * 100) / pkg.people / 100).toFixed(2);
    const tierBySector = new Map<string, string>();
    for (const sid of sectorIds) {
      const found = existingTiers.find((t) => t.sectorId === sid);
      if (found) {
        if (found.kind !== 'VENTA') throw new ConflictException(`Ya existe un tier «${pkg.name}» que no es de venta en un sector de estas mesas`);
        if (found.price !== unit) await tx.update(tier).set({ price: unit }).where(eq(tier.id, found.id));
        tierBySector.set(sid, found.id);
      } else {
        const [created] = await tx.insert(tier).values({ eventId, sectorId: sid, name: pkg.name, kind: 'VENTA', price: unit }).returning();
        tierBySector.set(sid, created.id);
      }
    }
    for (const t of tables) {
      const tierId = tierBySector.get(t.sectorId)!;
      await tx.update(ticket).set({ tierId }).where(inArray(ticket.id, ticketsOf(t.id)));
      await tx
        .insert(eventTable)
        .values({ eventId, tableId: t.id, packageId: pkg.id, tierId })
        .onConflictDoUpdate({ target: [eventTable.eventId, eventTable.tableId], set: { packageId: pkg.id, tierId } });
    }
    return { assigned: tables.length, cleared: 0 };
  });
}
