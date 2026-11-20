import { createHmac, timingSafeEqual } from 'node:crypto';

// Secreto compartido con PagosYa para firmar los avisos (webhooks).
// En producción es obligatorio; en desarrollo hay un valor por defecto.
export function getWebhookSecret(): string {
  const secret = process.env.PAGOSYA_WEBHOOK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Falta PAGOSYA_WEBHOOK_SECRET en el entorno de producción');
  }
  return 'dev-pagosya-secret';
}

// Firma = HMAC-SHA256 (hex) del cuerpo EXACTO recibido, sin reinterpretar el JSON.
export function signBody(body: string | Buffer, secret: string = getWebhookSecret()): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function isValidSignature(body: Buffer | undefined, signature: string | undefined): boolean {
  if (!body || !signature) return false;
  const expected = Buffer.from(signBody(body), 'hex');
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
