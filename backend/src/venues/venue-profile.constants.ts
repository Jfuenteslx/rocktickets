import { join } from 'node:path';

export const MAX_VENUE_PHOTOS = 10;
export const VENUE_PHOTOS_DIR = join(process.cwd(), 'uploads', 'venues');
export const VENUE_ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Solo enlaces https de Google Maps (incluye los cortos de "Compartir" y los de dominios
// regionales como google.com.bo): el enlace se muestra como botón en el sitio público, así que
// no se acepta cualquier URL.
const GOOGLE_HOST = /^(www\.|maps\.)?google\.(com|[a-z]{2})(\.[a-z]{2})?$/;

export function isGoogleMapsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return false;
    // Enlaces cortos de "Compartir"
    if (u.hostname === 'maps.app.goo.gl') return true;
    if (u.hostname === 'goo.gl') return u.pathname.startsWith('/maps');
    // Google Maps en cualquier dominio regional: maps.google.* o google.*/maps
    if (u.hostname.startsWith('maps.') && GOOGLE_HOST.test(u.hostname)) return true;
    return GOOGLE_HOST.test(u.hostname) && u.pathname.startsWith('/maps');
  } catch {
    return false;
  }
}
