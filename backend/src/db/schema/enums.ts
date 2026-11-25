import { pgEnum } from 'drizzle-orm/pg-core';

// Event: ACTIVO → CANCELADO (cancelación manual, dispara anulación de tickets)
export const eventStatusEnum = pgEnum('event_status', ['ACTIVO', 'CANCELADO']);

// Cómo se ubica el público en un evento (uno solo por evento):
//  - NINGUNO: entradas por sector/tier, sin ubicación concreta (flujo original).
//  - BUTACAS: cada entrada va ligada a un asiento numerado del plano.
//  - MESAS_FIJAS: paquetes de mesa definidos de antemano (el comprador elige la mesa).
//  - MESAS_FLEXIBLES: el comprador indica cuántas personas son y el sistema acomoda.
export const seatingModeEnum = pgEnum('seating_mode', [
  'NINGUNO',
  'BUTACAS',
  'MESAS_FIJAS',
  'MESAS_FLEXIBLES',
]);

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
  // El banco reportó un monto distinto al cobrado: no confirma la orden; lo revisa el superadmin
  'NO_CONCILIADO',
  // Pago manual: el comprador avisó que pagó y el superadmin aún debe verificarlo / lo rechazó
  'EN_REVISION',
  'RECHAZADO',
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

// Plano del venue (creador de venues) ------------------------------------------------
// Tipo de sector: cómo se ocupa físicamente. En la fase 1 es solo informativo; en la
// fase 2 decide qué generador (mesas / filas de butacas) se usa para dibujarlo.
export const sectorTypeEnum = pgEnum('sector_type', ['MESAS', 'BUTACAS', 'DE_PIE', 'MIXTO']);

// Vista desde el sector hacia el escenario
export const sectorViewEnum = pgEnum('sector_view', ['LIBRE', 'OBSTRUIDA', 'PRIVILEGIADA']);

// Elementos de referencia del plano: orientan al comprador, no se venden ni tienen aforo
export const venueElementKindEnum = pgEnum('venue_element_kind', [
  'ESCENARIO',
  'BARRA',
  'BANOS',
  'SALIDA_EMERGENCIA',
  'OTRO',
]);
