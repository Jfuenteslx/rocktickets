import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  check,
  unique,
  index,
  uniqueIndex,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { orderStatusEnum, paymentStatusEnum } from './enums.js';
import { event, tier } from './venue.js';
import { user } from './identity.js';

// Cuenta de comprador (inicio de sesión con Google). Separada de `user` (personal del panel):
// una cuenta de comprador nunca tiene roles ni permisos de administración.
export const buyerAccount = pgTable('buyer_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(), // identificador estable de la cuenta de Google
  email: text('email').notNull(),
  name: text('name').notNull(),
  pictureUrl: text('picture_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
});

export const order = pgTable('order', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id').notNull().references(() => event.id),
  // Guest checkout: NULL. Se completa solo si en el futuro existen cuentas
  // de comprador — ninguna Order histórica se rompe cuando eso pase.
  userId: uuid('user_id').references(() => user.id),
  // Cuenta de comprador con la que se hizo la compra (NULL = compra de invitado)
  buyerId: uuid('buyer_id').references(() => buyerAccount.id),
  // UUID separado del id — es un credencial de acceso (/mi-orden/{token}),
  // no un identificador interno. Tratar como secreto, no exponerlo en logs.
  accessToken: uuid('access_token').notNull().defaultRandom().unique(),
  buyerName: text('buyer_name').notNull(),
  buyerEmail: text('buyer_email').notNull(),
  buyerPhone: text('buyer_phone').notNull(),
  status: orderStatusEnum('status').notNull().default('PENDIENTE_PAGO'),
  // Fin de la reserva de stock (15 min desde creación) — NO confundir con
  // Payment.reconciliationExpiresAt, que es una ventana distinta e independiente.
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Constancia de que el comprador aceptó los términos y la política de privacidad al comprar.
  // Nulos en las órdenes anteriores a esta constancia.
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  termsVersion: text('terms_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('order_event_id_idx').on(table.eventId),
  // El job de expiración filtra por status = PENDIENTE_PAGO constantemente
  index('order_status_idx').on(table.status),
  index('order_buyer_email_idx').on(table.buyerEmail),
  index('order_buyer_id_idx').on(table.buyerId),
]);

export const orderItem = pgTable('order_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => order.id),
  tierId: uuid('tier_id').notNull().references(() => tier.id),
  quantity: integer('quantity').notNull(),
  // Precio congelado al momento de la compra — nunca se relee de Tier.price.
  // Ver invariante: Tier puede cambiar de precio sin afectar órdenes históricas.
  unitPrice: numeric('unit_price', { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('order_item_order_id_idx').on(table.orderId),
  index('order_item_tier_id_idx').on(table.tierId),
  // Una orden no puede tener dos líneas del mismo tier — aumentar cantidad
  // es un UPDATE sobre esta fila, no un INSERT nuevo (regla de aplicación).
  unique('order_item_order_tier_unique').on(table.orderId, table.tierId),
  check('order_item_quantity_positive', sql`${table.quantity} > 0`),
  check('order_item_unit_price_non_negative', sql`${table.unitPrice} >= 0`),
]);

export const payment = pgTable('payment', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id').notNull().references(() => order.id),
  status: paymentStatusEnum('status').notNull().default('PENDIENTE'),
  // Hoy siempre 'BNB' — no hardcodeado en el tipo, para no reescribir el
  // schema el día que se sume otra pasarela.
  provider: text('provider').notNull().default('BNB'),
  // NULL hasta que el banco devuelve el qrId; UNIQUE una vez que existe,
  // para no poder asociar el mismo QR del banco a dos Payments distintos.
  providerPaymentId: text('provider_payment_id'),
  // Snapshot: SUM(OrderItem.quantity * unitPrice) de la Order al crear este
  // Payment. Nunca se acepta como input externo — se calcula en el service.
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('BOB'),
  // Ventana de polling a BNB (2h desde creación de Order) — independiente
  // de Order.expiresAt. Ver: condición de carrera resuelta con CONFIRMADO_SIN_ORDEN.
  reconciliationExpiresAt: timestamp('reconciliation_expires_at', { withTimezone: true }).notNull(),
  // Cobro con QR (PagosYa Embedded): el texto que se dibuja como QR y la vigencia del
  // checkout (5 min, siempre dentro de los 15 min de reserva de la orden).
  qrPayload: text('qr_payload'),
  checkoutExpiresAt: timestamp('checkout_expires_at', { withTimezone: true }),
  // Pago manual (QR del banco + verificación del superadmin). Lo que el comprador declara al
  // avisar "ya pagué" y la resolución del superadmin. Solo el superadmin ve estos datos.
  payerName: text('payer_name'),
  payerEmail: text('payer_email'),
  payerPhone: text('payer_phone'),
  declaredAt: timestamp('declared_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => user.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNote: text('review_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('payment_order_id_idx').on(table.orderId),
  // El worker de reconciliación filtra por ambos campos juntos
  index('payment_status_reconciliation_idx').on(table.status, table.reconciliationExpiresAt),
  uniqueIndex('payment_provider_payment_id_unique')
    .on(table.providerPaymentId)
    .where(sql`${table.providerPaymentId} IS NOT NULL`),
  // Nunca dos Payments CONFIRMADO simultáneos para la misma Order, aunque
  // haya habido varios intentos previos (ERROR/EXPIRADO) — cardinalidad 1:N.
  uniqueIndex('payment_order_confirmed_unique')
    .on(table.orderId)
    .where(sql`${table.status} = 'CONFIRMADO'`),
  check('payment_amount_non_negative', sql`${table.amount} >= 0`),
]);

// Registro de cada notificación (webhook) del proveedor de pagos. Sirve para:
//  - idempotencia: provider_tx_id es único, un reintento del mismo aviso no se procesa dos veces;
//  - auditoría y revisión: pagos dobles, montos distintos y referencias desconocidas.
// kind: RECIBIDO (en proceso) | CONFIRMADO | CONFIRMADO_SIN_ORDEN | MONTO_DISTINTO |
//       DUPLICADO | REFERENCIA_DESCONOCIDA
export const paymentEvent = pgTable('payment_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  // NULL cuando la referencia del aviso no corresponde a ningún cobro nuestro
  paymentId: uuid('payment_id').references(() => payment.id),
  // Lo que informó el proveedor: referencia (id de la orden) y su id de transacción
  reference: text('reference').notNull(),
  providerTxId: text('provider_tx_id').notNull(),
  kind: text('kind').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('payment_event_provider_tx_unique').on(table.providerTxId),
  index('payment_event_payment_id_idx').on(table.paymentId),
  index('payment_event_kind_idx').on(table.kind),
]);

export const orderRelations = relations(order, ({ one, many }) => ({
  event: one(event, { fields: [order.eventId], references: [event.id] }),
  buyer: one(user, { fields: [order.userId], references: [user.id] }),
  items: many(orderItem),
  payments: many(payment),
}));

export const orderItemRelations = relations(orderItem, ({ one, many }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
  tier: one(tier, { fields: [orderItem.tierId], references: [tier.id] }),
}));

export const paymentRelations = relations(payment, ({ one, many }) => ({
  order: one(order, { fields: [payment.orderId], references: [order.id] }),
  events: many(paymentEvent),
}));

export const paymentEventRelations = relations(paymentEvent, ({ one }) => ({
  payment: one(payment, { fields: [paymentEvent.paymentId], references: [payment.id] }),
}));
