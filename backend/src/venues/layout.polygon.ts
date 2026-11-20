// Geometría de polígonos del plano (sin base de datos ni Nest). Los vértices son enteros del lienzo.
// Los rectángulos se tratan como polígonos de 4 vértices, así que todo se compara con una sola regla.

export interface Point {
  x: number;
  y: number;
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const EPS = 1e-9;

export function rectToPolygon(r: BBox): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function polygonBBox(p: Point[]): BBox {
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Área con signo cero si los puntos son colineales; siempre positiva
export function polygonArea(p: Point[]): number {
  let sum = 0;
  for (let i = 0; i < p.length; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

const orient = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const sign = (n: number) => (n > EPS ? 1 : n < -EPS ? -1 : 0);

// ¿c está sobre el segmento ab? (c ya es colineal con ab)
function withinBox(a: Point, b: Point, c: Point): boolean {
  return (
    c.x >= Math.min(a.x, b.x) - EPS && c.x <= Math.max(a.x, b.x) + EPS &&
    c.y >= Math.min(a.y, b.y) - EPS && c.y <= Math.max(a.y, b.y) + EPS
  );
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return sign(orient(a, b, c)) === 0 && withinBox(a, b, c);
}

// ¿Los segmentos ab y cd tienen algún punto en común (cruce, roce o solape)?
function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = sign(orient(a, b, c));
  const o2 = sign(orient(a, b, d));
  const o3 = sign(orient(c, d, a));
  const o4 = sign(orient(c, d, b));
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  return (
    (o1 === 0 && withinBox(a, b, c)) ||
    (o2 === 0 && withinBox(a, b, d)) ||
    (o3 === 0 && withinBox(c, d, a)) ||
    (o4 === 0 && withinBox(c, d, b))
  );
}

// Polígono simple: sin vértices repetidos, sin lados que se crucen o se toquen (salvo los
// consecutivos en su vértice común) y sin “picos” donde un lado se dobla sobre el anterior.
export function isSimplePolygon(p: Point[]): boolean {
  const n = p.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (p[i].x === p[j].x && p[i].y === p[j].y) return false;
    }
  }
  for (let i = 0; i < n; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      const c = p[j];
      const d = p[(j + 1) % n];
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) {
        // Comparten un vértice: no pueden además solaparse (lado doblado hacia atrás)
        const shared = j === i + 1 ? b : a;
        const other1 = j === i + 1 ? a : b;
        const other2 = j === i + 1 ? d : c;
        if (sign(orient(shared, other1, other2)) === 0) {
          const dot = (other1.x - shared.x) * (other2.x - shared.x) + (other1.y - shared.y) * (other2.y - shared.y);
          if (dot > 0) return false;
        }
      } else if (segmentsTouch(a, b, c, d)) {
        return false;
      }
    }
  }
  return true;
}

type Where = 'inside' | 'outside' | 'boundary';

function locate(m: Point, poly: Point[]): Where {
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    if (onSegment(poly[i], poly[(i + 1) % n], m)) return 'boundary';
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > m.y !== b.y > m.y && m.x < ((b.x - a.x) * (m.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

// Parámetros t∈(0,1) donde el segmento pq toca el borde de `other` (para partirlo en tramos)
function splitParams(p: Point, q: Point, other: Point[]): number[] {
  const ts: number[] = [];
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len2 = dx * dx + dy * dy;
  for (let i = 0; i < other.length; i += 1) {
    const r = other[i];
    const s = other[(i + 1) % other.length];
    const ex = s.x - r.x;
    const ey = s.y - r.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) > EPS) {
      const t = ((r.x - p.x) * ey - (r.y - p.y) * ex) / den;
      const u = ((r.x - p.x) * dy - (r.y - p.y) * dx) / den;
      if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) ts.push(t);
    } else if (Math.abs(orient(p, q, r)) < EPS) {
      // Paralelos y colineales: los extremos del otro lado parten este segmento
      for (const e of [r, s]) {
        const t = ((e.x - p.x) * dx + (e.y - p.y) * dy) / len2;
        if (t > EPS && t < 1 - EPS) ts.push(t);
      }
    }
  }
  return ts;
}

// Parte el borde de `a` en tramos (cortados donde toca el borde de `b`) y dice dónde cae cada tramo respecto a b
function classifyBoundary(a: Point[], b: Point[]): { inside: boolean; allOnBoundary: boolean } {
  let inside = false;
  let allOnBoundary = true;
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    const ts = [0, ...splitParams(p, q, b).sort((x, y) => x - y), 1];
    for (let k = 0; k < ts.length - 1; k += 1) {
      if (ts[k + 1] - ts[k] < EPS) continue;
      const tm = (ts[k] + ts[k + 1]) / 2;
      const where = locate({ x: p.x + (q.x - p.x) * tm, y: p.y + (q.y - p.y) * tm }, b);
      if (where === 'inside') inside = true;
      if (where !== 'boundary') allOnBoundary = false;
    }
  }
  return { inside, allOnBoundary };
}

// ¿Los interiores de dos polígonos simples se superponen? Tocarse por un borde o un vértice NO cuenta.
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  const ba = polygonBBox(a);
  const bb = polygonBBox(b);
  if (!(ba.x < bb.x + bb.w && bb.x < ba.x + ba.w && ba.y < bb.y + bb.h && bb.y < ba.y + ba.h)) return false;
  const ab = classifyBoundary(a, b);
  const ba2 = classifyBoundary(b, a);
  // Si algún tramo de un borde queda dentro del otro polígono, se pisan. Si todos los tramos de
  // ambos coinciden con el borde del otro, son el mismo polígono.
  return ab.inside || ba2.inside || (ab.allOnBoundary && ba2.allOnBoundary);
}

// ¿El punto está dentro del polígono o sobre su borde?
export function pointInPolygon(m: Point, poly: Point[]): boolean {
  return locate(m, poly) !== 'outside';
}

// Si `b` es `a` desplazada (mismos vértices, mismo orden), devuelve el desplazamiento; si no, null
export function translationOf(a: Point[], b: Point[]): { dx: number; dy: number } | null {
  if (a.length !== b.length || a.length === 0) return null;
  const dx = b[0].x - a[0].x;
  const dy = b[0].y - a[0].y;
  return a.every((q, i) => b[i].x - q.x === dx && b[i].y - q.y === dy) ? { dx, dy } : null;
}
