import { MAX_SEATS_PER_SECTOR, MAX_TABLES_PER_SECTOR } from './seating.constants.js';
import { pointInPolygon, type Point } from './layout.polygon.js';
import { LAYOUT_CANVAS } from './layout.constants.js';

export interface SeatingInput {
  tables: { id?: string; label: string; x: number; y: number; seats: { id?: string; label: string; x: number; y: number; active: boolean }[] }[];
  rows: { id?: string; rowLabel: string; label: string; x: number; y: number; active: boolean }[];
}

const norm = (s: string) => s.trim().toLocaleLowerCase('es');

const inCanvas = (p: Point) =>
  Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x <= LAYOUT_CANVAS.width && p.y <= LAYOUT_CANVAS.height;

// Reglas de mesas y asientos de un sector, sin tocar la base de datos. `shape` es la forma del
// sector (polígono). Devuelve la lista de problemas (vacía = válido).
export function validateSeating(input: SeatingInput, shape: Point[]): string[] {
  const errors: string[] = [];
  const seatCount = input.tables.reduce((n, t) => n + t.seats.length, 0) + input.rows.length;
  if (input.tables.length > MAX_TABLES_PER_SECTOR) errors.push(`Máximo ${MAX_TABLES_PER_SECTOR} mesas por sector`);
  if (seatCount > MAX_SEATS_PER_SECTOR) errors.push(`Máximo ${MAX_SEATS_PER_SECTOR} asientos por sector`);

  const tableLabels = new Set<string>();
  const ids = new Set<string>();
  const seenId = (id: string | undefined, what: string) => {
    if (!id) return;
    if (ids.has(id)) errors.push(`${what} aparece más de una vez`);
    ids.add(id);
  };

  for (const t of input.tables) {
    const label = t.label.trim();
    if (label === '') errors.push('Hay una mesa sin nombre');
    if (tableLabels.has(norm(t.label))) errors.push(`Hay dos mesas llamadas "${label}"`);
    tableLabels.add(norm(t.label));
    seenId(t.id, `La mesa "${label}"`);
    if (!inCanvas(t) || !pointInPolygon(t, shape)) errors.push(`La mesa "${label}" está fuera del sector`);

    const seatLabels = new Set<string>();
    for (const s of t.seats) {
      const sl = s.label.trim();
      if (sl === '') errors.push(`La mesa "${label}" tiene un asiento sin nombre`);
      if (seatLabels.has(norm(s.label))) errors.push(`La mesa "${label}" tiene dos asientos "${sl}"`);
      seatLabels.add(norm(s.label));
      seenId(s.id, `Un asiento de la mesa "${label}"`);
      if (!inCanvas(s) || !pointInPolygon(s, shape)) errors.push(`El asiento "${sl}" de la mesa "${label}" está fuera del sector`);
    }
  }

  const rowKeys = new Set<string>();
  for (const r of input.rows) {
    const row = r.rowLabel.trim();
    const sl = r.label.trim();
    if (row === '' || sl === '') errors.push('Hay una butaca sin fila o sin número');
    const key = `${norm(r.rowLabel)}|${norm(r.label)}`;
    if (rowKeys.has(key)) errors.push(`La fila "${row}" tiene dos asientos "${sl}"`);
    rowKeys.add(key);
    seenId(r.id, `La butaca ${row}-${sl}`);
    if (!inCanvas(r) || !pointInPolygon(r, shape)) errors.push(`La butaca ${row}-${sl} está fuera del sector`);
  }

  return [...new Set(errors)];
}

export function countActive(input: SeatingInput): number {
  return input.tables.reduce((n, t) => n + t.seats.filter((s) => s.active).length, 0) + input.rows.filter((r) => r.active).length;
}
