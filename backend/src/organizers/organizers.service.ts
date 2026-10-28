import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { event, organizer, user } from '../db/index.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import type { AuthUser } from '../auth/access.js';
import type { CreateOrganizerAdminDto, CreateOrganizerDto, UpdateOrganizerDto } from './dto/organizer.dto.js';

// 23505 = unique_violation de Postgres (el driver a veces lo envuelve en `cause`)
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

@Injectable()
export class OrganizersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLog: AuditLogService,
  ) {}

  // Con conteos para la tabla del panel
  async list() {
    const orgs = await this.db.select().from(organizer).orderBy(organizer.name);
    const events = await this.db
      .select({ id: event.organizerId, n: sql<number>`count(*)::int` })
      .from(event)
      .groupBy(event.organizerId);
    const users = await this.db
      .select({ id: user.organizerId, role: user.role, approval: user.approvalStatus, n: sql<number>`count(*)::int` })
      .from(user)
      .where(sql`${user.organizerId} IS NOT NULL`)
      .groupBy(user.organizerId, user.role, user.approvalStatus);
    return orgs.map((o) => {
      const mine = users.filter((u) => u.id === o.id);
      const sum = (f: (u: (typeof mine)[number]) => boolean) => mine.filter(f).reduce((a, u) => a + u.n, 0);
      return {
        ...o,
        eventCount: events.find((e) => e.id === o.id)?.n ?? 0,
        adminCount: sum((u) => u.role === 'ORGANIZADOR'),
        staffCount: sum((u) => u.role === 'STAFF_PUERTA'),
        staffPending: sum((u) => u.role === 'STAFF_PUERTA' && u.approval === 'PENDIENTE'),
      };
    });
  }

  async listAdmins(organizerId: string) {
    const [org] = await this.db.select().from(organizer).where(eq(organizer.id, organizerId)).limit(1);
    if (!org) throw new NotFoundException('Organizador no encontrado');
    return this.db
      .select({ id: user.id, name: user.name, email: user.email, isActive: user.isActive, createdAt: user.createdAt })
      .from(user)
      .where(and(eq(user.organizerId, organizerId), eq(user.role, 'ORGANIZADOR')))
      .orderBy(user.createdAt);
  }

  async setAdminActive(organizerId: string, userId: string, isActive: boolean, actor: AuthUser) {
    const [updated] = await this.db
      .update(user)
      .set({ isActive })
      .where(and(eq(user.id, userId), eq(user.organizerId, organizerId), eq(user.role, 'ORGANIZADOR')))
      .returning({ id: user.id, name: user.name, email: user.email, isActive: user.isActive, createdAt: user.createdAt });
    if (!updated) throw new NotFoundException('Administrador no encontrado');
    await this.auditLog.log(actor.sub, isActive ? 'ORGANIZER_ADMIN_ACTIVATED' : 'ORGANIZER_ADMIN_DEACTIVATED', 'User', userId, { organizerId });
    return updated;
  }

  async create(dto: CreateOrganizerDto, actor: AuthUser) {
    try {
      const [created] = await this.db
        .insert(organizer)
        .values({
          name: dto.name,
          contactName: dto.contactName,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone,
          defaultCommissionPct: dto.defaultCommissionPct?.toFixed(2),
        })
        .returning();
      await this.auditLog.log(actor.sub, 'ORGANIZER_CREATED', 'Organizer', created.id, { name: created.name });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ya existe un organizador con ese nombre');
      throw err;
    }
  }

  async update(id: string, dto: UpdateOrganizerDto, actor: AuthUser) {
    const changes: Partial<typeof organizer.$inferInsert> = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.contactName !== undefined) changes.contactName = dto.contactName;
    if (dto.contactEmail !== undefined) changes.contactEmail = dto.contactEmail;
    if (dto.contactPhone !== undefined) changes.contactPhone = dto.contactPhone;
    if (dto.isActive !== undefined) changes.isActive = dto.isActive;
    // Cambiar la comisión por defecto NO toca los eventos ya creados (cada uno guarda su copia)
    if (dto.defaultCommissionPct !== undefined) changes.defaultCommissionPct = dto.defaultCommissionPct.toFixed(2);

    const [existing] = await this.db.select().from(organizer).where(eq(organizer.id, id)).limit(1);
    if (!existing) throw new NotFoundException('Organizador no encontrado');
    if (Object.keys(changes).length === 0) return existing;

    try {
      const [updated] = await this.db.update(organizer).set(changes).where(eq(organizer.id, id)).returning();
      await this.auditLog.log(actor.sub, 'ORGANIZER_UPDATED', 'Organizer', id, { changes });
      return updated;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ya existe un organizador con ese nombre');
      throw err;
    }
  }

  // Cuenta ORGANIZADOR (el administrador de esa organización). La crea el
  // superadmin y nace aprobada: la aprobación es para el personal de puerta.
  async createAdmin(organizerId: string, dto: CreateOrganizerAdminDto, actor: AuthUser) {
    const [org] = await this.db.select().from(organizer).where(eq(organizer.id, organizerId)).limit(1);
    if (!org) throw new NotFoundException('Organizador no encontrado');

    try {
      const [created] = await this.db
        .insert(user)
        .values({
          email: dto.email.toLowerCase(),
          name: dto.name,
          passwordHash: await bcrypt.hash(dto.password, 10),
          role: 'ORGANIZADOR',
          organizerId,
          approvalStatus: 'APROBADO',
        })
        .returning();
      await this.auditLog.log(actor.sub, 'ORGANIZER_ADMIN_CREATED', 'User', created.id, { organizerId });
      return { id: created.id, name: created.name, email: created.email, role: created.role, organizerId };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ya existe un usuario con ese email');
      throw err;
    }
  }
}
