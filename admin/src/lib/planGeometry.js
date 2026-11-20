// Geometría del plano. Mismas reglas que valida el backend (layout.validation.ts):
// bloques de al menos 20×20, dentro del lienzo, y sin pisarse (tocar bordes está permitido).
export const GRID = 20;
export const MIN_SIZE = 20;
export const DEFAULT_W = 160;
export const DEFAULT_H = 100;

export const snap = (v) => Math.round(v / GRID) * GRID;

export function clampRect(r, canvas) {
  const w = Math.min(Math.max(r.w, MIN_SIZE), canvas.width);
  const h = Math.min(Math.max(r.h, MIN_SIZE), canvas.height);
  const x = Math.min(Math.max(r.x, 0), canvas.width - w);
  const y = Math.min(Math.max(r.y, 0), canvas.height - h);
  return { x, y, w, h };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Rectángulo inicial centrado en el punto donde se soltó el sector
export function rectAt(point, canvas) {
  return clampRect(
    { x: snap(point.x - DEFAULT_W / 2), y: snap(point.y - DEFAULT_H / 2), w: DEFAULT_W, h: DEFAULT_H },
    canvas
  );
}

// Redimensiona moviendo la esquina `corner` ("nw" | "ne" | "sw" | "se") del rectángulo `r` en (dx, dy)
export function resizeRect(r, corner, dx, dy, canvas) {
  let x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
  if (corner.includes("w")) x1 = Math.max(0, Math.min(snap(x1 + dx), x2 - MIN_SIZE));
  if (corner.includes("e")) x2 = Math.min(canvas.width, Math.max(snap(x2 + dx), x1 + MIN_SIZE));
  if (corner.includes("n")) y1 = Math.max(0, Math.min(snap(y1 + dy), y2 - MIN_SIZE));
  if (corner.includes("s")) y2 = Math.min(canvas.height, Math.max(snap(y2 + dy), y1 + MIN_SIZE));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// Rectángulo de tamaño w×h centrado en el punto donde se soltó un elemento
export function rectAtSize(point, w, h, canvas) {
  return clampRect({ x: snap(point.x - w / 2), y: snap(point.y - h / 2), w, h }, canvas);
}

// Elementos de referencia que se pueden agregar al plano. "Ingreso" usa el tipo OTRO con nombre propio.
export const ELEMENT_PRESETS = [
  { key: "ESCENARIO", kind: "ESCENARIO", name: "Escenario", w: 400, h: 100 },
  { key: "BARRA", kind: "BARRA", name: "Barra", w: 240, h: 60 },
  { key: "BANOS", kind: "BANOS", name: "Baños", w: 120, h: 80 },
  { key: "SALIDA", kind: "SALIDA_EMERGENCIA", name: "Salida de emergencia", w: 120, h: 40 },
  { key: "INGRESO", kind: "OTRO", name: "Ingreso", w: 120, h: 40 },
];

// ---------------------------------------------------------------------------------------------
// Polígonos. Es una copia fiel de backend/src/venues/layout.polygon.ts: el editor avisa de lo
// mismo que el servidor rechazaría al guardar. Si cambias una regla, cámbiala en los dos lados.
// ---------------------------------------------------------------------------------------------
export const MAX_POINTS = 64;
export const MIN_POLYGON_AREA = MIN_SIZE * MIN_SIZE;
const EPS = 1e-9;

export function rectToPolygon(r) {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function polygonBBox(p) {
  const xs = p.map((q) => q.x);
  const ys = p.map((q) => q.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function polygonArea(p) {
  let sum = 0;
  for (let i = 0; i < p.length; i += 1) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const sign = (n) => (n > EPS ? 1 : n < -EPS ? -1 : 0);

function withinBox(a, b, c) {
  return (
    c.x >= Math.min(a.x, b.x) - EPS && c.x <= Math.max(a.x, b.x) + EPS &&
    c.y >= Math.min(a.y, b.y) - EPS && c.y <= Math.max(a.y, b.y) + EPS
  );
}
const onSegment = (a, b, c) => sign(orient(a, b, c)) === 0 && withinBox(a, b, c);

function segmentsTouch(a, b, c, d) {
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

// Polígono simple: sin vértices repetidos, sin lados que se crucen o se toquen y sin picos
export function isSimplePolygon(p) {
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

// ¿Sirve como forma de un sector? (mismas reglas que el servidor)
export function isValidShape(p, canvas) {
  if (p.length < 3 || p.length > MAX_POINTS) return false;
  const inCanvas = p.every(
    (q) => Number.isInteger(q.x) && Number.isInteger(q.y) && q.x >= 0 && q.y >= 0 && q.x <= canvas.width && q.y <= canvas.height,
  );
  if (!inCanvas || !isSimplePolygon(p)) return false;
  const box = polygonBBox(p);
  return polygonArea(p) >= MIN_POLYGON_AREA && box.w >= MIN_SIZE && box.h >= MIN_SIZE;
}

export function locate(m, poly) {
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    if (onSegment(poly[i], poly[(i + 1) % n], m)) return "boundary";
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > m.y !== b.y > m.y && m.x < ((b.x - a.x) * (m.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

function splitParams(p, q, other) {
  const ts = [];
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
      for (const e of [r, s]) {
        const t = ((e.x - p.x) * dx + (e.y - p.y) * dy) / len2;
        if (t > EPS && t < 1 - EPS) ts.push(t);
      }
    }
  }
  return ts;
}

function classifyBoundary(a, b) {
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
      if (where === "inside") inside = true;
      if (where !== "boundary") allOnBoundary = false;
    }
  }
  return { inside, allOnBoundary };
}

// Tocarse por un borde o un vértice NO cuenta como superposición
export function polygonsOverlap(a, b) {
  const ba = polygonBBox(a);
  const bb = polygonBBox(b);
  if (!(ba.x < bb.x + bb.w && bb.x < ba.x + ba.w && ba.y < bb.y + bb.h && bb.y < ba.y + ba.h)) return false;
  const ab = classifyBoundary(a, b);
  const ba2 = classifyBoundary(b, a);
  return ab.inside || ba2.inside || (ab.allOnBoundary && ba2.allOnBoundary);
}

// Forma de un sector ubicado: sus vértices o, si es un bloque, su rectángulo
export const sectorShape = (s) => (s.points ?? (s.rect ? rectToPolygon(s.rect) : null));

// Ids de los sectores ubicados que se pisan con otro del mismo nivel
export function findConflicts(sectors) {
  const placed = sectors.map((s) => ({ id: s.id, shape: sectorShape(s) })).filter((s) => s.shape);
  const bad = new Set();
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      if (polygonsOverlap(placed[i].shape, placed[j].shape)) {
        bad.add(placed[i].id);
        bad.add(placed[j].id);
      }
    }
  }
  return bad;
}

// Ids de los sectores con polígono de forma inválida (lados cruzados, repetidos, muy chico…)
export function findInvalid(sectors, canvas) {
  return new Set(sectors.filter((s) => s.points && !isValidShape(s.points, canvas)).map((s) => s.id));
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Dónde poner el texto de un polígono: el punto interior más alejado de los bordes
export function labelPoint(points) {
  const b = polygonBBox(points);
  const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (points.length === 4 && polygonArea(points) === b.w * b.h) return center; // es un rectángulo
  const step = Math.max(5, Math.round(Math.min(b.w, b.h) / 20));
  let best = null;
  let bestD = -1;
  for (let x = b.x + step / 2; x < b.x + b.w; x += step) {
    for (let y = b.y + step / 2; y < b.y + b.h; y += step) {
      const p = { x, y };
      if (locate(p, points) !== "inside") continue;
      let d = Infinity;
      for (let i = 0; i < points.length; i += 1) d = Math.min(d, distToSegment(p, points[i], points[(i + 1) % points.length]));
      if (d > bestD) { bestD = d; best = p; }
    }
  }
  return best ?? center;
}
