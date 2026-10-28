// Bolivia es UTC-4 todo el año (sin horario de verano): se fija esa zona sin depender de Intl.
const BO_OFFSET_MS = -4 * 3600 * 1000;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n) => String(n).padStart(2, '0');
const bo = (iso) => new Date(new Date(iso).getTime() + BO_OFFSET_MS);

export const fmtTime = (iso) => { const d = bo(iso); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
export const fmtDay = (iso) => { const d = bo(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const newDeviceId = () => 'app-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
