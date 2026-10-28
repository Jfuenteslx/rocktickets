import { pgEnum } from 'drizzle-orm/pg-core';

// Event: ACTIVO → CANCELADO (cancelación manual, dispara anulación de tickets)
export const eventStatusEnum = pgEnum('event_status', ['ACTIVO', 'CANCELADO']);

// User (panel y puerta; el comprador registrado será otra tabla, más adelante):
//  - SUPERADMIN: Rocktickets. Control total, sin organizador.
//  - ORGANIZADOR: administrador de un organizador externo; solo ve y toca lo suyo.
//  - STAFF_PUERTA: escanea. Sin organizador = personal de Rocktickets (cualquier
//    evento); con organizador = personal de esa organización (solo sus eventos).
export const userRoleEnum = pgEnum('user_role', ['SUPERADMIN', 'ORGANIZADOR', 'STAFF_PUERTA']);

// Aprobación de cuentas. El staff creado por un organizador nace PENDIENTE y no
// puede entrar hasta que el SUPERADMIN lo apruebe.
export const approvalStatusEnum = pgEnum('approval_status', ['PENDIENTE', 'APROBADO', 'RECHAZADO']);
export type UserRole = (typeof userRoleEnum.enumValues)[number];

// Order: sin CANCELADA — el abandono se resuelve solo vía expiración
export const orderStatusEnum = pgEnum('order_status', [
  'PENDIENTE_PAGO',
  'PAGADA',
  'EXPIRADA',
]);

// Payment: incluye los dos casos borde (CONFIRMADO_SIN_ORDEN, ERROR) que
// vinieron de la integración con BNB, no del flujo de compra en sí
export const paymentStatusEnum = pgEnum('payment_status', [
  'PENDIENTE',
  'CONFIRMADO',
  'EXPIRADO',
  'ERROR',
  'CONFIRMADO_SIN_ORDEN',
  'REEMBOLSADO',
]);

// Tier: VENTA = se compra por la web; CORTESIA = entradas gratis que el ADMIN
// emite a mano (no se pagan ni pasan por una Order).
export const tierKindEnum = pgEnum('tier_kind', ['VENTA', 'CORTESIA']);

// Ticket: todo ticket existe de antemano (lo crea "Generar tickets").
//
//   DISPONIBLE ──(reserva de una Order)──▶ RESERVADO ──(pago)──▶ VALIDO ──(scan)──▶ UTILIZADO
//        ▲                                     │
//        └────────(Order expira)───────────────┘
//   DISPONIBLE / RESERVADO / VALIDO ──▶ ANULADO   (UTILIZADO y ANULADO son finales)
//
// Una cortesía salta RESERVADO: DISPONIBLE ──▶ VALIDO al emitirse.
export const ticketStatusEnum = pgEnum('ticket_status', [
  'DISPONIBLE',
  'RESERVADO',
  'VALIDO',
  'UTILIZADO',
  'ANULADO',
]);

// Access: el resultado de CADA intento de escaneo, no solo los exitosos
// (decisión: registrar también los rechazados, para detectar reintentos sospechosos)
export const accessResultEnum = pgEnum('access_result', [
  'ADMITIDO',
  'RECHAZADO_YA_USADO',
  'RECHAZADO_INVALIDO',
]);
