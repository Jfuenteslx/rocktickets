import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QRCode from 'qrcode';

// Pago manual: el comprador paga con el QR de la cuenta del negocio y avisa; el superadmin
// verifica el depósito y aprueba. Todo lo configurable sale de variables de entorno.

// Horas que se mantienen reservadas las entradas mientras el superadmin verifica un pago avisado.
// Pasado ese plazo sin resolver, la orden se libera.
export const reviewHoldHours = () => {
  const n = Number(process.env.MANUAL_REVIEW_HOLD_HOURS ?? 48);
  return Number.isFinite(n) && n >= 1 ? n : 48;
};

export const qrFilePath = () => resolve(process.env.MANUAL_PAYMENT_QR_PATH ?? 'assets/pago-qr.png');

// Datos que se muestran junto al QR (todo opcional)
export const paymentInfo = () => ({
  bank: process.env.PAYMENT_BANK_NAME?.trim() || null,
  holder: process.env.PAYMENT_ACCOUNT_HOLDER?.trim() || null,
  note: process.env.PAYMENT_INSTRUCTIONS?.trim() || null,
});

// Imagen del QR de cobro. En producción SIEMPRE es el archivo real (el servidor no arranca sin él).
// En desarrollo, si no existe, se dibuja un QR de prueba claramente falso.
export async function loadQrPng(): Promise<Buffer | null> {
  const file = qrFilePath();
  if (existsSync(file)) return readFileSync(file);
  if (process.env.NODE_ENV === 'production') return null;
  return QRCode.toBuffer('QR-DE-PRUEBA-NO-PAGAR', { type: 'png', width: 360, margin: 2 });
}
