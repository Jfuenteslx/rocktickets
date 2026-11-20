import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { asc, eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { sector, ticket, venue, venueLevel, venuePhoto } from '../db/index.js';
import { isGoogleMapsUrl, MAX_VENUE_PHOTOS, VENUE_PHOTOS_DIR } from './venue-profile.constants.js';
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
    // Todo local nace con su nivel "Planta baja": el plano siempre tiene dónde dibujar
    const created = await this.db.transaction(async (tx) => {
      const [v] = await tx.insert(venue).values({ name: dto.name.trim() }).returning();
      await tx.insert(venueLevel).values({ venueId: v.id, name: 'Planta baja', position: 0 });
      return v;
    });
    await this.auditLog.log(actor.sub, 'VENUE_CREATED', 'Venue', created.id, { name: created.name });
    return { id: created.id, name: created.name, capacity: 0, sectors: [] };
  }

  async update(id: string, dto: UpdateVenueDto, actor: AuthUser) {
    const [existing] = await this.db.select().from(venue).where(eq(venue.id, id)).limit(1);
    if (!existing) throw new NotFoundException('Local no encontrado');

    const changes: Partial<typeof venue.$inferInsert> = {};
    if (dto.name !== undefined) changes.name = dto.name.trim();
    if (dto.address !== undefined) changes.address = dto.address.trim() || null;
    if (dto.mapsUrl !== undefined) {
      const url = dto.mapsUrl.trim();
      if (url && !isGoogleMapsUrl(url)) {
        throw new BadRequestException('El enlace debe ser de Google Maps (https://maps.app.goo.gl/… o https://www.google.com/maps/…)');
      }
      changes.mapsUrl = url || null;
    }
    if (dto.openingHours !== undefined) {
      const days = dto.openingHours.map((d) => d.day);
      if (new Set(days).size !== days.length) throw new BadRequestException('Hay un día de la semana repetido en los horarios');
      changes.openingHours = dto.openingHours
        .map((d) => (d.closed ? { day: d.day, closed: true } : { day: d.day, closed: false, open: d.open, close: d.close }))
        .sort((a, b) => a.day - b.day);
    }
    if (Object.keys(changes).length === 0) return existing;

    const [updated] = await this.db.update(venue).set(changes).where(eq(venue.id, id)).returning();
    await this.auditLog.log(actor.sub, 'VENUE_UPDATED', 'Venue', id, { fields: Object.keys(changes) });
    return updated;
  }

  // Ficha completa del local para el panel (datos, horarios y fotos en orden)
  async getProfile(id: string) {
    const [v] = await this.db.select().from(venue).where(eq(venue.id, id)).limit(1);
    if (!v) throw new NotFoundException('Local no encontrado');
    const photos = await this.db.select().from(venuePhoto).where(eq(venuePhoto.venueId, id)).orderBy(asc(venuePhoto.position), asc(venuePhoto.createdAt));
    return {
      id: v.id,
      name: v.name,
      address: v.address,
      mapsUrl: v.mapsUrl,
      openingHours: v.openingHours ?? [],
      maxPhotos: MAX_VENUE_PHOTOS,
      photos: photos.map((p) => ({ id: p.id, url: `/uploads/${p.path}` })),
    };
  }

  async addPhoto(venueId: string, filename: string, actor: AuthUser) {
    const [v] = await this.db.select({ id: venue.id }).from(venue).where(eq(venue.id, venueId)).limit(1);
    if (!v) throw new NotFoundException('Local no encontrado');

    // Bloquea el local mientras cuenta, para que dos subidas a la vez no pasen del límite
    const created = await this.db.transaction(async (tx) => {
      await tx.select({ id: venue.id }).from(venue).where(eq(venue.id, venueId)).for('update');
      const rows = await tx.select({ position: venuePhoto.position }).from(venuePhoto).where(eq(venuePhoto.venueId, venueId));
      if (rows.length >= MAX_VENUE_PHOTOS) {
        throw new ConflictException(`Un local admite hasta ${MAX_VENUE_PHOTOS} fotos. Elimina alguna para subir otra.`);
      }
      const next = rows.reduce((m, r) => Math.max(m, r.position), -1) + 1;
      const [p] = await tx.insert(venuePhoto).values({ venueId, path: `venues/${filename}`, position: next }).returning();
      return p;
    });
    await this.auditLog.log(actor.sub, 'VENUE_PHOTO_ADDED', 'Venue', venueId, { photoId: created.id });
    return { id: created.id, url: `/uploads/${created.path}` };
  }

  async deletePhoto(venueId: string, photoId: string, actor: AuthUser) {
    const [p] = await this.db.select().from(venuePhoto).where(eq(venuePhoto.id, photoId)).limit(1);
    if (!p || p.venueId !== venueId) throw new NotFoundException('Foto no encontrada');
    await this.db.delete(venuePhoto).where(eq(venuePhoto.id, photoId));
    await rm(join(VENUE_PHOTOS_DIR, p.path.replace(/^venues\//, '')), { force: true });
    await this.auditLog.log(actor.sub, 'VENUE_PHOTO_DELETED', 'Venue', venueId, { photoId });
    return { ok: true };
  }

  // Nuevo orden de las fotos: debe traer exactamente las fotos que ya tiene el local
  async reorderPhotos(venueId: string, photoIds: string[], actor: AuthUser) {
    const rows = await this.db.select({ id: venuePhoto.id }).from(venuePhoto).where(eq(venuePhoto.venueId, venueId));
    const existing = new Set(rows.map((r) => r.id));
    if (photoIds.length !== existing.size || new Set(photoIds).size !== photoIds.length || !photoIds.every((i) => existing.has(i))) {
      throw new BadRequestException('La lista de fotos no coincide con las del local');
    }
    await this.db.transaction(async (tx) => {
      for (const [position, id] of photoIds.entries()) {
        await tx.update(venuePhoto).set({ position }).where(eq(venuePhoto.id, id));
      }
    });
    await this.auditLog.log(actor.sub, 'VENUE_PHOTOS_REORDERED', 'Venue', venueId, {});
    return this.getProfile(venueId);
  }

  async createSector(venueId: string, dto: CreateSectorDto, actor: AuthUser) {
    const [v] = await this.db.select().from(venue).where(eq(venue.id, venueId)).limit(1);
    if (!v) throw new NotFoundException('Local no encontrado');
    // El sector nuevo queda "sin ubicar" en el primer nivel del local (se dibuja luego en el plano)
    const [firstLevel] = await this.db
      .select({ id: venueLevel.id })
      .from(venueLevel)
      .where(eq(venueLevel.venueId, venueId))
      .orderBy(asc(venueLevel.position), asc(venueLevel.name))
      .limit(1);
    try {
      const [created] = await this.db
        .insert(sector)
        .values({ venueId, levelId: firstLevel?.id ?? null, name: dto.name.trim(), capacity: dto.capacity })
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
