import { describe, expect, it } from 'vitest';
import { countActive, validateSeating, type SeatingInput } from './seating.validation.js';
import { pointInPolygon, translationOf } from './layout.polygon.js';

const rect = [{ x: 100, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 400 }, { x: 100, y: 400 }];
// Sector en L: el rincón de arriba a la derecha está recortado
const ele = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 500, y: 200 }, { x: 500, y: 400 }, { x: 100, y: 400 }];

const ok: SeatingInput = {
  tables: [
    { label: 'M1', x: 150, y: 150, seats: [{ label: 'A', x: 140, y: 140, active: true }, { label: 'B', x: 160, y: 140, active: false }] },
    { label: 'M2', x: 250, y: 150, seats: [{ label: 'A', x: 240, y: 140, active: true }] },
  ],
  rows: [{ rowLabel: 'A', label: '1', x: 120, y: 300, active: true }, { rowLabel: 'A', label: '2', x: 140, y: 300, active: true }],
};

describe('validateSeating', () => {
  it('acepta mesas y filas dentro del sector', () => {
    expect(validateSeating(ok, rect)).toEqual([]);
    expect(countActive(ok)).toBe(4);
  });
  it('rechaza puntos fuera del polígono (rincón recortado de una L)', () => {
    const out: SeatingInput = { tables: [{ label: 'M1', x: 400, y: 150, seats: [] }], rows: [] };
    expect(validateSeating(out, ele)[0]).toMatch(/fuera del sector/);
    expect(validateSeating(out, rect)).toEqual([]);
  });
  it('acepta puntos sobre el borde', () => {
    expect(validateSeating({ tables: [], rows: [{ rowLabel: 'A', label: '1', x: 100, y: 100, active: true }] }, rect)).toEqual([]);
  });
  it('rechaza etiquetas repetidas (sin distinguir mayúsculas)', () => {
    const dup: SeatingInput = {
      tables: [
        { label: 'M1', x: 150, y: 150, seats: [{ label: 'A', x: 140, y: 140, active: true }, { label: 'a', x: 160, y: 140, active: true }] },
        { label: 'm1', x: 250, y: 150, seats: [] },
      ],
      rows: [{ rowLabel: 'A', label: '1', x: 120, y: 300, active: true }, { rowLabel: 'a', label: '1', x: 140, y: 300, active: true }],
    };
    const errors = validateSeating(dup, rect).join('|');
    expect(errors).toMatch(/dos mesas/);
    expect(errors).toMatch(/dos asientos "a"/);
    expect(errors).toMatch(/fila "a" tiene dos/);
  });
  it('rechaza etiquetas vacías, coordenadas no enteras o fuera del lienzo', () => {
    const bad: SeatingInput = { tables: [{ label: ' ', x: 150.5, y: 150, seats: [] }], rows: [{ rowLabel: 'A', label: '1', x: 2000, y: 10, active: true }] };
    const errors = validateSeating(bad, rect).join('|');
    expect(errors).toMatch(/sin nombre/);
    expect(errors).toMatch(/fuera del sector/);
  });
  it('rechaza el mismo id dos veces', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const dup: SeatingInput = { tables: [], rows: [{ id, rowLabel: 'A', label: '1', x: 120, y: 300, active: true }, { id, rowLabel: 'A', label: '2', x: 140, y: 300, active: true }] };
    expect(validateSeating(dup, rect).join('|')).toMatch(/más de una vez/);
  });
  it('limita la cantidad de asientos', () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({ rowLabel: 'A', label: String(i), x: 120, y: 300, active: true }));
    expect(validateSeating({ tables: [], rows }, rect).join('|')).toMatch(/Máximo 2000/);
  });
});

describe('geometría de apoyo', () => {
  it('pointInPolygon incluye borde y vértices', () => {
    expect(pointInPolygon({ x: 100, y: 100 }, rect)).toBe(true);
    expect(pointInPolygon({ x: 300, y: 250 }, rect)).toBe(true);
    expect(pointInPolygon({ x: 501, y: 250 }, rect)).toBe(false);
    expect(pointInPolygon({ x: 400, y: 150 }, ele)).toBe(false);
  });
  it('translationOf detecta un desplazamiento puro', () => {
    expect(translationOf(rect, rect.map((p) => ({ x: p.x + 40, y: p.y - 20 })))).toEqual({ dx: 40, dy: -20 });
    expect(translationOf(rect, rect.map((p, i) => (i === 2 ? { x: p.x + 20, y: p.y } : p)))).toBeNull();
    expect(translationOf(rect, ele)).toBeNull();
  });
});
