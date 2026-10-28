const TZ = "America/La_Paz";

const dayFmt = new Intl.DateTimeFormat("es-BO", { day: "numeric", timeZone: TZ });
const monthFmt = new Intl.DateTimeFormat("es-BO", { month: "short", timeZone: TZ });
const weekdayFmt = new Intl.DateTimeFormat("es-BO", { weekday: "long", timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
const fullFmt = new Intl.DateTimeFormat("es-BO", {
  weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
});

export const fmtDay = (iso) => dayFmt.format(new Date(iso));
export const fmtMonth = (iso) => monthFmt.format(new Date(iso)).replace(".", "");
export const fmtWeekday = (iso) => weekdayFmt.format(new Date(iso));
export const fmtTime = (iso) => timeFmt.format(new Date(iso));
export const fmtFull = (iso) => fullFmt.format(new Date(iso));

// <input type="datetime-local"> no lleva zona horaria. Bolivia es UTC-4 todo el año
// (sin horario de verano), así que fijamos esa zona: da igual desde dónde se abra el panel.
const inputFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
});
export function toLocalInput(iso) {
  if (!iso) return "";
  return inputFmt.format(new Date(iso)).replace(" ", "T");
}
export const fromLocalInput = (value) => new Date(`${value}:00-04:00`).toISOString();

export function fmtMoney(value) {
  const n = Number(value);
  if (n === 0) return "Gratis";
  return `Bs ${n.toLocaleString("es-BO", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const dateTimeFmt = new Intl.DateTimeFormat("es-BO", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
});
export const fmtDateTime = (iso) => dateTimeFmt.format(new Date(iso)).replace(/\./g, "");

export function fmtWindow(startsAt, endsAt) {
  if (!startsAt && !endsAt) return "Sin fechas límite";
  if (startsAt && !endsAt) return `Desde el ${fmtDateTime(startsAt)}`;
  if (!startsAt && endsAt) return `Hasta el ${fmtDateTime(endsAt)}`;
  return `${fmtDateTime(startsAt)} a ${fmtDateTime(endsAt)}`;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Dinero de ventas: siempre con dos decimales ("Gratis" de fmtMoney no tiene sentido en un total)
export function fmtBs(value) {
  const n = Number(value);
  return `Bs ${n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export const fmtPct = (v) => (v === null || v === undefined ? "Sin definir" : `${Number(v)} %`);
const dayOnly = new Intl.DateTimeFormat("es-BO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
// "2026-10-14" (ya en hora de Bolivia, viene así del servidor) → "mié 14 oct"
export const fmtYmd = (ymd) => dayOnly.format(new Date(`${ymd}T12:00:00Z`)).replace(/\./g, "");
