import { pgTable, uuid, text, integer, numeric, timestamp, index, unique, primaryKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { event, sectorTable, tier } from './venue.js';
import { order } from './commerce.js';

// Modo MESAS_FIJAS. Un paquete es "N personas + botella a un precio" definido por evento.
// El precio incluye las entradas de cada persona: se reparte en partes iguales entre los
// tickets de la mesa (por eso price*100 debe ser divisible por people).
export const tablePackage = pgTable('table_package', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => event.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  people: integer('people').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  // Botellas incluidas, solo informativas (se muestran al comprador; se elige en el local)
  bottleOptions: text('bottle_options').array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('table_package_event_id_idx').on(table.eventId),
  unique('table_package_event_name_unique').on(table.eventId, table.name),
  check('table_package_people_positive', sql`${table.people} > 0`),
  check('table_package_price_positive', sql`${table.price} > 0`),
  check('table_package_price_splits', sql`mod(${table.price} * 100, ${table.people}) = 0`),
]);

// Qué paquete vende cada mesa del evento, y el tier (uno por paquete y sector) cuyos
// tickets son los asientos de esa mesa.
export const eventTable = pgTable('event_table', {
  eventId: uuid('event_id').notNull().references(() => event.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id').notNull().references(() => sectorTable.id, { onDelete: 'cascade' }),
  packageId: uuid('package_id').notNull().references(() => tablePackage.id),
  tierId: uuid('tier_id').notNull().references(() => tier.id),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.tableId] }),
  index('event_table_package_id_idx').on(table.packageId),
]);

// Lo reservado en una orden: congela paquete, personas, precio y botella elegida (voucher)
export const orderTable = pgTable('order_table', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => order.id),
  tableId: uuid('table_id').notNull().references(() => sectorTable.id),
  packageName: text('package_name').notNull(),
  people: integer('people').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  // Texto informativo de la botella incluida (opciones del paquete al comprar). La botella
  // se elige en el local: el sistema no la pide ni la condiciona.
  bottle: text('bottle'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('order_table_order_id_idx').on(table.orderId),
  unique('order_table_order_table_unique').on(table.orderId, table.tableId),
]);

// Modo MESAS_FLEXIBLES. Mesas que el organizador saca de la reserva en ESTE evento
// (ej. la mesa del grupo que se presenta).
export const eventTableBlock = pgTable('event_table_block', {
  eventId: uuid('event_id').notNull().references(() => event.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id').notNull().references(() => sectorTable.id, { onDelete: 'cascade' }),
}, (table) => [
  primaryKey({ columns: [table.eventId, table.tableId] }),
]);

// Mesa apartada por una orden (el sistema la eligió según el tamaño del grupo). Cuenta como
// ocupada mientras la orden esté PENDIENTE_PAGO o PAGADA; al expirar se borra.
export const tableHold = pgTable('table_hold', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => event.id, { onDelete: 'cascade' }),
  tableId: uuid('table_id').notNull().references(() => sectorTable.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull().references(() => order.id),
  people: integer('people').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('table_hold_event_table_idx').on(table.eventId, table.tableId),
  unique('table_hold_order_table_unique').on(table.orderId, table.tableId),
  check('table_hold_people_positive', sql`${table.people} > 0`),
]);
