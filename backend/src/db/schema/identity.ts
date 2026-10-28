import { pgTable, uuid, text, boolean, timestamp, numeric, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { userRoleEnum, approvalStatusEnum } from './enums.js';

// Organizer: quien produce eventos en la plataforma (puede ser Rocktickets mismo
// o un tercero). Es el "inquilino": todo lo que un organizador ve y administra
// cuelga de acá (eventos, su personal, sus ventas).
export const organizer = pgTable('organizer', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  // Comisión que Rocktickets descuenta al organizador. NULL = aún sin definir
  // (el modelo de negocio se cierra después). Es el valor POR DEFECTO: cada
  // evento guarda su propia copia al crearse (event.commission_pct).
  defaultCommissionPct: numeric('default_commission_pct', { precision: 5, scale: 2 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    'organizer_commission_range',
    sql`${table.defaultCommissionPct} IS NULL OR (${table.defaultCommissionPct} >= 0 AND ${table.defaultCommissionPct} <= 100)`,
  ),
]);

export const user = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull(),
  // NULL = personal/administración de Rocktickets. Con valor = pertenece a ese organizador.
  organizerId: uuid('organizer_id').references(() => organizer.id),
  approvalStatus: approvalStatusEnum('approval_status').notNull().default('APROBADO'),
  // Desactivación, nunca borrado físico — Access.performedBy necesita seguir
  // apuntando a alguien real para conservar el historial de la puerta.
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('user_organizer_id_idx').on(table.organizerId),
  // SUPERADMIN nunca tiene organizador; ORGANIZADOR siempre; STAFF_PUERTA puede o no.
  check(
    'user_role_organizer_coherence',
    sql`(${table.role} = 'SUPERADMIN' AND ${table.organizerId} IS NULL)
        OR (${table.role} = 'ORGANIZADOR' AND ${table.organizerId} IS NOT NULL)
        OR ${table.role} = 'STAFF_PUERTA'`,
  ),
]);

// Las relaciones (Order.user_id, Access.performed_by, AuditLog.performed_by)
// se definen en cada archivo dependiente, no acá, para evitar imports circulares.
