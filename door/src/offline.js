import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError } from './api';

// ── Modo sin conexión (respaldo) ─────────────────────────────────────────────
// Con red, el servidor decide siempre. Sin red, la app valida contra la lista de entradas
// descargada y guarda cada admisión en una cola que se sincroniza sola al volver la red.
// Riesgo aceptado: dos celulares sin red pueden admitir la misma entrada; al sincronizar el
// servidor lo detecta y se avisa como "doble ingreso".

const CHUNK = 400; // AsyncStorage de Android sufre con valores muy grandes: la lista se guarda por partes
const K_QUEUE = 'rt-queue';
const K_CONFLICTS = 'rt-conflicts';

const manifests = new Map(); // eventId -> { generatedAt, map: Map(ticketId -> entry) }
let queue = []; // { ticketId, eventId, scannedAt, owner, holder, shortCode, tierName }
let conflicts = [];
let owner = null;
let deviceId = '';
let syncing = false;
let loaded = false;
const listeners = new Set();

const pendingFor = () => queue.filter((q) => q.owner === owner);
const snapshot = () => ({ pending: pendingFor().length, conflicts: conflicts.length, syncing });
const emit = () => listeners.forEach((f) => { try { f(snapshot()); } catch { /* listener caído */ } });
export const subscribe = (fn) => { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); };

async function save(key, value) { try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ } }
async function read(key) { try { const v = await AsyncStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } }

export async function initOffline(ownerId, device) {
  owner = ownerId;
  deviceId = device;
  if (!loaded) {
    queue = (await read(K_QUEUE)) ?? [];
    conflicts = (await read(K_CONFLICTS)) ?? [];
    loaded = true;
  }
  emit();
}

// ── Lista de entradas del evento ──
function applyQueue(eventId, m) {
  for (const q of queue) {
    if (q.eventId !== eventId) continue;
    const e = m.map.get(q.ticketId);
    if (e && e.s === 'V') { e.s = 'U'; e.u = q.scannedAt; }
  }
}

export async function loadManifest(eventId) {
  if (manifests.has(eventId)) return manifests.get(eventId);
  const meta = await read(`rt-mf-${eventId}`);
  if (!meta) return null;
  const map = new Map();
  for (let i = 0; i < meta.chunks; i++) {
    const part = await read(`rt-mf-${eventId}-${i}`);
    (part ?? []).forEach((t) => map.set(t.id, t));
  }
  if (map.size !== meta.count) return null; // lista incompleta: mejor no usarla
  const m = { generatedAt: meta.generatedAt, map };
  applyQueue(eventId, m);
  manifests.set(eventId, m);
  emit();
  return m;
}

export async function downloadManifest(eventId) {
  const data = await api.get(`/access/events/${eventId}/manifest`, { timeout: 20000 });
  const map = new Map(data.tickets.map((t) => [t.id, t]));
  const m = { generatedAt: data.generatedAt, map };
  applyQueue(eventId, m);
  manifests.set(eventId, m);
  emit();
  // Persistencia: partes primero, ficha al final (si se corta a medias, la ficha vieja detecta el desajuste)
  const list = data.tickets;
  const chunks = Math.ceil(list.length / CHUNK);
  for (let i = 0; i < chunks; i++) await save(`rt-mf-${eventId}-${i}`, list.slice(i * CHUNK, (i + 1) * CHUNK));
  await save(`rt-mf-${eventId}`, { generatedAt: data.generatedAt, count: list.length, chunks });
  return m;
}

export const manifestInfo = (eventId) => {
  const m = manifests.get(eventId);
  return m ? { generatedAt: m.generatedAt, count: m.map.size } : null;
};
export const lookup = (eventId, ticketId) => manifests.get(eventId)?.map.get(ticketId);

// Otro celular admitió una entrada (aviso en vivo): la lista local lo sabe sin esperar
export function markUsed(eventId, ticketId, at) {
  const e = manifests.get(eventId)?.map.get(ticketId);
  if (e && e.s === 'V') { e.s = 'U'; e.u = at || new Date().toISOString(); }
}

// ── Cola ──
export async function admitOffline(eventId, ticketId, entry) {
  const scannedAt = new Date().toISOString();
  queue.push({ ticketId, eventId, scannedAt, owner, holder: entry.h, shortCode: entry.c, tierName: entry.t });
  entry.s = 'U'; entry.u = scannedAt;
  await save(K_QUEUE, queue);
  emit();
}

export function getConflicts() { return conflicts; }
export async function clearConflicts() { conflicts = []; await save(K_CONFLICTS, conflicts); emit(); }

async function pushConflict(item, kind, extra) {
  conflicts.push({ ticketId: item.ticketId, shortCode: item.shortCode, holder: item.holder, scannedAt: item.scannedAt, kind, ...extra });
  await save(K_CONFLICTS, conflicts);
}

// Envía la cola. Seguro llamarla en cualquier momento: sin red o sin pendientes no hace nada.
export async function syncNow() {
  if (syncing || !loaded) return { sent: 0 };
  const mine = pendingFor();
  if (!mine.length) return { sent: 0 };
  syncing = true; emit();
  let sent = 0;
  try {
    const byEvent = new Map();
    mine.forEach((q) => byEvent.set(q.eventId, [...(byEvent.get(q.eventId) ?? []), q]));
    for (const [eventId, items] of byEvent) {
      for (let i = 0; i < items.length; i += 200) {
        const batch = items.slice(i, i + 200);
        let res;
        try {
          res = await api.post('/tickets/scan/sync', {
            deviceId, eventId, items: batch.map((b) => ({ ticketId: b.ticketId, scannedAt: b.scannedAt })),
          }, { timeout: 20000 });
        } catch (e) {
          if (e instanceof ApiError && e.status === 400) {
            // Datos que el servidor nunca aceptará: no se reintentan en bucle
            for (const b of batch) await pushConflict(b, 'DATOS', { reason: e.message });
            const drop = new Set(batch.map((b) => b.ticketId));
            queue = queue.filter((q) => !(q.owner === owner && q.eventId === eventId && drop.has(q.ticketId)));
            await save(K_QUEUE, queue);
            continue;
          }
          return { sent, error: e }; // sin red o sin permiso: queda en cola y se reintenta luego
        }
        const byTicket = new Map(res.results.map((r) => [r.ticketId, r]));
        for (const b of batch) {
          const r = byTicket.get(b.ticketId);
          if (!r) continue; // el servidor no lo procesó: sigue en cola
          if (r.outcome === 'CONFLICTO') await pushConflict(b, 'DOBLE', { firstScannedAt: r.firstScannedAt });
          else if (r.outcome === 'RECHAZADO') await pushConflict(b, 'RECHAZADO', { reason: r.reason });
          sent++;
        }
        const done = new Set(res.results.map((r) => r.ticketId));
        queue = queue.filter((q) => !(q.owner === owner && q.eventId === eventId && done.has(q.ticketId)));
        await save(K_QUEUE, queue);
      }
    }
    return { sent };
  } finally {
    syncing = false; emit();
  }
}

let timer = null;
export function startSyncLoop() {
  if (timer) return;
  timer = setInterval(() => { syncNow(); }, 15000);
}
export function stopSyncLoop() { clearInterval(timer); timer = null; }
