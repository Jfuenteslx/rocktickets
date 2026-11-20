import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { seat, sector, sectorTable, ticket, venue } from '../db/index.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import type { AuthUser } from '../auth/access.js';
import type { SaveSeatingDto } from './dto/seating.dto.js';
import { rectToPolygon, type Point } from './layout.polygon.js';
import { countActive, validateSeating } from './seating.validation.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

const CHUNK = 500;

// La forma del sector: sus vértices o, si es un bloque, su rectángulo
export function sectorShape(s: { x: number | null; y: number | null; w: number | null; h: number | null; points: Point[] | null }): Point[] | null {
  if (s.points) return s.points;
  if (s.x === null || s.y === null || s.w === null || s.h === null) return null;
  return rectToPolygon({ x: s.x, y: s.y, w: s.w, h: s.h });
}

// Mesas y asientos de un sector (creador de venues, fase 2). Solo el superadmin (venues:manage).
// Se lee y se guarda COMPLETO por sector, en una transacción. El aforo del sector pasa a ser la
// cantidad de asientos activos en cuanto el sector tiene asientos.
@Injectable()
export class VenueSeatingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLog: AuditLogService,
  ) {}

  getSeating(venueId: string, sectorId: string) {
    return this.db.transaction((tx) => this.load(tx, venueId, sectorId));
  }

  async saveSeating(venueId: string, sectorId: string, dto: SaveSeatingDto, actor: AuthUser) {
    const result = await this.db.transaction(async (tx) => {
      // Mismo candado que el guardado del plano: no se mezclan guardados del mismo local
      const [v] = await tx.select().from(venue).where(eq(venue.id, venueId)).for('update').limit(1);
      if (!v) throw new NotFoundException('Local no encontrado');

      const [sec] = await tx.select().from(sector).where(and(eq(sector.id, sectorId), eq(sector.venueId, venueId))).limit(1);
      if (!sec) throw new NotFoundException('Sector no encontrado en este local');
      if (sec.type === 'DE_PIE') throw new BadRequestException('Un sector "de pie" no tiene mesas ni asientos');
      const shape = sectorShape(sec);
      if (!shape) throw new BadRequestException('Ubica el sector en el plano antes de agregarle mesas o asientos');

      const errors = validateSeating(dto, shape);
      if (errors.length > 0) throw new BadRequestException(errors.join('. '));

      const total = dto.tables.reduce((n, t) => n + t.seats.length, 0) + dto.rows.length;
      const active = countActive(dto);
      if (total > 0 && active === 0) throw new BadRequestException('Debe quedar al menos un asiento activo');

      // Todo id que llegue debe ser de ESTE sector
      const curTables = await tx.select().from(sectorTable).where(eq(sectorTable.sectorId, sectorId));
      const curSeats = await tx.select().from(seat).where(eq(seat.sectorId, sectorId));
      const tableById = new Map(curTables.map((t) => [t.id, t]));
      const seatById = new Map(curSeats.map((s) => [s.id, s]));
      for (const t of dto.tables) {
        if (t.id && !tableById.has(t.id)) throw new BadRequestException(`La mesa "${t.label}" no pertenece a este sector`);
        for (const s of t.seats) {
          if (s.id && !seatById.has(s.id)) throw new BadRequestException(`Un asiento de la mesa "${t.label}" no pertenece a este sector`);
          if (s.id && seatById.get(s.id)!.tableId !== (t.id ?? null)) {
            throw new BadRequestException(`Un asiento de la mesa "${t.label}" no se puede pasar de una mesa a otra`);
          }
        }
      }
      for (const r of dto.rows) {
        if (r.id && (!seatById.has(r.id) || seatById.get(r.id)!.tableId !== null)) {
          throw new BadRequestException(`La butaca ${r.rowLabel}-${r.label} no pertenece a este sector`);
        }
      }

      // El aforo no puede bajar de lo que ya se generó en algún evento
      if (total > 0 && active < sec.capacity) {
        const maxPerEvent = await this.maxTicketsPerEvent(tx, sectorId);
        if (active < maxPerEvent) {
          throw new ConflictException(
            `El sector "${sec.name}" ya tiene eventos con ${maxPerEvent} tickets generados: no puede tener menos de ${maxPerEvent} asientos activos.`,
          );
        }
      }

      // 1) Borrar lo que ya no está (borrar una mesa borra sus asientos)
      const keepTables = new Set(dto.tables.map((t) => t.id).filter(Boolean) as string[]);
      const dropTables = curTables.filter((t) => !keepTables.has(t.id)).map((t) => t.id);
      if (dropTables.length > 0) await tx.delete(sectorTable).where(inArray(sectorTable.id, dropTables));
      const keepSeats = new Set(
        [...dto.tables.flatMap((t) => t.seats.map((s) => s.id)), ...dto.rows.map((r) => r.id)].filter(Boolean) as string[],
      );
      const dropSeats = curSeats.filter((s) => !keepSeats.has(s.id) && !dropTables.includes(s.tableId ?? '')).map((s) => s.id);
      for (let i = 0; i < dropSeats.length; i += CHUNK) {
        await tx.delete(seat).where(inArray(seat.id, dropSeats.slice(i, i + CHUNK)));
      }

      // 2) Mesas: actualizar las que cambiaron y crear las nuevas
      const tableIdByLabel = new Map<string, string>();
      const newTables = dto.tables.filter((t) => !t.id);
      for (const t of dto.tables) {
        if (!t.id) continue;
        tableIdByLabel.set(t.label.trim(), t.id);
        const cur = tableById.get(t.id)!;
        if (cur.label !== t.label.trim() || cur.x !== t.x || cur.y !== t.y) {
          await tx.update(sectorTable).set({ label: t.label.trim(), x: t.x, y: t.y }).where(eq(sectorTable.id, t.id));
        }
      }
      for (let i = 0; i < newTables.length; i += CHUNK) {
        const part = newTables.slice(i, i + CHUNK);
        const created = await tx
          .insert(sectorTable)
          .values(part.map((t) => ({ sectorId, label: t.label.trim(), x: t.x, y: t.y })))
          .returning({ id: sectorTable.id, label: sectorTable.label });
        for (const c of created) tableIdByLabel.set(c.label, c.id);
      }

      // 3) Asientos: actualizar los que cambiaron y crear los nuevos
      const toInsert: (typeof seat.$inferInsert)[] = [];
      const consider = (
        s: { id?: string; label: string; x: number; y: number; active: boolean },
        tableId: string | null,
        rowLabel: string | null,
      ) => {
        const values = { tableId, rowLabel, label: s.label.trim(), x: s.x, y: s.y, active: s.active };
        if (!s.id) {
          toInsert.push({ sectorId, ...values });
          return null;
        }
        const cur = seatById.get(s.id)!;
        const changed = cur.label !== values.label || cur.rowLabel !== rowLabel || cur.x !== s.x || cur.y !== s.y || cur.active !== s.active;
        return changed ? { id: s.id, values } : null;
      };
      const updates: { id: string; values: Omit<typeof seat.$inferInsert, 'sectorId'> }[] = [];
      for (const t of dto.tables) {
        const tableId = t.id ?? tableIdByLabel.get(t.label.trim())!;
        for (const s of t.seats) {
          const u = consider(s, tableId, null);
          if (u) updates.push(u);
        }
      }
      for (const r of dto.rows) {
        const u = consider(r, null, r.rowLabel.trim());
        if (u) updates.push(u);
      }
      for (const u of updates) await tx.update(seat).set(u.values).where(eq(seat.id, u.id));
      for (let i = 0; i < toInsert.length; i += CHUNK) await tx.insert(seat).values(toInsert.slice(i, i + CHUNK));

      // 4) El aforo del sector es la cantidad de asientos activos
      if (total > 0 && active !== sec.capacity) {
        await tx.update(sector).set({ capacity: active }).where(eq(sector.id, sectorId));
      }

      return this.load(tx, venueId, sectorId);
    }).catch((err: unknown) => {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e?.code === '23505' || e?.cause?.code === '23505') {
        throw new ConflictException('Hay una etiqueta repetida entre las mesas o los asientos');
      }
      throw err;
    });

    await this.auditLog.log(actor.sub, 'SECTOR_SEATING_SAVED', 'Sector', sectorId, {
      tables: dto.tables.length,
      seats: dto.tables.reduce((n, t) => n + t.seats.length, 0) + dto.rows.length,
      activeSeats: countActive(dto),
    });
    return result;
  }

  private async maxTicketsPerEvent(tx: Tx, sectorId: string): Promise<number> {
    const rows = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(ticket)
      .where(eq(ticket.sectorId, sectorId))
      .groupBy(ticket.eventId);
    return rows.reduce((m, r) => Math.max(m, r.n), 0);
  }

  private async load(tx: Tx, venueId: string, sectorId: string) {
    const [sec] = await tx.select().from(sector).where(and(eq(sector.id, sectorId), eq(sector.venueId, venueId))).limit(1);
    if (!sec) throw new NotFoundException('Sector no encontrado en este local');
    const tables = await tx.select().from(sectorTable).where(eq(sectorTable.sectorId, sectorId)).orderBy(sectorTable.label);
    const seats = await tx.select().from(seat).where(eq(seat.sectorId, sectorId)).orderBy(seat.label);

    const seatView = (s: typeof seats[number]) => ({ id: s.id, label: s.label, x: s.x, y: s.y, active: s.active });
    return {
      sector: { id: sec.id, name: sec.name, type: sec.type, capacity: sec.capacity },
      tables: tables.map((t) => ({
        id: t.id,
        label: t.label,
        x: t.x,
        y: t.y,
        seats: seats.filter((s) => s.tableId === t.id).map(seatView),
      })),
      rows: seats.filter((s) => s.tableId === null).map((s) => ({ ...seatView(s), rowLabel: s.rowLabel! })),
      activeSeats: seats.filter((s) => s.active).length,
    };
  }
}
