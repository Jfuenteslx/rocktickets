import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { seat, sector, sectorTable, ticket, tier, venue, venueElement, venueLevel } from '../db/index.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import type { AuthUser } from '../auth/access.js';
import type { SaveLayoutDto } from './dto/layout.dto.js';
import { LAYOUT_CANVAS } from './layout.constants.js';
import { validateLayoutShape } from './layout.validation.js';
import { pointInPolygon, polygonBBox, rectToPolygon, translationOf } from './layout.polygon.js';
import { sectorShape } from './venue-seating.service.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

function bboxColumns(r: { x: number; y: number; w: number; h: number } | null) {
  return { x: r?.x ?? null, y: r?.y ?? null, w: r?.w ?? null, h: r?.h ?? null };
}

type SectorUsage = { tiers: number; tickets: number; maxPerEvent: number };

// Plano del local (creador de venues): niveles, sectores y elementos de referencia.
// Solo el superadmin (venues:manage). Se lee y se guarda COMPLETO, en una transacción,
// para que el editor pueda trabajar en el navegador (deshacer/rehacer) y guardar de una vez.
@Injectable()
export class VenueLayoutService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLog: AuditLogService,
  ) {}

  getLayout(venueId: string) {
    return this.db.transaction((tx) => this.loadLayout(tx, venueId));
  }

  async saveLayout(venueId: string, dto: SaveLayoutDto, actor: AuthUser) {
    const errors = validateLayoutShape(
      dto.levels.map((l) => ({
        name: l.name,
        sectors: l.sectors.map((s) => ({ id: s.id, name: s.name, rect: s.rect, points: s.points })),
        elements: l.elements.map((e) => ({ name: e.name, rect: e.rect })),
      })),
    );
    if (errors.length > 0) throw new BadRequestException(errors.join('. '));

    const deleteIds = dto.deleteSectorIds ?? [];
    const keptSectorIds = new Set(dto.levels.flatMap((l) => l.sectors.map((s) => s.id).filter(Boolean)));
    if (deleteIds.some((id) => keptSectorIds.has(id))) {
      throw new BadRequestException('Un sector no puede estar a la vez en el plano y en la lista de borrados');
    }

    let summary = { levels: 0, sectors: 0, elements: 0, deletedSectors: 0, deletedLevels: 0 };
    let result;
    try {
      result = await this.db.transaction(async (tx) => {
        // Bloquea el local: dos guardados simultáneos se serializan
        const [v] = await tx.select().from(venue).where(eq(venue.id, venueId)).for('update').limit(1);
        if (!v) throw new NotFoundException('Local no encontrado');

        const curLevels = await tx.select().from(venueLevel).where(eq(venueLevel.venueId, venueId));
        const curSectors = await tx.select().from(sector).where(eq(sector.venueId, venueId));
        const curLevelIds = new Set(curLevels.map((l) => l.id));
        const curSectorById = new Map(curSectors.map((s) => [s.id, s]));
        const curElements = curLevels.length
          ? await tx.select().from(venueElement).where(inArray(venueElement.levelId, curLevels.map((l) => l.id)))
          : [];
        const curElementIds = new Set(curElements.map((e) => e.id));

        // Todo id que llegue debe ser de ESTE local
        for (const level of dto.levels) {
          if (level.id && !curLevelIds.has(level.id)) throw new BadRequestException(`El nivel "${level.name}" no pertenece a este local`);
          for (const s of level.sectors) {
            if (s.id && !curSectorById.has(s.id)) throw new BadRequestException(`El sector "${s.name}" no pertenece a este local`);
          }
          for (const e of level.elements) {
            if (e.id && !curElementIds.has(e.id)) throw new BadRequestException(`El elemento "${e.name}" no pertenece a este local`);
          }
        }
        for (const id of deleteIds) {
          if (!curSectorById.has(id)) throw new BadRequestException('Se pidió borrar un sector que no pertenece a este local');
        }

        const usage = await this.sectorUsage(tx, curSectors.map((s) => s.id));
        const seatCounts = await this.seatCounts(tx, curSectors.map((s) => s.id));

        // 1) Borrar sectores pedidos (solo si no tienen historial)
        for (const id of deleteIds) {
          const s = curSectorById.get(id)!;
          const u = usage.get(id);
          if (u && (u.tiers > 0 || u.tickets > 0)) {
            throw new ConflictException(`El sector "${s.name}" ya tiene tiers o tickets: no se puede borrar`);
          }
        }
        if (deleteIds.length > 0) {
          await tx.delete(sector).where(inArray(sector.id, deleteIds));
          summary.deletedSectors = deleteIds.length;
        }

        // 2) Niveles: actualizar los existentes y crear los nuevos, en el orden recibido
        const levelIdByIndex: string[] = [];
        for (let i = 0; i < dto.levels.length; i += 1) {
          const l = dto.levels[i];
          if (l.id) {
            await tx.update(venueLevel).set({ name: l.name.trim(), position: i }).where(eq(venueLevel.id, l.id));
            levelIdByIndex.push(l.id);
          } else {
            const [created] = await tx
              .insert(venueLevel)
              .values({ venueId, name: l.name.trim(), position: i })
              .returning({ id: venueLevel.id });
            levelIdByIndex.push(created.id);
          }
        }

        // 3) Sectores: actualizar (con sus reglas) o crear
        for (let i = 0; i < dto.levels.length; i += 1) {
          const levelId = levelIdByIndex[i];
          for (const s of dto.levels[i].sectors) {
            const values = {
              name: s.name.trim(),
              capacity: s.capacity,
              levelId,
              type: s.type,
              view: s.view,
              accessible: s.accessible,
              sellable: s.sellable,
              color: s.color.toUpperCase(),
              buyerText: s.buyerText?.trim() ? s.buyerText.trim() : null,
              // Con polígono, x/y/w/h guardan la caja que lo envuelve (la calcula el servidor)
              ...(s.points
                ? { points: s.points.map((q) => ({ x: q.x, y: q.y })), ...bboxColumns(polygonBBox(s.points)) }
                : { points: null, ...bboxColumns(s.rect ?? null) }),
            };
            if (s.id) {
              const existing = curSectorById.get(s.id)!;
              const u = usage.get(s.id);
              // Con mesas o asientos, el aforo lo fijan los asientos activos: lo que llegue se ignora
              if ((seatCounts.get(s.id) ?? 0) > 0) {
                values.capacity = existing.capacity;
                await this.keepSeatsInShape(tx, existing, s, values.type);
              }
              if (values.capacity < existing.capacity && u && values.capacity < u.maxPerEvent) {
                throw new ConflictException(
                  `El sector "${existing.name}" ya tiene eventos con ${u.maxPerEvent} tickets generados: el aforo no puede ser menor.`,
                );
              }
              if (existing.sellable && !s.sellable && u && (u.tickets > 0 || u.tiers > 0)) {
                throw new ConflictException(
                  `El sector "${existing.name}" ya tiene tiers o tickets: no se puede sacar de la venta.`,
                );
              }
              await tx.update(sector).set(values).where(eq(sector.id, s.id));
            } else {
              await tx.insert(sector).values({ venueId, ...values });
            }
            summary.sectors += 1;
          }
        }

        // 4) Niveles que ya no están en el plano: solo se borran si quedaron vacíos de sectores
        const keptLevelIds = new Set(levelIdByIndex);
        const removedLevels = curLevels.filter((l) => !keptLevelIds.has(l.id));
        if (removedLevels.length > 0) {
          const stillUsed = await tx
            .select({ levelId: sector.levelId })
            .from(sector)
            .where(inArray(sector.levelId, removedLevels.map((l) => l.id)));
          if (stillUsed.length > 0) {
            const name = removedLevels.find((l) => l.id === stillUsed[0].levelId)?.name ?? '';
            throw new ConflictException(`El nivel "${name}" todavía tiene sectores: muévelos a otro nivel o bórralos antes`);
          }
          await tx.delete(venueLevel).where(inArray(venueLevel.id, removedLevels.map((l) => l.id)));
          summary.deletedLevels = removedLevels.length;
        }

        // 5) Elementos de referencia: lo que no llegó, se borra (los de niveles borrados caen en cascada)
        const keptElementIds = new Set(dto.levels.flatMap((l) => l.elements.map((e) => e.id).filter(Boolean)) as string[]);
        const removedElements = curElements.filter(
          (e) => keptLevelIds.has(e.levelId) && !keptElementIds.has(e.id),
        );
        if (removedElements.length > 0) {
          await tx.delete(venueElement).where(inArray(venueElement.id, removedElements.map((e) => e.id)));
        }
        for (let i = 0; i < dto.levels.length; i += 1) {
          const levelId = levelIdByIndex[i];
          for (const e of dto.levels[i].elements) {
            const values = { levelId, kind: e.kind, name: e.name.trim(), x: e.rect.x, y: e.rect.y, w: e.rect.w, h: e.rect.h };
            if (e.id) await tx.update(venueElement).set(values).where(eq(venueElement.id, e.id));
            else await tx.insert(venueElement).values(values);
            summary.elements += 1;
          }
        }
        summary.levels = dto.levels.length;

        return this.loadLayout(tx, venueId);
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Hay un nombre repetido: los niveles y los sectores deben tener nombres distintos dentro del local');
      }
      throw err;
    }

    await this.auditLog.log(actor.sub, 'VENUE_LAYOUT_SAVED', 'Venue', venueId, summary);
    return result;
  }

  // ---- lectura -----------------------------------------------------------

  private async loadLayout(tx: Tx, venueId: string) {
    const [v] = await tx.select().from(venue).where(eq(venue.id, venueId)).limit(1);
    if (!v) throw new NotFoundException('Local no encontrado');

    const levels = await tx.select().from(venueLevel).where(eq(venueLevel.venueId, venueId)).orderBy(venueLevel.position, venueLevel.name);
    const sectors = await tx.select().from(sector).where(eq(sector.venueId, venueId)).orderBy(sector.name);
    const elements = levels.length
      ? await tx.select().from(venueElement).where(inArray(venueElement.levelId, levels.map((l) => l.id))).orderBy(venueElement.createdAt)
      : [];
    const usage = await this.sectorUsage(tx, sectors.map((s) => s.id));
    const seatCounts = await this.seatCounts(tx, sectors.map((s) => s.id));

    const sectorView = (s: typeof sectors[number]) => ({
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      type: s.type,
      view: s.view,
      accessible: s.accessible,
      sellable: s.sellable,
      color: s.color,
      buyerText: s.buyerText,
      // rect = posición (o la caja que envuelve al polígono); points = vértices si es irregular
      rect: s.x === null || s.y === null || s.w === null || s.h === null ? null : { x: s.x, y: s.y, w: s.w, h: s.h },
      points: s.points ?? null,
      // Cantidad de asientos (0 = el aforo se escribe a mano; >0 = lo calculan los asientos)
      seatCount: seatCounts.get(s.id) ?? 0,
      // Con tiers o tickets no se puede borrar del plano
      inUse: (usage.get(s.id)?.tiers ?? 0) > 0 || (usage.get(s.id)?.tickets ?? 0) > 0,
    });

    return {
      canvas: LAYOUT_CANVAS,
      venue: { id: v.id, name: v.name },
      levels: levels.map((l) => ({
        id: l.id,
        name: l.name,
        position: l.position,
        sectors: sectors.filter((s) => s.levelId === l.id).map(sectorView),
        elements: elements
          .filter((e) => e.levelId === l.id)
          .map((e) => ({ id: e.id, kind: e.kind, name: e.name, rect: { x: e.x, y: e.y, w: e.w, h: e.h } })),
      })),
      // Sectores que existen pero no tienen nivel (creados por fuera del plano)
      unassigned: sectors.filter((s) => s.levelId === null).map(sectorView),
      totalCapacity: sectors.filter((s) => s.sellable).reduce((sum, s) => sum + s.capacity, 0),
    };
  }

  // Uso de cada sector: cuántos tiers, cuántos tickets y el máximo de tickets en un solo evento
  // Cuántos asientos tiene cada sector (los que no tienen ninguno no aparecen)
  private async seatCounts(tx: Tx, sectorIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (sectorIds.length === 0) return out;
    const rows = await tx
      .select({ sectorId: seat.sectorId, n: sql<number>`count(*)::int` })
      .from(seat)
      .where(inArray(seat.sectorId, sectorIds))
      .groupBy(seat.sectorId);
    for (const r of rows) out.set(r.sectorId, r.n);
    return out;
  }

  // Un sector con mesas y asientos puede moverse (se llevan sus asientos) o cambiar de forma mientras
  // todo siga dentro; si no, hay que ajustar los asientos antes. Tampoco puede pasar a "de pie".
  private async keepSeatsInShape(
    tx: Tx,
    existing: typeof sector.$inferSelect,
    s: { name: string; rect?: { x: number; y: number; w: number; h: number } | null; points?: { x: number; y: number }[] | null },
    newType: string,
  ) {
    if (newType === 'DE_PIE') {
      throw new ConflictException(`El sector "${existing.name}" tiene mesas o asientos: no puede pasar a "de pie".`);
    }
    const oldShape = sectorShape(existing);
    const newShape = s.points ?? (s.rect ? rectToPolygon(s.rect) : null);
    if (!newShape) {
      throw new ConflictException(`El sector "${existing.name}" tiene mesas o asientos: no se puede quitar del plano.`);
    }
    if (!oldShape) return;
    const move = translationOf(oldShape, newShape);
    if (move && move.dx === 0 && move.dy === 0) return;
    if (move) {
      await tx.update(sectorTable).set({ x: sql`${sectorTable.x} + ${move.dx}`, y: sql`${sectorTable.y} + ${move.dy}` }).where(eq(sectorTable.sectorId, existing.id));
      await tx.update(seat).set({ x: sql`${seat.x} + ${move.dx}`, y: sql`${seat.y} + ${move.dy}` }).where(eq(seat.sectorId, existing.id));
      return;
    }
    const tables = await tx.select({ x: sectorTable.x, y: sectorTable.y }).from(sectorTable).where(eq(sectorTable.sectorId, existing.id));
    const seats = await tx.select({ x: seat.x, y: seat.y }).from(seat).where(eq(seat.sectorId, existing.id));
    if ([...tables, ...seats].some((p) => !pointInPolygon(p, newShape))) {
      throw new ConflictException(
        `El sector "${existing.name}" tiene mesas o asientos que quedarían fuera de la nueva forma: ajústalos antes de cambiarla.`,
      );
    }
  }

  private async sectorUsage(tx: Tx, sectorIds: string[]): Promise<Map<string, SectorUsage>> {
    const usage = new Map<string, SectorUsage>();
    if (sectorIds.length === 0) return usage;
    const ensure = (id: string) => {
      let u = usage.get(id);
      if (!u) {
        u = { tiers: 0, tickets: 0, maxPerEvent: 0 };
        usage.set(id, u);
      }
      return u;
    };

    const tierRows = await tx
      .select({ sectorId: tier.sectorId, n: sql<number>`count(*)::int` })
      .from(tier)
      .where(inArray(tier.sectorId, sectorIds))
      .groupBy(tier.sectorId);
    for (const r of tierRows) ensure(r.sectorId).tiers = r.n;

    const ticketRows = await tx
      .select({ sectorId: ticket.sectorId, n: sql<number>`count(*)::int` })
      .from(ticket)
      .where(inArray(ticket.sectorId, sectorIds))
      .groupBy(ticket.sectorId, ticket.eventId);
    for (const r of ticketRows) {
      const u = ensure(r.sectorId);
      u.tickets += r.n;
      u.maxPerEvent = Math.max(u.maxPerEvent, r.n);
    }
    return usage;
  }
}
