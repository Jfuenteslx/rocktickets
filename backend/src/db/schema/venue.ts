import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  check,
  unique,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { eventStatusEnum, tierKindEnum } from './enums.js';
import { organizer } from './identity.js';

// Venue: el local físico. SIN capacidad propia — el aforo se calcula sumando
// la capacidad de sus sectores (una sola fuente de verdad).
export const venue = pgTable('venue', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Sector: zona física del venue (General, VIP, Balcón…). Depende del VENUE,
// no del evento: se define una vez y todos los eventos del local lo reutilizan.
export const sector = pgTable('sector', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').notNull().references(() => venue.id),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('sector_venue_id_idx').on(table.venueId),
  unique('sector_venue_name_unique').on(table.venueId, table.name),
  check('sector_capacity_positive', sql`${table.capacity} > 0`),
]);

export const event = pgTable('event', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').notNull().references(() => venue.id),
  // Dueño del evento. Todo el filtrado de seguridad por organizador parte de acá.
  organizerId: uuid('organizer_id').notNull().references(() => organizer.id),
  // Comisión (%) que Rocktickets descuenta al organizador en ESTE evento. Se copia
  // de organizer.default_commission_pct al crear el evento, así cambiar el valor
  // por defecto después no altera eventos existentes. NULL = sin definir.
  commissionPct: numeric('commission_pct', { precision: 5, scale: 2 }),
  name: text('name').notNull(),
  description: text('description'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  // Ruta relativa de la imagen en el disco del backend (NULL = sin imagen)
  imagePath: text('image_path'),
  status: eventStatusEnum('status').notNull().default('ACTIVO'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('event_venue_id_idx').on(table.venueId),
  index('event_organizer_id_idx').on(table.organizerId),
  check(
    'event_commission_range',
    sql`${table.commissionPct} IS NULL OR (${table.commissionPct} >= 0 AND ${table.commissionPct} <= 100)`,
  ),
  index('event_status_starts_idx').on(table.status, table.startsAt),
  check('event_valid_time_range', sql`${table.endsAt} > ${table.startsAt}`),
]);

// Tier: condición comercial (precio + ventana) aplicada a un grupo de tickets
// YA CREADOS de un sector del evento. No guarda stock: el stock es la cantidad
// de tickets que le asignaron (derivado, nunca almacenado).
export const tier = pgTable('tier', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => event.id),
  sectorId: uuid('sector_id').notNull().references(() => sector.id),
  name: text('name').notNull(),
  kind: tierKindEnum('kind').notNull().default('VENTA'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  isPaused: boolean('is_paused').notNull().default(false),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('tier_event_id_idx').on(table.eventId),
  index('tier_sector_id_idx').on(table.sectorId),
  unique('tier_event_sector_name_unique').on(table.eventId, table.sectorId, table.name),
  // Objetivo de la FK compuesta de ticket: garantiza que un ticket y su tier
  // coincidan en evento y sector. Es un ÍNDICE único (no un CONSTRAINT) a
  // propósito: AdminJS/@adminjs/sql lee los constraints y, si "id" aparece en
  // un UNIQUE compuesto, deja de reconocerlo como clave primaria.
  uniqueIndex('tier_id_event_sector_unique').on(table.id, table.eventId, table.sectorId),
  check('tier_price_non_negative', sql`${table.price} >= 0`),
  // Una cortesía es gratis por definición
  check('tier_courtesy_is_free', sql`${table.kind} <> 'CORTESIA' OR ${table.price} = 0`),
  check(
    'tier_valid_window',
    sql`${table.startsAt} IS NULL OR ${table.endsAt} IS NULL OR ${table.startsAt} < ${table.endsAt}`,
  ),
]);

export const venueRelations = relations(venue, ({ many }) => ({
  sectors: many(sector),
  events: many(event),
}));

export const sectorRelations = relations(sector, ({ one, many }) => ({
  venue: one(venue, { fields: [sector.venueId], references: [venue.id] }),
  tiers: many(tier),
}));

export const eventRelations = relations(event, ({ one, many }) => ({
  venue: one(venue, { fields: [event.venueId], references: [venue.id] }),
  tiers: many(tier),
}));

export const tierRelations = relations(tier, ({ one }) => ({
  event: one(event, { fields: [tier.eventId], references: [event.id] }),
  sector: one(sector, { fields: [tier.sectorId], references: [sector.id] }),
}));
