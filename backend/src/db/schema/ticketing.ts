import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
  check,
  foreignKey,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { ticketStatusEnum, accessResultEnum } from './enums.js';
import { event, sector, tier } from './venue.js';
import { orderItem } from './commerce.js';
import { user } from './identity.js';

// Courtesy: registro propio de una entrada gratuita emitida por un ADMIN.
// Separado de Order/Payment a propósito: no hay compra ni cobro.
export const courtesy = pgTable('courtesy', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => event.id),
  recipientName: text('recipient_name').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  reason: text('reason'),
  issuedBy: uuid('issued_by').notNull().references(() => user.id),
  // "Llave" del enlace público donde el invitado ve y descarga sus entradas
  // (misma idea que order.access_token: poseer el link = acceso).
  accessToken: uuid('access_token').notNull().defaultRandom().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('courtesy_event_id_idx').on(table.eventId),
]);

// Ticket: existe ANTES de la venta (lo crea "Generar tickets"). Su dueño
// (orden o cortesía) se completa después; el estado dice cuál es válido.
export const ticket = pgTable('ticket', {
  id: uuid('id').primaryKey().defaultRandom(), // contenido literal del QR
  eventId: uuid('event_id').notNull().references(() => event.id),
  sectorId: uuid('sector_id').notNull().references(() => sector.id),
  // NULL = sin tier: fuera de venta, reservado para el organizador
  tierId: uuid('tier_id'),
  orderItemId: uuid('order_item_id').references(() => orderItem.id),
  courtesyId: uuid('courtesy_id').references(() => courtesy.id),
  // Legible para el staff; único dentro del evento
  shortCode: text('short_code').notNull(),
  status: ticketStatusEnum('status').notNull().default('DISPONIBLE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ticket_event_status_idx').on(table.eventId, table.status),
  index('ticket_tier_status_idx').on(table.tierId, table.status),
  index('ticket_order_item_id_idx').on(table.orderItemId),
  index('ticket_courtesy_id_idx').on(table.courtesyId),
  unique('ticket_event_short_code_unique').on(table.eventId, table.shortCode),
  // El tier debe ser del mismo evento y sector que el ticket
  foreignKey({
    name: 'ticket_tier_coherence_fk',
    columns: [table.tierId, table.eventId, table.sectorId],
    foreignColumns: [tier.id, tier.eventId, tier.sectorId],
  }),
  // Coherencia estado ↔ dueño
  check(
    'ticket_owner_matches_status',
    sql`(
      (${table.status} = 'DISPONIBLE' AND ${table.orderItemId} IS NULL AND ${table.courtesyId} IS NULL)
      OR (${table.status} = 'RESERVADO' AND ${table.orderItemId} IS NOT NULL AND ${table.courtesyId} IS NULL)
      OR (${table.status} IN ('VALIDO','UTILIZADO') AND (${table.orderItemId} IS NULL) <> (${table.courtesyId} IS NULL))
      OR (${table.status} = 'ANULADO' AND NOT (${table.orderItemId} IS NOT NULL AND ${table.courtesyId} IS NOT NULL))
    )`,
  ),
  // Vendido, reservado o regalado ⇒ debe tener tier
  check(
    'ticket_owned_requires_tier',
    sql`${table.status} IN ('DISPONIBLE','ANULADO') OR ${table.tierId} IS NOT NULL`,
  ),
]);

export const access = pgTable('access', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => ticket.id),
  performedBy: uuid('performed_by').notNull().references(() => user.id),
  result: accessResultEnum('result').notNull(),
  deviceId: text('device_id').notNull(),
  // QR = leído con la cámara; MANUAL = el staff lo buscó por nombre (queda marcado para auditoría)
  method: text('method').notNull().default('QR'),
  scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('access_ticket_id_idx').on(table.ticketId),
  index('access_scanned_at_idx').on(table.scannedAt),
]);

// Personal de puerta asignado a un evento. El staff solo escanea (y ve en vivo)
// los eventos a los que lo asignó el superadmin o el organizador dueño del evento.
export const staffEvent = pgTable('staff_event', {
  userId: uuid('user_id').notNull().references(() => user.id),
  eventId: uuid('event_id').notNull().references(() => event.id),
  assignedBy: uuid('assigned_by').notNull().references(() => user.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.eventId] }),
  index('staff_event_event_id_idx').on(table.eventId),
]);

export const courtesyRelations = relations(courtesy, ({ one, many }) => ({
  event: one(event, { fields: [courtesy.eventId], references: [event.id] }),
  issuer: one(user, { fields: [courtesy.issuedBy], references: [user.id] }),
  tickets: many(ticket),
}));

export const ticketRelations = relations(ticket, ({ one, many }) => ({
  event: one(event, { fields: [ticket.eventId], references: [event.id] }),
  sector: one(sector, { fields: [ticket.sectorId], references: [sector.id] }),
  tier: one(tier, { fields: [ticket.tierId], references: [tier.id] }),
  orderItem: one(orderItem, { fields: [ticket.orderItemId], references: [orderItem.id] }),
  courtesy: one(courtesy, { fields: [ticket.courtesyId], references: [courtesy.id] }),
  accessLog: many(access),
}));

export const accessRelations = relations(access, ({ one }) => ({
  ticket: one(ticket, { fields: [access.ticketId], references: [ticket.id] }),
  operator: one(user, { fields: [access.performedBy], references: [user.id] }),
}));
