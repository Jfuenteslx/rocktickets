import 'dotenv/config';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { sql } from 'drizzle-orm';
import { db } from './client.js';

// ============================================================================
// Seed de DEMO. Deja el sistema con datos de ejemplo para una demostración.
//
// Habla con el backend por HTTP (el backend debe estar corriendo), igual que lo
// haría el panel, así que se aplican las mismas reglas que en una compra real.
// Solo toca la base directamente para (1) reiniciar lo suyo y (2) retroceder las
// fechas de las ventas, porque la API siempre sella "ahora".
//
// Uso (con el backend corriendo en otra ventana):
//   npm run build
//   npm run seed:demo          -> reinicia y vuelve a cargar la demo
//   npm run seed:demo:reset    -> solo borra los datos de demo
//
// Nunca borra nada que no sea suyo: solo los eventos de la "Productora Demo"
// que se llaman exactamente como los de este archivo.
// ============================================================================

const API = process.env.DEMO_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const ADMIN_EMAIL = process.env.DEMO_ADMIN_EMAIL ?? 'admin@rocktickets.local';
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD ?? 'admin123';
const DEMO_PASSWORD = 'demo12345'; // solo para cuentas de demostración

const ORG_NAME = 'Productora Demo';
const EVENT_A = 'Noche de Rock en Vivo'; // local "Sala Demo", con ventas históricas
const EVENT_B = 'Sábado Alternativo'; // local "Equinoccio", limpio, para la demo en vivo
const VENUE_A = 'Sala Demo';
const VENUE_B = 'Equinoccio';
const DEVICE = 'seed-demo-puerta';

const ORG_ADMIN = { name: 'Admin Productora Demo', email: 'organizador@demo.example.com' };
const STAFF_PLATFORM = { name: 'Puerta Rocktickets', email: 'puerta1@demo.example.com' };
const STAFF_ORG_OK = { name: 'Puerta Productora', email: 'puerta2@demo.example.com' };
const STAFF_ORG_PENDING = { name: 'Puerta Productora (pendiente)', email: 'puerta3@demo.example.com' };

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (n: number) => String(n).padStart(2, '0');

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface ApiOptions {
  token?: string;
  body?: unknown;
  form?: FormData;
}

// Llama al backend. Si el limitador responde 429, espera lo que pida y reintenta.
async function api<T = unknown>(method: string, path: string, opts: ApiOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = {};
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    let body: string | FormData | undefined;
    if (opts.form) {
      body = opts.form;
    } else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    const res = await fetch(`${API}${path}`, { method, headers, body });

    if (res.status === 429 && attempt < 8) {
      const wait = Number(res.headers.get('retry-after')) || 15;
      await sleep((wait + 1) * 1000);
      continue;
    }

    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const msg = (data as { message?: string | string[] } | null)?.message;
      throw new ApiError(res.status, Array.isArray(msg) ? msg.join('; ') : (msg ?? `HTTP ${res.status}`));
    }
    return data as T;
  }
}

// POST /orders admite 10 por minuto por IP: se espacian para no chocar con el límite.
let lastOrderAt = 0;
async function orderGate() {
  const wait = lastOrderAt + 6200 - Date.now();
  if (wait > 0) await sleep(wait);
  lastOrderAt = Date.now();
}

// Generador pseudoaleatorio con semilla: cada corrida produce datos parecidos.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRng(20261028);
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]!;

// ---------------------------------------------------------------------------
// Fechas (hora de La Paz = UTC-4, sin horario de verano)
// ---------------------------------------------------------------------------

const todayLP = new Date(Date.now() - 4 * 3600_000); // sus getUTC* dan la fecha local

function lpIso(addDays: number, hour: number): string {
  const d = new Date(Date.UTC(todayLP.getUTCFullYear(), todayLP.getUTCMonth(), todayLP.getUTCDate() + addDays));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hour)}:00:00-04:00`;
}

// Un instante de venta: hace `daysAgo` días, entre las 10:00 y las 23:59 de La Paz,
// y siempre en el pasado.
function saleTime(daysAgo: number): Date {
  const hour = 10 + Math.floor(rand() * 14);
  const minute = Math.floor(rand() * 60);
  const ms = Date.UTC(
    todayLP.getUTCFullYear(),
    todayLP.getUTCMonth(),
    todayLP.getUTCDate() - daysAgo,
    hour + 4,
    minute,
  );
  const latest = Date.now() - 30 * 60_000;
  return new Date(Math.min(ms, latest - Math.floor(rand() * 5 * 3600_000)));
}

// ---------------------------------------------------------------------------
// Imágenes de ejemplo (PNG generados, sin dependencias)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

type RGB = [number, number, number];

// Afiche abstracto: degradado vertical, halos de luz de escenario y barras tipo ecualizador.
function makePoster(w: number, h: number, top: RGB, bottom: RGB, accent: RGB, seed: number): Buffer {
  const r = makeRng(seed);
  const raw = Buffer.alloc((w * 3 + 1) * h);
  const glows = [
    { x: w * 0.5, y: h * 0.36, r: w * 0.42, a: 0.55 },
    { x: w * 0.2, y: h * 0.18, r: w * 0.22, a: 0.28 },
    { x: w * 0.82, y: h * 0.26, r: w * 0.2, a: 0.3 },
  ];
  const barW = 24;
  const gap = 10;
  const bars = Math.floor(w / (barW + gap));
  const barH = Array.from({ length: bars }, () => h * (0.05 + r() * 0.22));
  const baseY = h * 0.92;

  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0; // sin filtro
    const ty = y / (h - 1);
    for (let x = 0; x < w; x++) {
      let cr = top[0] + (bottom[0] - top[0]) * ty;
      let cg = top[1] + (bottom[1] - top[1]) * ty;
      let cb = top[2] + (bottom[2] - top[2]) * ty;

      for (const gl of glows) {
        const d = Math.hypot(x - gl.x, y - gl.y) / gl.r;
        if (d < 1) {
          const k = (1 - d) * (1 - d) * gl.a;
          cr += (accent[0] - cr) * k;
          cg += (accent[1] - cg) * k;
          cb += (accent[2] - cb) * k;
        }
      }

      const bi = Math.floor(x / (barW + gap));
      if (bi < bars && x % (barW + gap) < barW && y > baseY - barH[bi]! && y < baseY) {
        cr = cr * 0.25 + accent[0] * 0.75;
        cg = cg * 0.25 + accent[1] * 0.75;
        cb = cb * 0.25 + accent[2] * 0.75;
      }

      if ((x + y) % 90 < 2) {
        cr *= 1.12;
        cg *= 1.12;
        cb *= 1.12;
      }

      raw[p++] = Math.max(0, Math.min(255, Math.round(cr)));
      raw[p++] = Math.max(0, Math.min(255, Math.round(cg)));
      raw[p++] = Math.max(0, Math.min(255, Math.round(cb)));
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Reinicio: borra solo los eventos de demo y todo lo que cuelga de ellos
// ---------------------------------------------------------------------------

async function resetDemo() {
  const rows = (await db.execute(
    sql`select e.id as id, e.image_path as image_path
        from event e join organizer o on o.id = e.organizer_id
        where o.name = ${ORG_NAME} and e.name in (${EVENT_A}, ${EVENT_B})`,
  )) as unknown as { id: string; image_path: string | null }[];

  if (rows.length === 0) {
    console.log('  · No había datos de demo anteriores.');
    return;
  }

  const ids = sql.join(
    rows.map((r) => sql`${r.id}`),
    sql`, `,
  );

  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from access where ticket_id in (select id from ticket where event_id in (${ids}))`);
    await tx.execute(sql`delete from ticket where event_id in (${ids})`);
    await tx.execute(sql`delete from courtesy where event_id in (${ids})`);
    await tx.execute(
      sql`delete from payment where order_id in (select id from "order" where event_id in (${ids}))`,
    );
    await tx.execute(
      sql`delete from order_item where order_id in (select id from "order" where event_id in (${ids}))`,
    );
    await tx.execute(sql`delete from "order" where event_id in (${ids})`);
    await tx.execute(sql`delete from staff_event where event_id in (${ids})`);
    await tx.execute(sql`delete from tier where event_id in (${ids})`);
    await tx.execute(sql`delete from event where id in (${ids})`);
  });

  for (const r of rows) {
    if (r.image_path) rmSync(join(process.cwd(), 'uploads', r.image_path), { force: true });
  }
  console.log(`  · Se borraron ${rows.length} evento(s) de demo anteriores y sus datos.`);
}

// Equivalente en SQL a "la orden expira": igual que OrdersService.expireOrderIfStillPending.
async function expireInDb(orderId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`update "order" set status = 'EXPIRADA' where id = ${orderId} and status = 'PENDIENTE_PAGO'`);
    await tx.execute(
      sql`update ticket set status = 'DISPONIBLE', order_item_id = null
          where status = 'RESERVADO'
            and order_item_id in (select id from order_item where order_id = ${orderId})`,
    );
  });
}

// Retrocede las fechas de una orden (y su pago) para repartir las ventas en varios días.
async function backdate(orderId: string, at: Date) {
  const created = at.toISOString();
  const reserveEnd = new Date(at.getTime() + 15 * 60_000).toISOString();
  const reconcileEnd = new Date(at.getTime() + 2 * 3600_000).toISOString();
  await db.execute(
    sql`update "order" set created_at = ${created}::timestamptz, expires_at = ${reserveEnd}::timestamptz where id = ${orderId}`,
  );
  await db.execute(sql`update order_item set created_at = ${created}::timestamptz where order_id = ${orderId}`);
  await db.execute(
    sql`update payment set created_at = ${created}::timestamptz, reconciliation_expires_at = ${reconcileEnd}::timestamptz
        where order_id = ${orderId}`,
  );
}

// ---------------------------------------------------------------------------
// Tipos de las respuestas que se usan
// ---------------------------------------------------------------------------

interface VenueRow {
  id: string;
  name: string;
  capacity: number;
  sectors: { id: string; name: string; capacity: number }[];
}
interface TierRef {
  id: string;
  name: string;
  price: number;
}
interface CreatedOrder {
  order: { id: string; accessToken: string };
  payment: { id: string };
}
interface Sold {
  orderId: string;
  token: string;
  quantity: number;
  at: Date;
}

const BUYERS = [
  'Camila Rojas', 'Mateo Quispe', 'Valentina Flores', 'Diego Mamani', 'Lucía Condori',
  'Sebastián Vargas', 'Daniela Choque', 'Andrés Gutiérrez', 'Fernanda Mendoza', 'Gabriel Limachi',
  'Paola Salazar', 'Rodrigo Aliaga', 'Mariana Torrez', 'Joaquín Apaza', 'Carla Villarroel',
  'Bruno Cussi', 'Natalia Ríos', 'Esteban Copa', 'Sofía Zapata', 'Marco Huanca',
  'Alejandra Pinto', 'Iván Nina', 'Romina Calle', 'Hugo Challco', 'Tatiana Orellana',
  'Pablo Yujra', 'Andrea Blanco', 'Luis Escobar', 'Jimena Laura', 'Cristian Paredes',
];

function buyer() {
  const name = pick(BUYERS);
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '.');
  return {
    buyerName: name,
    buyerEmail: `${slug}${Math.floor(rand() * 90 + 10)}@example.com`,
    buyerPhone: `7${Math.floor(1_000_000 + rand() * 8_999_999)}`,
  };
}

// ---------------------------------------------------------------------------
// Programa principal
// ---------------------------------------------------------------------------

async function main() {
  const resetOnly = process.argv.includes('--reset-only');

  // --- Protecciones ---
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este seed es solo para demostraciones: no se ejecuta con NODE_ENV=production.');
  }
  const dbHost = new URL(process.env.DATABASE_URL!).hostname;
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(dbHost)) {
    throw new Error(`La base de datos no es local (${dbHost}). El seed de demo solo corre contra una base local.`);
  }

  console.log('\n== Seed de demo de Rocktickets ==\n');

  if (resetOnly) {
    console.log('1) Borrando datos de demo anteriores');
    await resetDemo();
    console.log('\nListo.\n');
    return;
  }

  // El backend debe estar corriendo
  try {
    await api('GET', '/events');
  } catch {
    throw new Error(`El backend no responde en ${API}. Arráncalo en otra ventana con "npm run start:prod" y repite.`);
  }

  console.log('1) Borrando datos de demo anteriores');
  await resetDemo();

  console.log('2) Iniciando sesión como superadmin');
  const admin = await api<{ token: string }>('POST', '/auth/login', {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  }).catch(() => {
    throw new Error(
      `No pude iniciar sesión como ${ADMIN_EMAIL}. Si cambiaste su contraseña, define DEMO_ADMIN_PASSWORD.`,
    );
  });
  const T = admin.token;

  // --- Organizador ---
  console.log('3) Organizador y cuentas');
  const orgs = await api<{ id: string; name: string }[]>('GET', '/organizers', { token: T });
  let org = orgs.find((o) => o.name === ORG_NAME);
  if (org) {
    await api('PATCH', `/organizers/${org.id}`, { token: T, body: { defaultCommissionPct: 10 } });
  } else {
    org = await api<{ id: string; name: string }>('POST', '/organizers', {
      token: T,
      body: {
        name: ORG_NAME,
        contactName: 'Contacto Demo',
        contactEmail: 'contacto@demo.example.com',
        contactPhone: '70000000',
        defaultCommissionPct: 10,
      },
    });
  }
  const orgId = org.id;

  const tolerate409 = (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) return;
    throw e;
  };

  await api('POST', `/organizers/${orgId}/admins`, {
    token: T,
    body: { ...ORG_ADMIN, password: DEMO_PASSWORD },
  }).catch(tolerate409);

  // Personal de puerta: uno de Rocktickets, uno de la productora (aprobado) y otro pendiente
  await api('POST', '/staff', { token: T, body: { ...STAFF_PLATFORM, password: DEMO_PASSWORD } }).catch(tolerate409);

  const orgLogin = await api<{ token: string }>('POST', '/auth/login', {
    body: { email: ORG_ADMIN.email, password: DEMO_PASSWORD },
  }).catch(() => {
    throw new Error(`No pude iniciar sesión como ${ORG_ADMIN.email}: esa cuenta ya existía con otra contraseña.`);
  });
  await api('POST', '/staff', {
    token: orgLogin.token,
    body: { ...STAFF_ORG_OK, password: DEMO_PASSWORD },
  }).catch(tolerate409);
  await api('POST', '/staff', {
    token: orgLogin.token,
    body: { ...STAFF_ORG_PENDING, password: DEMO_PASSWORD },
  }).catch(tolerate409);

  const staffList = await api<{ id: string; email: string }[]>('GET', '/staff', { token: T });
  const staffId = (email: string) => {
    const s = staffList.find((x) => x.email === email);
    if (!s) throw new Error(`No encontré al personal ${email}`);
    return s.id;
  };
  await api('PATCH', `/staff/${staffId(STAFF_ORG_OK.email)}/approval`, { token: T, body: { status: 'APROBADO' } });

  // --- Locales ---
  console.log('4) Locales y sectores');
  let venues = await api<VenueRow[]>('GET', '/manage/venues', { token: T });

  async function ensureVenue(name: string, sectors: { name: string; capacity: number }[]): Promise<VenueRow> {
    let v = venues.find((x) => x.name === name);
    if (!v) {
      const created = await api<{ id: string }>('POST', '/venues', { token: T, body: { name } });
      v = { id: created.id, name, capacity: 0, sectors: [] };
    }
    for (const s of sectors) {
      if (!v.sectors.some((x) => x.name === s.name)) {
        await api('POST', `/venues/${v.id}/sectors`, { token: T, body: s });
      }
    }
    venues = await api<VenueRow[]>('GET', '/manage/venues', { token: T });
    return venues.find((x) => x.id === v!.id)!;
  }

  const venueA = await ensureVenue(VENUE_A, [
    { name: 'General', capacity: 150 },
    { name: 'VIP', capacity: 30 },
    { name: 'Balcón', capacity: 40 },
  ]);
  const venueB = await ensureVenue(VENUE_B, [{ name: 'General', capacity: 200 }]);
  const sectorOf = (v: VenueRow, name: string) => {
    const s = v.sectors.find((x) => x.name === name);
    if (!s) throw new Error(`El local ${v.name} no tiene el sector ${name}`);
    return s;
  };

  // --- Eventos: fechas, imágenes y tickets ---
  console.log('5) Eventos, imágenes y tickets');
  let add = (6 - todayLP.getUTCDay() + 7) % 7; // próximo sábado
  if (add < 5) add += 7; // con al menos 5 días de margen
  const startA = lpIso(add, 21);
  const endA = lpIso(add + 1, 2);
  const startB = lpIso(add + 7, 20);
  const endB = lpIso(add + 8, 1);

  async function createEvent(
    venueId: string,
    name: string,
    description: string,
    startsAt: string,
    endsAt: string,
    colors: { top: RGB; bottom: RGB; accent: RGB; seed: number },
  ) {
    const ev = await api<{ id: string }>('POST', '/events', {
      token: T,
      body: { venueId, organizerId: orgId, name, description, startsAt, endsAt },
    });
    const png = makePoster(800, 1000, colors.top, colors.bottom, colors.accent, colors.seed);
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'afiche-demo.png');
    await api('POST', `/events/${ev.id}/image`, { token: T, form });
    await api('POST', `/events/${ev.id}/generate-tickets`, { token: T });
    return ev;
  }

  async function createTier(
    eventId: string,
    sectorId: string,
    name: string,
    price: number,
    quantity: number,
    kind: 'VENTA' | 'CORTESIA' = 'VENTA',
  ): Promise<TierRef> {
    const t = await api<{ id: string }>('POST', `/events/${eventId}/tiers`, {
      token: T,
      body: { sectorId, name, kind, price },
    });
    await api('POST', `/tiers/${t.id}/assign`, { token: T, body: { quantity } });
    return { id: t.id, name, price };
  }

  const evA = await createEvent(
    venueA.id,
    EVENT_A,
    'Una noche de rock con bandas locales. Puertas a las 21:00. Evento de demostración.',
    startA,
    endA,
    { top: [27, 11, 46], bottom: [70, 10, 40], accent: [225, 29, 72], seed: 11 },
  );
  const evB = await createEvent(
    venueB.id,
    EVENT_B,
    'Música alternativa en vivo. Evento de demostración, sin ventas: ideal para probar la compra en vivo.',
    startB,
    endB,
    { top: [6, 34, 43], bottom: [20, 60, 70], accent: [245, 158, 11], seed: 23 },
  );

  // Evento A (Sala Demo): General 150 = 40 preventa + 90 general + 20 cortesías
  const preventa = await createTier(evA.id, sectorOf(venueA, 'General').id, 'Preventa', 40, 40);
  const general = await createTier(evA.id, sectorOf(venueA, 'General').id, 'General', 60, 90);
  const cortesias = await createTier(evA.id, sectorOf(venueA, 'General').id, 'Cortesías', 0, 20, 'CORTESIA');
  const vip = await createTier(evA.id, sectorOf(venueA, 'VIP').id, 'VIP', 150, 30);
  const balcon = await createTier(evA.id, sectorOf(venueA, 'Balcón').id, 'Balcón', 90, 40);

  // Evento B (Equinoccio): limpio, para la demo en vivo
  const genB = sectorOf(venueB, 'General').id;
  await createTier(evB.id, genB, 'Preventa', 30, 60);
  await createTier(evB.id, genB, 'General', 50, 100);
  await createTier(evB.id, genB, 'Cortesías', 0, 20, 'CORTESIA');

  // --- Personal de puerta en ambos eventos ---
  console.log('6) Asignando personal de puerta');
  for (const ev of [evA, evB]) {
    await api('PUT', `/events/${ev.id}/door/${staffId(STAFF_PLATFORM.email)}`, { token: T });
    await api('PUT', `/events/${ev.id}/door/${staffId(STAFF_ORG_OK.email)}`, { token: T });
  }

  // --- Cortesías (evento A) ---
  console.log('7) Cortesías');
  const courtesyTickets: string[] = [];
  const courtesyGroups = [
    { recipientName: 'Radio Demo (prensa)', recipientEmail: 'prensa@example.com', reason: 'Prensa', quantity: 2 },
    { recipientName: 'Banda invitada', recipientEmail: 'banda@example.com', reason: 'Artistas', quantity: 6 },
    { recipientName: 'Invitados del organizador', recipientEmail: 'invitados@example.com', reason: 'Invitados', quantity: 3 },
    { recipientName: 'Auspiciador Demo', recipientEmail: 'auspicio@example.com', reason: 'Auspicio', quantity: 4 },
  ];
  for (const g of courtesyGroups) {
    const c = await api<{ tickets: { id: string }[] }>('POST', `/tiers/${cortesias.id}/courtesies`, {
      token: T,
      body: g,
    });
    courtesyTickets.push(...c.tickets.map((t) => t.id));
  }

  // --- Ventas históricas (evento A) ---
  interface Plan {
    tier: TierRef;
    quantity: number;
    daysAgo: number;
  }
  function plan(tier: TierRef, total: number, from: number, to: number): Plan[] {
    const out: Plan[] = [];
    let left = total;
    while (left > 0) {
      const quantity = Math.min(left, pick([1, 1, 2, 2, 2, 3, 4]));
      out.push({ tier, quantity, daysAgo: from + Math.floor(rand() * (to - from + 1)) });
      left -= quantity;
    }
    return out;
  }
  const plans = [
    ...plan(preventa, 40, 4, 8), // la preventa se agota
    ...plan(general, 28, 0, 4),
    ...plan(vip, 9, 0, 6),
    ...plan(balcon, 7, 0, 5),
  ].sort((a, b) => b.daysAgo - a.daysAgo);

  const expiredCount = 4;
  const totalOrders = plans.length + expiredCount + 1;
  console.log(`8) Ventas históricas: ${plans.length} órdenes pagadas, ${expiredCount} expiradas y 1 pago por revisar`);
  console.log(`   (el límite de la API es de 10 órdenes por minuto: tardará unos ${Math.ceil((totalOrders * 6.2) / 60)} minutos)`);

  const sold: Sold[] = [];
  let n = 0;
  for (const p of plans) {
    await orderGate();
    const created = await api<CreatedOrder>('POST', '/orders', {
      body: { eventId: evA.id, ...buyer(), items: [{ tierId: p.tier.id, quantity: p.quantity }] },
    });
    const paid = await api<{ outcome: string }>(
      'POST',
      `/demo/payments/${created.payment.id}/simulate-bank-confirmation`,
    );
    if (paid.outcome !== 'CONFIRMADO') throw new Error(`El pago no se confirmó (${paid.outcome})`);
    sold.push({
      orderId: created.order.id,
      token: created.order.accessToken,
      quantity: p.quantity,
      at: saleTime(p.daysAgo),
    });
    if (++n % 8 === 0) console.log(`   · ${n}/${plans.length} órdenes pagadas`);
  }

  // Órdenes que expiraron sin pagarse
  for (let i = 0; i < expiredCount; i++) {
    await orderGate();
    const created = await api<CreatedOrder>('POST', '/orders', {
      body: { eventId: evA.id, ...buyer(), items: [{ tierId: general.id, quantity: 1 + (i % 2) }] },
    });
    await expireInDb(created.order.id);
    await backdate(created.order.id, saleTime(1 + i));
  }

  // Un pago que llegó cuando la orden ya había expirado ("Pagos por revisar")
  await orderGate();
  const late = await api<CreatedOrder>('POST', '/orders', {
    body: { eventId: evA.id, ...buyer(), items: [{ tierId: vip.id, quantity: 1 }] },
  });
  await expireInDb(late.order.id);
  await api('POST', `/demo/payments/${late.payment.id}/simulate-bank-confirmation`);
  await backdate(late.order.id, saleTime(1));

  // Retroceder las fechas de las ventas pagadas y cerrar la preventa
  for (const s of sold) await backdate(s.orderId, s.at);
  await api('PATCH', `/tiers/${preventa.id}`, {
    token: T,
    body: { endsAt: new Date(Date.now() - 2 * 86_400_000).toISOString() },
  });

  // --- Escaneos en puerta (evento A) ---
  console.log('9) Escaneos de ejemplo en puerta');
  const staff = await api<{ token: string }>('POST', '/auth/login', {
    body: { email: STAFF_PLATFORM.email, password: DEMO_PASSWORD },
  });
  let scanned = 0;
  let firstScanned: string | undefined;
  const scan = async (ticketId: string) => {
    await api('POST', '/tickets/scan', {
      token: staff.token,
      body: { ticketId, deviceId: DEVICE, eventId: evA.id },
    });
    scanned++;
    firstScanned ??= ticketId;
  };

  const toScan = sold.filter((_, i) => i % 3 === 0).slice(0, 16);
  for (const [i, s] of toScan.entries()) {
    const o = await api<{ tickets: { id: string }[] }>('GET', `/orders/token/${s.token}`);
    const ids = o.tickets.map((t) => t.id);
    const take = i % 3 === 2 ? Math.max(1, Math.floor(ids.length / 2)) : ids.length; // algunos grupos quedan a medias
    for (const id of ids.slice(0, take)) await scan(id);
  }
  for (const id of courtesyTickets.slice(0, 2)) await scan(id);
  if (firstScanned) {
    await api('POST', '/tickets/scan', {
      token: staff.token,
      body: { ticketId: firstScanned, deviceId: DEVICE, eventId: evA.id },
    }); // intento repetido: queda registrado como "ya usado"
  }

  // --- Resumen ---
  const soldTickets = sold.reduce((a, s) => a + s.quantity, 0);
  console.log(`
== Listo ==

Eventos de demo
  · ${EVENT_A}  (${VENUE_A})  ${soldTickets} entradas vendidas en ${sold.length} órdenes,
      ${courtesyTickets.length} cortesías, ${scanned} escaneadas, ${expiredCount} órdenes expiradas, 1 pago por revisar
  · ${EVENT_B}  (${VENUE_B})  sin ventas, listo para comprar y escanear en vivo

Cuentas (contraseña de las de demo: ${DEMO_PASSWORD})
  Superadmin ........ ${ADMIN_EMAIL}
  Organizador ....... ${ORG_ADMIN.email}
  Puerta Rocktickets  ${STAFF_PLATFORM.email}
  Puerta Productora . ${STAFF_ORG_OK.email}
  Pendiente de aprobar ${STAFF_ORG_PENDING.email}

Panel: http://localhost:5174   Sitio público: http://localhost:5173

Recuerda: las órdenes pendientes de pago que crees en vivo expiran a los 15 minutos.
Para volver a dejar todo limpio: npm run seed:demo
`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nError en el seed de demo:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
