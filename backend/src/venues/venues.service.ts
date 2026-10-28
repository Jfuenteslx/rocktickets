import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { sector, ticket, venue } from '../db/index.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import type { AuthUser } from '../auth/access.js';
import type { CreateSectorDto, CreateVenueDto, UpdateSectorDto, UpdateVenueDto } from './dto/venue.dto.js';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

// Los locales son de la plataforma: solo el superadmin los gestiona (venues:manage).
// No hay borrado a propósito: un local o sector con historial de eventos no debe desaparecer.
@Injectable()
export class VenuesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLog: AuditLogService,
  ) {}

  async create(dto: CreateVenueDto, actor: AuthUser) {
    const [created] = await this.db.insert(venue).values({ name: dto.name.trim() }).returning();
    await this.auditLog.log(actor.sub, 'VENUE_CREATED', 'Venue', created.id, { name: created.name });
    return { id: created.id, name: created.name, capacity: 0, sectors: [] };
  }

  async update(id: string, dto: UpdateVenueDto, actor: AuthUser) {
    const [existing] = await this.db.select().from(venue).where(eq(venue.id, id)).limit(1);
    if (!existing) throw new NotFoundException('Local no encontrado');
    if (dto.name === undefined) return existing;
    const [updated] = await this.db.update(venue).set({ name: dto.name.trim() }).where(eq(venue.id, id)).returning();
    await this.auditLog.log(actor.sub, 'VENUE_UPDATED', 'Venue', id, { name: updated.name });
    return updated;
  }

  async createSector(venueId: string, dto: CreateSectorDto, actor: AuthUser) {
    const [v] = await this.db.select().from(venue).where(eq(venue.id, venueId)).limit(1);
    if (!v) throw new NotFoundException('Local no encontrado');
    try {
      const [created] = await this.db
        .insert(sector)
        .values({ venueId, name: dto.name.trim(), capacity: dto.capacity })
        .returning();
      await this.auditLog.log(actor.sub, 'SECTOR_CREATED', 'Sector', created.id, { venueId, capacity: created.capacity });
      return { id: created.id, name: created.name, capacity: created.capacity };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ese local ya tiene un sector con ese nombre');
      throw err;
    }
  }

  async updateSector(id: string, dto: UpdateSectorDto, actor: AuthUser) {
    const [existing] = await this.db.select().from(sector).where(eq(sector.id, id)).limit(1);
    if (!existing) throw new NotFoundException('Sector no encontrado');

    if (dto.capacity !== undefined && dto.capacity < existing.capacity) {
      // No se puede dejar el aforo por debajo de lo ya generado en algún evento
      const rows = await this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(ticket)
        .where(eq(ticket.sectorId, id))
        .groupBy(ticket.eventId);
      const maxGenerated = rows.reduce((m, r) => Math.max(m, r.n), 0);
      if (dto.capacity < maxGenerated) {
        throw new ConflictException(
          `Ya hay eventos con ${maxGenerated} tickets generados en este sector: el aforo no puede ser menor.`,
        );
      }
    }

    const changes: Partial<typeof sector.$inferInsert> = {};
    if (dto.name !== undefined) changes.name = dto.name.trim();
    if (dto.capacity !== undefined) changes.capacity = dto.capacity;
    if (Object.keys(changes).length === 0) return existing;

    try {
      const [updated] = await this.db.update(sector).set(changes).where(eq(sector.id, id)).returning();
      await this.auditLog.log(actor.sub, 'SECTOR_UPDATED', 'Sector', id, { changes });
      return { id: updated.id, name: updated.name, capacity: updated.capacity };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ese local ya tiene un sector con ese nombre');
      throw err;
    }
  }
}
