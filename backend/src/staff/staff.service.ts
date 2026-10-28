import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { organizer, user } from '../db/index.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { canManageOrganizer, type AuthUser } from '../auth/access.js';
import type { CreateStaffDto } from './dto/staff.dto.js';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

// Nunca devolvemos passwordHash
const publicColumns = {
  id: user.id,
  name: user.name,
  email: user.email,
  organizerId: user.organizerId,
  approvalStatus: user.approvalStatus,
  isActive: user.isActive,
  createdAt: user.createdAt,
};

@Injectable()
export class StaffService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLog: AuditLogService,
  ) {}

  // Superadmin: todo el personal de puerta. Organizador: solo el suyo.
  list(actor: AuthUser, filterOrganizerId?: string) {
    const scope =
      actor.role === 'SUPERADMIN'
        ? filterOrganizerId
          ? eq(user.organizerId, filterOrganizerId)
          : undefined
        : eq(user.organizerId, actor.organizerId ?? '');
    return this.db
      .select({ ...publicColumns, organizerName: organizer.name })
      .from(user)
      .leftJoin(organizer, eq(organizer.id, user.organizerId))
      .where(scope ? and(eq(user.role, 'STAFF_PUERTA'), scope) : eq(user.role, 'STAFF_PUERTA'))
      .orderBy(user.createdAt);
  }

  async create(dto: CreateStaffDto, actor: AuthUser) {
    let organizerId: string | null;
    let approvalStatus: 'PENDIENTE' | 'APROBADO';

    if (actor.role === 'ORGANIZADOR') {
      if (dto.organizerId && dto.organizerId !== actor.organizerId) {
        throw new ForbiddenException('No puedes crear personal para otra organización');
      }
      organizerId = actor.organizerId;
      approvalStatus = 'PENDIENTE'; // requiere aprobación del superadmin
    } else {
      organizerId = dto.organizerId ?? null; // null = personal de Rocktickets
      approvalStatus = 'APROBADO';
      if (organizerId) {
        const [org] = await this.db.select().from(organizer).where(eq(organizer.id, organizerId)).limit(1);
        if (!org) throw new NotFoundException('Organizador no encontrado');
      }
    }

    try {
      const [created] = await this.db
        .insert(user)
        .values({
          email: dto.email.toLowerCase(),
          name: dto.name,
          passwordHash: await bcrypt.hash(dto.password, 10),
          role: 'STAFF_PUERTA',
          organizerId,
          approvalStatus,
        })
        .returning(publicColumns);
      await this.auditLog.log(actor.sub, 'STAFF_CREATED', 'User', created.id, { organizerId, approvalStatus });
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ya existe un usuario con ese email');
      throw err;
    }
  }

  // Solo superadmin (el permiso lo exige el controller)
  async setApproval(staffId: string, status: 'APROBADO' | 'RECHAZADO', actor: AuthUser) {
    const [updated] = await this.db
      .update(user)
      .set({ approvalStatus: status })
      .where(and(eq(user.id, staffId), eq(user.role, 'STAFF_PUERTA')))
      .returning(publicColumns);
    if (!updated) throw new NotFoundException('Personal no encontrado');
    await this.auditLog.log(actor.sub, `STAFF_${status}`, 'User', staffId);
    return updated;
  }

  async setActive(staffId: string, isActive: boolean, actor: AuthUser) {
    const [target] = await this.db
      .select({ id: user.id, organizerId: user.organizerId })
      .from(user)
      .where(and(eq(user.id, staffId), eq(user.role, 'STAFF_PUERTA')))
      .limit(1);
    // Un organizador solo gestiona a su gente; personal de Rocktickets (sin organizador) o de otros: "no existe"
    if (!target || (target.organizerId ? !canManageOrganizer(actor, target.organizerId) : actor.role !== 'SUPERADMIN')) {
      throw new NotFoundException('Personal no encontrado');
    }
    const [updated] = await this.db
      .update(user)
      .set({ isActive })
      .where(eq(user.id, staffId))
      .returning(publicColumns);
    await this.auditLog.log(actor.sub, isActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED', 'User', staffId);
    return updated;
  }
}
