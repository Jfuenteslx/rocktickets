import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './identity.js';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  performedBy: uuid('performed_by').notNull().references(() => user.id),
  action: text('action').notNull(), // ej: 'EVENT_CANCELLED', 'TIER_PRICE_UPDATED'
  // entityType + entityId son una referencia polimórfica DELIBERADA — no hay
  // FK real de Postgres que pueda apuntar a Event, Tier, Order, etc. a la vez.
  // No se agrega una FK "de conveniencia" a una sola entidad para no romper
  // esa generalidad (ver discusión: no forzar order_id solo para una acción).
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  metadata: jsonb('metadata'), // ej: { old_price: 50, new_price: 70 }
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('audit_log_entity_idx').on(table.entityType, table.entityId),
  index('audit_log_performed_by_idx').on(table.performedBy),
  index('audit_log_created_at_idx').on(table.createdAt),
]);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  performer: one(user, { fields: [auditLog.performedBy], references: [user.id] }),
}));
