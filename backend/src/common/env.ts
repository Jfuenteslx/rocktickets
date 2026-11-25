// Configuración de entorno para producción: se valida UNA vez al arrancar y, si algo falta o es
// inseguro, el servidor no levanta y dice exactamente qué corregir. En desarrollo nada de esto estorba.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const isProduction = () => process.env.NODE_ENV === 'production';

// Orígenes que pueden llamar a la API desde un navegador (CORS y WebSocket): lista separada por comas.
// En desarrollo, si no se define, se permite cualquier origen. Los avisos de PagosYa (servidor a
// servidor) no pasan por CORS, así que no hace falta incluirlos.
export function corsOrigins(): string[] | true {
  const list = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  if (list.length > 0) return list;
  return isProduction() ? [] : true;
}

export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!env.DATABASE_URL) errors.push('Falta DATABASE_URL.');
  if (!env.REDIS_URL) errors.push('Falta REDIS_URL.');

  const jwt = env.JWT_SECRET ?? '';
  if (jwt.length < 32) errors.push('JWT_SECRET debe tener al menos 32 caracteres (usa una cadena larga y aleatoria, distinta a la de desarrollo).');

  const origins = (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) errors.push('Falta CORS_ORIGINS: los dominios del sitio y del panel, separados por comas (ej. https://rocktickets.bo,https://admin.rocktickets.bo).');
  if (origins.some((o) => o === '*')) errors.push('CORS_ORIGINS no puede ser "*".');

  const site = env.PUBLIC_SITE_URL ?? '';
  if (!site || /localhost|127\.0\.0\.1/.test(site)) errors.push('PUBLIC_SITE_URL debe ser la dirección pública del sitio (la usan los enlaces de los correos).');
  else if (!site.startsWith('https://')) warnings.push('PUBLIC_SITE_URL no usa https.');

  // Pago manual: el QR de cobro del negocio es un archivo (no se puede vender sin él)
  const qr = resolve(env.MANUAL_PAYMENT_QR_PATH ?? 'assets/pago-qr.png');
  if (!existsSync(qr)) errors.push(`Falta el QR de cobro: pon la imagen del QR de tu cuenta en ${qr} (o indica otra ruta en MANUAL_PAYMENT_QR_PATH).`);
  if (!env.REVIEW_NOTIFY_EMAIL) warnings.push('Sin REVIEW_NOTIFY_EMAIL nadie recibe aviso por correo cuando entra un pago por verificar (se ve en la bandeja de pagos).');

  if (env.ENABLE_ADMINJS === 'true' && (env.ADMIN_SESSION_SECRET ?? '').length < 32) {
    errors.push('ENABLE_ADMINJS=true requiere ADMIN_SESSION_SECRET (32+ caracteres), distinto de JWT_SECRET.');
  }
  if (!env.RESEND_API_KEY) warnings.push('Sin RESEND_API_KEY los correos de entradas no se envían (solo se imprimen en consola).');
  else if (!env.MAIL_FROM || /onboarding@resend\.dev/.test(env.MAIL_FROM)) warnings.push('MAIL_FROM usa onboarding@resend.dev: Resend solo entrega a tu propio correo hasta verificar un dominio.');
  if (!env.TRUST_PROXY) warnings.push('Sin TRUST_PROXY: detrás de nginx/Caddy el límite de peticiones vería a todos con la misma IP. Pon TRUST_PROXY=1.');

  for (const w of warnings) console.warn(`⚠️  ${w}`);
  if (errors.length > 0) {
    throw new Error(`Configuración de producción incompleta o insegura:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}
