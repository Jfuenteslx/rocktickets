import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
  check,
  unique,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  eventStatusEnum,
  seatingModeEnum,
  tierKindEnum,
  sectorTypeEnum,
  sectorViewEnum,
  venueElementKindEnum,
} from './enums.js';
import { organizer } from './identity.js';

// Venue: el local físico. SIN capacidad propia — el aforo se calcula sumando
// la capacidad de sus sectores (una sola fuente de verdad).
export const venue = pgTable('venue', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Ficha pública del local
  address: text('address'),
  // Enlace de Google Maps (botón "Cómo llegar"); el mapa incrustado se arma con la dirección
  mapsUrl: text('maps_url'),
  // Horarios habituales: [{ day: 0-6 (0 = domingo), closed, open: 'HH:MM', close: 'HH:MM' }]
  openingHours: jsonb('opening_hours'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Fotos de referencia del local (hasta 10). `position` define el orden; la primera es la portada.
export const venuePhoto = pgTable('venue_photo', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').notNull().references(() => venue.id),
  path: text('path').notNull(), // relativo a /uploads, p. ej. venues/<uuid>.jpg
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('venue_photo_venue_id_idx').on(table.venueId),
]);

// Nivel del plano: Planta baja, Mezanine, Galería… Cada nivel tiene su propio lienzo.
// Lo dibujado en un nivel (sectores y elementos) nunca se superpone con otro nivel.
export const venueLevel = pgTable('venue_level', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').notNull().references(() => venue.id),
  name: text('name').notNull(),
  // Orden de las pestañas en el editor y en el mapa público
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('venue_level_venue_id_idx').on(table.venueId),
  unique('venue_level_venue_name_unique').on(table.venueId, table.name),
]);

// Sector: zona física del venue (General, VIP, Balcón…). Depende del VENUE,
// no del evento: se define una vez y todos los eventos del local lo reutilizan.
//
// Plano: x, y, w, h son unidades del lienzo lógico del nivel (la escala exacta la
// fija el editor). Las cuatro son NULL a la vez = sector todavía "sin ubicar" en el plano.
export const sector = pgTable('sector', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').notNull().references(() => venue.id),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull(),
  // NULL = sin nivel asignado (sectores creados antes del plano o desde AdminJS)
  levelId: uuid('level_id').references(() => venueLevel.id),
  type: sectorTypeEnum('type').notNull().default('MIXTO'),
  view: sectorViewEnum('view').notNull().default('LIBRE'),
  accessible: boolean('accessible').notNull().default(false),
  // false = fuera del aforo y de los eventos (no suma, no admite tiers ni tickets nuevos)
  sellable: boolean('sellable').notNull().default(true),
  color: text('color').notNull().default('#F28C0F'),
  // Texto que ve el comprador al elegir en este sector
  buyerText: text('buyer_text'),
  // Caja que envuelve al sector (o el rectángulo, si no tiene `points`)
  x: integer('x'),
  y: integer('y'),
  w: integer('w'),
  h: integer('h'),
  // NULL = el sector es un rectángulo. Con valor: vértices del polígono irregular, [{x, y}, ...]
  points: jsonb('points').$type<{ x: number; y: number }[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('sector_venue_id_idx').on(table.venueId),
  index('sector_level_id_idx').on(table.levelId),
  unique('sector_venue_name_unique').on(table.venueId, table.name),
  check('sector_capacity_positive', sql`${table.capacity} > 0`),
  // Posición completa o ninguna; si existe, con tamaño positivo
  check(
    'sector_plan_rect_valid',
    sql`(${table.x} IS NULL AND ${table.y} IS NULL AND ${table.w} IS NULL AND ${table.h} IS NULL)
      OR (${table.x} IS NOT NULL AND ${table.y} IS NOT NULL AND ${table.w} > 0 AND ${table.h} > 0
          AND ${table.x} >= 0 AND ${table.y} >= 0)`,
  ),
  // Un polígono es una lista de 3 a 64 vértices y siempre viene con su caja (x, y, w, h)
  check(
    'sector_points_valid',
    sql`${table.points} IS NULL
      OR (jsonb_typeof(${table.points}) = 'array'
          AND jsonb_array_length(${table.points}) BETWEEN 3 AND 64
          AND ${table.x} IS NOT NULL)`,
  ),
]);

// Elemento de referencia del plano (escenario, barra, baños, salida de emergencia…).
// No se vende ni tiene aforo. Si se borra el nivel, se borran sus elementos.
export const venueElement = pgTable('venue_element', {
  id: uuid('id').primaryKey().defaultRandom(),
  levelId: uuid('level_id').notNull().references(() => venueLevel.id, { onDelete: 'cascade' }),
  kind: venueElementKindEnum('kind').notNull(),
  name: text('name').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  w: integer('w').notNull(),
  h: integer('h').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('venue_element_level_id_idx').on(table.levelId),
  check('venue_element_rect_valid', sql`${table.x} >= 0 AND ${table.y} >= 0 AND ${table.w} > 0 AND ${table.h} > 0`),
]);

// Mesa de un sector (creador de venues, fase 2). x, y = centro de la mesa en el lienzo del nivel.
// Si se borra el sector se borran sus mesas y asientos.
export const sectorTable = pgTable('sector_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').notNull().references(() => sector.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
}, (table) => [
  index('sector_table_sector_id_idx').on(table.sectorId),
  unique('sector_table_sector_label_unique').on(table.sectorId, table.label),
  check('sector_table_pos_valid', sql`${table.x} >= 0 AND ${table.y} >= 0`),
]);

// Asiento: de una mesa (A, B, C…) o de una fila de butacas (fila "C", asiento "12").
// active = false: asiento quitado del mapa sin borrarlo (no cuenta en el aforo).
export const seat = pgTable('seat', {
  id: uuid('id').primaryKey().defaultRandom(),
  sectorId: uuid('sector_id').notNull().references(() => sector.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id').references(() => sectorTable.id, { onDelete: 'cascade' }),
  rowLabel: text('row_label'),
  label: text('label').notNull(),
  x: integer('x').notNull(),
  y: integer('y').notNull(),
  active: boolean('active').notNull().default(true),
}, (table) => [
  index('seat_sector_id_idx').on(table.sectorId),
  index('seat_table_id_idx').on(table.tableId),
  // De mesa: etiqueta única dentro de la mesa. De fila: única dentro de la fila del sector.
  uniqueIndex('seat_table_label_unique').on(table.tableId, table.label).where(sql`${table.tableId} IS NOT NULL`),
  uniqueIndex('seat_row_label_unique').on(table.sectorId, table.rowLabel, table.label).where(sql`${table.tableId} IS NULL`),
  check('seat_owner_valid', sql`${table.tableId} IS NOT NULL OR ${table.rowLabel} IS NOT NULL`),
  check('seat_pos_valid', sql`${table.x} >= 0 AND ${table.y} >= 0`),
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
  // Categoría para agrupar eventos en la web pública (valores en events/event-categories.ts)
  category: text('category').notNull().default('CONCIERTO'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  // Ruta relativa de la imagen en el disco del backend (NULL = sin imagen)
  imagePath: text('image_path'),
  status: eventStatusEnum('status').notNull().default('ACTIVO'),
  // Cómo se ubica el público (ver seatingModeEnum). Solo cambia mientras no haya ventas.
  seatingMode: seatingModeEnum('seating_mode').notNull().default('NINGUNO'),
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

export const venuePhotoRelations = relations(venuePhoto, ({ one }) => ({
  venue: one(venue, { fields: [venuePhoto.venueId], references: [venue.id] }),
}));

export const venueRelations = relations(venue, ({ many }) => ({
  photos: many(venuePhoto),
  levels: many(venueLevel),
  sectors: many(sector),
  events: many(event),
}));

export const venueLevelRelations = relations(venueLevel, ({ one, many }) => ({
  venue: one(venue, { fields: [venueLevel.venueId], references: [venue.id] }),
  sectors: many(sector),
  elements: many(venueElement),
}));

export const venueElementRelations = relations(venueElement, ({ one }) => ({
  level: one(venueLevel, { fields: [venueElement.levelId], references: [venueLevel.id] }),
}));

export const sectorRelations = relations(sector, ({ one, many }) => ({
  venue: one(venue, { fields: [sector.venueId], references: [venue.id] }),
  level: one(venueLevel, { fields: [sector.levelId], references: [venueLevel.id] }),
  tiers: many(tier),
  tables: many(sectorTable),
  seats: many(seat),
}));

export const sectorTableRelations = relations(sectorTable, ({ one, many }) => ({
  sector: one(sector, { fields: [sectorTable.sectorId], references: [sector.id] }),
  seats: many(seat),
}));

export const seatRelations = relations(seat, ({ one }) => ({
  sector: one(sector, { fields: [seat.sectorId], references: [sector.id] }),
  table: one(sectorTable, { fields: [seat.tableId], references: [sectorTable.id] }),
}));

export const eventRelations = relations(event, ({ one, many }) => ({
  venue: one(venue, { fields: [event.venueId], references: [venue.id] }),
  tiers: many(tier),
}));

export const tierRelations = relations(tier, ({ one }) => ({
  event: one(event, { fields: [tier.eventId], references: [event.id] }),
  sector: one(sector, { fields: [tier.sectorId], references: [sector.id] }),
}));
