import { API_URL } from "./api";


export function formatDay(iso) {
  return new Date(iso).toLocaleDateString("es-BO", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDayLong(iso) {
  const text = new Date(iso).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
}

export function formatMoney(value) {
  const n = Number(value);
  return `Bs ${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function imageSrc(event) {
  return event.imageUrl ? `${API_URL}${event.imageUrl}` : null;
}

export const isUpcoming = (event) => new Date(event.endsAt) > new Date();

// Estado de venta derivado de los tiers públicos (solo de VENTA).
//   AGOTADO      todo vendido
//   PRONTO       hay entradas pero ninguna se puede comprar ahora (pausadas o fuera de ventana)
//   ULTIMAS      quedan pocas
//   DISPONIBLE   en venta
export const LOW_STOCK = 20;

export function saleInfo(event) {
  const tiers = event.sectors.flatMap((s) => s.tiers);
  const buyable = tiers.filter((t) => t.disponibleParaCompra);
  const totalAvailable = tiers.reduce((sum, t) => sum + t.available, 0);
  const buyableAvailable = buyable.reduce((sum, t) => sum + t.available, 0);
  const priced = (buyable.length > 0 ? buyable : tiers).map((t) => Number(t.price));
  const minPrice = priced.length > 0 ? Math.min(...priced) : null;

  let state = "DISPONIBLE";
  if (tiers.length === 0) state = "PRONTO";
  else if (totalAvailable === 0) state = "AGOTADO";
  else if (buyable.length === 0) state = "PRONTO";
  else if (buyableAvailable <= LOW_STOCK) state = "ULTIMAS";

  return { state, minPrice, buyableAvailable, canBuy: buyable.length > 0 };
}

export const STATE_BADGE = {
  AGOTADO: { text: "Agotado", cls: "bg-red-600 text-white" },
  PRONTO: { text: "Próximamente", cls: "bg-sky-600 text-white" },
  ULTIMAS: { text: "Últimas entradas", cls: "bg-amber-500 text-black" },
};

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
