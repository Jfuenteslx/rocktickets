// Generadores de mesas y butacas para un sector (creador de venues, fase 2).
// Es geometría pura: recibe la forma del sector (lista de vértices) y devuelve mesas y asientos
// con coordenadas enteras del lienzo, todos DENTRO de la forma. Las reglas de tamaño y de
// etiquetas repiten las del servidor (seating.constants.ts / seating.validation.ts).
import { locate, polygonBBox } from "./planGeometry.js";

export const MAX_SEATS = 2000;
export const MAX_TABLES = 300;
export const MAX_SEATS_PER_TABLE = 24;

export const TABLE_RADIUS = 14; // radio con que se dibuja una mesa
export const SEAT_RING = 26; // distancia de la mesa a sus asientos
export const SEAT_RADIUS = 6;

export const TABLE_DEFAULTS = { seatsPerTable: 4, gapX: 90, gapY: 90, cols: null, rows: null };
export const ROW_DEFAULTS = {
  seatsPerRow: null, rows: null, seatGap: 24, rowGap: 28, aisleEvery: 0, aisleGap: 24,
  firstRow: "A", rowOrder: "top-down", numbering: "ltr",
};

const inside = (shape, p) => locate(p, shape) !== "outside";
const inCanvas = (p, canvas) => p.x >= 0 && p.y >= 0 && p.x <= canvas.width && p.y <= canvas.height;
const toInt = (n) => Math.round(n);
const letters = (i) => {
  // 0 -> A, 25 -> Z, 26 -> AA …
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};
// "A" -> 0, "AA" -> 26 (para empezar las filas en otra letra)
export function letterIndex(label) {
  const t = String(label || "A").trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(t)) return 0;
  return [...t].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
}

// Posiciones de los asientos alrededor de una mesa en (cx, cy)
export function tableSeatPositions(cx, cy, n) {
  return Array.from({ length: n }, (_, k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
    return { x: toInt(cx + SEAT_RING * Math.cos(a)), y: toInt(cy + SEAT_RING * Math.sin(a)) };
  });
}

// Mesas en una cuadrícula centrada en el sector. Solo quedan las mesas cuyo centro y asientos caen
// dentro de la forma. Si no se dan filas/columnas, se llena todo lo que quepa.
export function generateTables(shape, canvas, params = {}) {
  const p = { ...TABLE_DEFAULTS, ...params };
  const n = Math.max(1, Math.min(MAX_SEATS_PER_TABLE, Math.round(p.seatsPerTable)));
  const gapX = Math.max(SEAT_RING * 2 + SEAT_RADIUS * 2 + 4, Math.round(p.gapX));
  const gapY = Math.max(SEAT_RING * 2 + SEAT_RADIUS * 2 + 4, Math.round(p.gapY));
  const box = polygonBBox(shape);
  const margin = SEAT_RING + SEAT_RADIUS + 2;
  const cols = p.cols ? Math.max(1, Math.round(p.cols)) : Math.max(1, Math.floor((box.w - 2 * margin) / gapX) + 1);
  const rows = p.rows ? Math.max(1, Math.round(p.rows)) : Math.max(1, Math.floor((box.h - 2 * margin) / gapY) + 1);
  const x0 = box.x + (box.w - (cols - 1) * gapX) / 2;
  const y0 = box.y + (box.h - (rows - 1) * gapY) / 2;

  const tables = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cx = toInt(x0 + c * gapX);
      const cy = toInt(y0 + r * gapY);
      const pos = tableSeatPositions(cx, cy, n);
      const pts = [{ x: cx, y: cy }, ...pos];
      if (!pts.every((q) => inCanvas(q, canvas) && inside(shape, q))) continue;
      tables.push({ x: cx, y: cy, pos });
    }
  }
  return {
    tables: tables.map((t, i) => ({
      label: `M${i + 1}`,
      x: t.x,
      y: t.y,
      seats: t.pos.map((q, k) => ({ label: letters(k), x: q.x, y: q.y, active: true })),
    })),
    rows: [],
  };
}

// Filas de butacas centradas en el sector, con pasillos opcionales cada N asientos. Los asientos
// que caen fuera de la forma se omiten; el número sigue por los que quedan en la fila.
export function generateRows(shape, canvas, params = {}) {
  const p = { ...ROW_DEFAULTS, ...params };
  const box = polygonBBox(shape);
  const seatGap = Math.max(SEAT_RADIUS * 2 + 2, Math.round(p.seatGap));
  const rowGap = Math.max(SEAT_RADIUS * 2 + 2, Math.round(p.rowGap));
  const aisleEvery = Math.max(0, Math.round(p.aisleEvery || 0));
  const aisleGap = Math.max(0, Math.round(p.aisleGap || 0));
  const margin = SEAT_RADIUS + 4;
  const perRow = p.seatsPerRow
    ? Math.max(1, Math.round(p.seatsPerRow))
    : Math.max(1, Math.floor((box.w - 2 * margin) / seatGap) + 1);
  const rows = p.rows ? Math.max(1, Math.round(p.rows)) : Math.max(1, Math.floor((box.h - 2 * margin) / rowGap) + 1);
  const aisles = aisleEvery > 0 ? Math.floor((perRow - 1) / aisleEvery) : 0;
  const rowWidth = (perRow - 1) * seatGap + aisles * aisleGap;
  const x0 = box.x + (box.w - rowWidth) / 2;
  const y0 = box.y + (box.h - (rows - 1) * rowGap) / 2;
  const first = letterIndex(p.firstRow);

  const out = [];
  for (let r = 0; r < rows; r += 1) {
    const rowIndex = p.rowOrder === "bottom-up" ? rows - 1 - r : r;
    const rowLabel = letters(first + rowIndex);
    const y = toInt(y0 + r * rowGap);
    const seats = [];
    for (let i = 0; i < perRow; i += 1) {
      const aislesBefore = aisleEvery > 0 ? Math.floor(i / aisleEvery) : 0;
      const q = { x: toInt(x0 + i * seatGap + aislesBefore * aisleGap), y };
      if (inCanvas(q, canvas) && inside(shape, q)) seats.push(q);
    }
    const ordered = p.numbering === "rtl" ? [...seats].reverse() : seats;
    ordered.forEach((q, k) => out.push({ rowLabel, label: String(k + 1), x: q.x, y: q.y, active: true }));
  }
  return { tables: [], rows: out };
}

// Cuántas mesas, asientos y asientos activos hay (y si se pasa de los límites del servidor)
export function seatingStats(s) {
  const seats = s.tables.reduce((n, t) => n + t.seats.length, 0) + s.rows.length;
  const active =
    s.tables.reduce((n, t) => n + t.seats.filter((x) => x.active).length, 0) + s.rows.filter((x) => x.active).length;
  let problem = "";
  if (s.tables.length > MAX_TABLES) problem = `Máximo ${MAX_TABLES} mesas por sector.`;
  else if (seats > MAX_SEATS) problem = `Máximo ${MAX_SEATS} asientos por sector.`;
  else if (seats > 0 && active === 0) problem = "Debe quedar al menos un asiento activo.";
  return { tables: s.tables.length, seats, active, problem };
}

const norm = (s) => String(s).trim().toLocaleLowerCase("es");

// Problemas de etiquetas que el servidor rechazaría (vacías o repetidas). Lista vacía = sin problemas.
export function seatingProblems(s) {
  const out = new Set();
  const tableNames = new Set();
  for (const t of s.tables) {
    if (norm(t.label) === "") out.add("Hay una mesa sin nombre.");
    if (tableNames.has(norm(t.label))) out.add(`Hay dos mesas llamadas «${t.label.trim()}».`);
    tableNames.add(norm(t.label));
    const seats = new Set();
    for (const q of t.seats) {
      if (norm(q.label) === "") out.add(`La mesa «${t.label.trim()}» tiene un asiento sin nombre.`);
      if (seats.has(norm(q.label))) out.add(`La mesa «${t.label.trim()}» tiene dos asientos «${q.label.trim()}».`);
      seats.add(norm(q.label));
    }
  }
  const rowKeys = new Set();
  for (const r of s.rows) {
    if (norm(r.rowLabel) === "" || norm(r.label) === "") out.add("Hay una butaca sin fila o sin número.");
    const key = `${norm(r.rowLabel)}|${norm(r.label)}`;
    if (rowKeys.has(key)) out.add(`La fila «${r.rowLabel.trim()}» tiene dos asientos «${r.label.trim()}».`);
    rowKeys.add(key);
  }
  return [...out];
}

// Siguiente nombre libre de mesa ("M7") y siguiente número libre de una fila
export function nextTableLabel(tables) {
  const used = new Set(tables.map((t) => norm(t.label)));
  let n = tables.length + 1;
  while (used.has(`m${n}`)) n += 1;
  return `M${n}`;
}
export function nextRowNumber(rows, rowLabel) {
  const nums = rows.filter((r) => norm(r.rowLabel) === norm(rowLabel)).map((r) => Number(r.label)).filter(Number.isFinite);
  return String((nums.length ? Math.max(...nums) : 0) + 1);
}
// Letras de asiento para una mesa de n asientos: A, B, C…
export const seatLetters = (n) => Array.from({ length: n }, (_, k) => letters(k));

// ¿Todos los puntos están dentro de la forma y del lienzo?
export function allInside(points, shape, canvas) {
  return points.every((q) => inCanvas(q, canvas) && inside(shape, q));
}
