import { LAYOUT_CANVAS, MAX_POINTS, MIN_BLOCK_SIZE, MIN_POLYGON_AREA } from './layout.constants.js';
import { isSimplePolygon, polygonArea, polygonBBox, polygonsOverlap, rectToPolygon, type Point } from './layout.polygon.js';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ShapeLevel {
  name: string;
  // Un sector ubicado es un polígono (`points`) o, si no los tiene, un rectángulo (`rect`)
  sectors: { id?: string; name: string; rect?: Rect | null; points?: Point[] | null }[];
  elements: { name: string; rect: Rect }[];
}

export function rectInCanvas(r: Rect): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= LAYOUT_CANVAS.width && r.y + r.h <= LAYOUT_CANVAS.height;
}

// Bordes que solo se tocan NO cuentan como superposición
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const norm = (s: string) => s.trim().toLocaleLowerCase('es');

// Reglas de forma del plano, sin tocar la base de datos. Devuelve la lista de problemas
// (vacía = plano válido) para mostrárselos todos juntos al usuario.
export function validateLayoutShape(levels: ShapeLevel[]): string[] {
  const errors: string[] = [];

  const levelNames = new Set<string>();
  for (const level of levels) {
    const key = norm(level.name);
    if (levelNames.has(key)) errors.push(`Hay dos niveles llamados "${level.name.trim()}"`);
    levelNames.add(key);
  }

  const sectorNames = new Set<string>();
  const sectorIds = new Set<string>();
  for (const level of levels) {
    for (const s of level.sectors) {
      const key = norm(s.name);
      if (sectorNames.has(key)) errors.push(`Hay dos sectores llamados "${s.name.trim()}"`);
      sectorNames.add(key);
      if (s.id) {
        if (sectorIds.has(s.id)) errors.push(`El sector "${s.name.trim()}" aparece más de una vez`);
        sectorIds.add(s.id);
      }
    }
  }

  for (const level of levels) {
    const placed: { name: string; shape: Point[] }[] = [];

    for (const s of level.sectors) {
      const label = `El sector "${s.name.trim()}"`;
      if (s.points) {
        if (!checkPolygon(label, s.points, errors)) continue;
        placed.push({ name: s.name.trim(), shape: s.points });
      } else if (s.rect) {
        checkRect(label, s.rect, errors);
        placed.push({ name: s.name.trim(), shape: rectToPolygon(s.rect) });
      }
    }
    for (const e of level.elements) checkRect(`El elemento "${e.name.trim()}"`, e.rect, errors);

    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        if (polygonsOverlap(placed[i].shape, placed[j].shape)) {
          errors.push(`En "${level.name.trim()}", los sectores "${placed[i].name}" y "${placed[j].name}" se superponen`);
        }
      }
    }
  }

  return errors;
}

function checkRect(label: string, r: Rect, errors: string[]) {
  if (r.w < MIN_BLOCK_SIZE || r.h < MIN_BLOCK_SIZE) {
    errors.push(`${label} es demasiado pequeño (mínimo ${MIN_BLOCK_SIZE}×${MIN_BLOCK_SIZE})`);
  }
  if (!rectInCanvas(r)) errors.push(`${label} se sale del lienzo`);
}

// Devuelve true si el polígono es utilizable (para seguir con la comprobación de solapes)
function checkPolygon(label: string, pts: Point[], errors: string[]): boolean {
  if (pts.length < 3 || pts.length > MAX_POINTS) {
    errors.push(`${label} debe tener entre 3 y ${MAX_POINTS} vértices`);
    return false;
  }
  const outside = pts.some(
    (q) => !Number.isInteger(q.x) || !Number.isInteger(q.y) || q.x < 0 || q.y < 0 || q.x > LAYOUT_CANVAS.width || q.y > LAYOUT_CANVAS.height,
  );
  if (outside) {
    errors.push(`${label} se sale del lienzo`);
    return false;
  }
  if (!isSimplePolygon(pts)) {
    errors.push(`${label} tiene una forma inválida: sus lados no pueden cruzarse ni tocarse, ni repetir vértices`);
    return false;
  }
  const box = polygonBBox(pts);
  if (polygonArea(pts) < MIN_POLYGON_AREA || box.w < MIN_BLOCK_SIZE || box.h < MIN_BLOCK_SIZE) {
    errors.push(`${label} es demasiado pequeño`);
    return false;
  }
  return true;
}
