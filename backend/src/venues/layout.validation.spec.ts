import { describe, expect, it } from 'vitest';
import { rectsOverlap, validateLayoutShape } from './layout.validation.js';
import { isSimplePolygon, polygonArea, polygonBBox, polygonsOverlap, rectToPolygon, type Point } from './layout.polygon.js';

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('rectsOverlap', () => {
  it('detecta bloques que se pisan', () => {
    expect(rectsOverlap(rect(0, 0, 100, 100), rect(50, 50, 100, 100))).toBe(true);
  });
  it('permite bordes que solo se tocan', () => {
    expect(rectsOverlap(rect(0, 0, 100, 100), rect(100, 0, 100, 100))).toBe(false);
  });
  it('permite bloques separados', () => {
    expect(rectsOverlap(rect(0, 0, 50, 50), rect(200, 200, 50, 50))).toBe(false);
  });
});

describe('validateLayoutShape', () => {
  it('acepta un plano correcto', () => {
    const errors = validateLayoutShape([
      {
        name: 'Planta baja',
        sectors: [
          { name: 'Mesas', rect: rect(40, 120, 900, 240) },
          { name: 'Gradería', rect: rect(220, 400, 560, 220) },
        ],
        elements: [{ name: 'Escenario', rect: rect(80, 20, 840, 70) }],
      },
      { name: 'Mezanine', sectors: [{ name: 'Mezanine butacas', rect: rect(40, 40, 700, 300) }], elements: [] },
    ]);
    expect(errors).toEqual([]);
  });

  it('rechaza sectores superpuestos en el mismo nivel, pero no en niveles distintos', () => {
    const errors = validateLayoutShape([
      {
        name: 'Planta baja',
        sectors: [
          { name: 'A', rect: rect(0, 0, 200, 200) },
          { name: 'B', rect: rect(100, 100, 200, 200) },
        ],
        elements: [],
      },
      { name: 'Mezanine', sectors: [{ name: 'C', rect: rect(0, 0, 200, 200) }], elements: [] },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"A" y "B"');
  });

  it('rechaza bloques fuera del lienzo o demasiado pequeños', () => {
    const errors = validateLayoutShape([
      {
        name: 'Planta baja',
        sectors: [{ name: 'Fuera', rect: rect(950, 0, 200, 100) }],
        elements: [{ name: 'Mini', rect: rect(10, 10, 5, 5) }],
      },
    ]);
    expect(errors.some((e) => e.includes('se sale del lienzo'))).toBe(true);
    expect(errors.some((e) => e.includes('demasiado pequeño'))).toBe(true);
  });

  it('rechaza nombres repetidos sin distinguir mayúsculas', () => {
    const errors = validateLayoutShape([
      { name: 'Planta baja', sectors: [{ name: 'VIP' }, { name: 'vip' }], elements: [] },
      { name: 'planta baja', sectors: [], elements: [] },
    ]);
    expect(errors.some((e) => e.includes('dos sectores'))).toBe(true);
    expect(errors.some((e) => e.includes('dos niveles'))).toBe(true);
  });

  it('rechaza el mismo sector en dos lugares', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const errors = validateLayoutShape([
      { name: 'Planta baja', sectors: [{ id, name: 'General' }], elements: [] },
      { name: 'Mezanine', sectors: [{ id, name: 'General 2' }], elements: [] },
    ]);
    expect(errors.some((e) => e.includes('más de una vez'))).toBe(true);
  });

  it('ignora sectores sin ubicar al buscar superposiciones', () => {
    const errors = validateLayoutShape([
      { name: 'Planta baja', sectors: [{ name: 'A' }, { name: 'B', rect: null }], elements: [] },
    ]);
    expect(errors).toEqual([]);
  });
});

const poly = (...pts: [number, number][]): Point[] => pts.map(([x, y]) => ({ x, y }));

// Una “L”: cuadrado de 200×200 al que se le recorta la esquina superior derecha de 100×100
const ELE = poly([0, 0], [100, 0], [100, 100], [200, 100], [200, 200], [0, 200]);

describe('isSimplePolygon', () => {
  it('acepta un rectángulo y una L', () => {
    expect(isSimplePolygon(rectToPolygon(rect(0, 0, 100, 100)))).toBe(true);
    expect(isSimplePolygon(ELE)).toBe(true);
  });
  it('rechaza un lazo (lados que se cruzan)', () => {
    expect(isSimplePolygon(poly([0, 0], [100, 100], [100, 0], [0, 100]))).toBe(false);
  });
  it('rechaza vértices repetidos', () => {
    expect(isSimplePolygon(poly([0, 0], [100, 0], [100, 0], [100, 100], [0, 100]))).toBe(false);
  });
  it('rechaza un polígono que se toca a sí mismo', () => {
    expect(isSimplePolygon(poly([0, 0], [200, 0], [200, 200], [100, 0], [0, 200]))).toBe(false);
  });
  it('rechaza un pico (un lado se dobla sobre el anterior)', () => {
    expect(isSimplePolygon(poly([0, 0], [100, 0], [50, 0], [50, 100]))).toBe(false);
  });
});

describe('polygonArea y polygonBBox', () => {
  it('calculan el área y la caja de una L', () => {
    expect(polygonArea(ELE)).toBe(30000);
    expect(polygonBBox(ELE)).toEqual({ x: 0, y: 0, w: 200, h: 200 });
  });
});

describe('polygonsOverlap', () => {
  it('un bloque dentro de la muesca de la L NO se superpone, aunque esté dentro de su caja', () => {
    expect(polygonsOverlap(ELE, rectToPolygon(rect(120, 20, 60, 60)))).toBe(false);
  });
  it('un bloque que entra en la L sí se superpone', () => {
    expect(polygonsOverlap(ELE, rectToPolygon(rect(80, 80, 60, 60)))).toBe(true);
  });
  it('tocarse por un lado completo o por un vértice no cuenta', () => {
    expect(polygonsOverlap(ELE, rectToPolygon(rect(100, 0, 100, 100)))).toBe(false); // llena la muesca justo
    expect(polygonsOverlap(rectToPolygon(rect(0, 0, 100, 100)), rectToPolygon(rect(100, 100, 50, 50)))).toBe(false);
  });
  it('dos polígonos idénticos se superponen', () => {
    expect(polygonsOverlap(ELE, ELE)).toBe(true);
  });
  it('uno completamente dentro de otro, sin tocar bordes, se superpone', () => {
    expect(polygonsOverlap(rectToPolygon(rect(0, 0, 400, 400)), rectToPolygon(rect(100, 100, 50, 50)))).toBe(true);
  });
  it('un triángulo cuya hipotenusa roza una esquina no se superpone', () => {
    expect(polygonsOverlap(poly([0, 0], [100, 0], [0, 100]), rectToPolygon(rect(50, 50, 50, 50)))).toBe(false);
    expect(polygonsOverlap(poly([0, 0], [100, 0], [0, 100]), rectToPolygon(rect(40, 40, 50, 50)))).toBe(true);
  });
  it('coincide con la comparación de rectángulos en 3000 pares al azar', () => {
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const r = () => rect(rnd(10) * 20, rnd(8) * 20, (rnd(5) + 1) * 20, (rnd(4) + 1) * 20);
    for (let i = 0; i < 3000; i += 1) {
      const a = r();
      const b = r();
      expect(polygonsOverlap(rectToPolygon(a), rectToPolygon(b))).toBe(rectsOverlap(a, b));
    }
  });
});

describe('validateLayoutShape con polígonos', () => {
  const level = (sectors: { name: string; rect?: ReturnType<typeof rect> | null; points?: Point[] | null }[]) => [
    { name: 'Planta baja', sectors, elements: [] },
  ];

  it('acepta una L y un bloque en su muesca (el pasillo)', () => {
    expect(
      validateLayoutShape(level([
        { name: 'Mesas L', points: ELE },
        { name: 'Palco', rect: rect(120, 20, 60, 60) },
      ])),
    ).toEqual([]);
  });
  it('rechaza polígonos que se pisan', () => {
    const errors = validateLayoutShape(level([
      { name: 'Mesas L', points: ELE },
      { name: 'Palco', rect: rect(80, 80, 60, 60) },
    ]));
    expect(errors.join(' ')).toMatch(/se superponen/);
  });
  it('rechaza un polígono con forma inválida', () => {
    const errors = validateLayoutShape(level([{ name: 'Lazo', points: poly([0, 0], [100, 100], [100, 0], [0, 100]) }]));
    expect(errors.join(' ')).toMatch(/forma inválida/);
  });
  it('rechaza un polígono fuera del lienzo, demasiado chico o con pocos vértices', () => {
    expect(validateLayoutShape(level([{ name: 'A', points: poly([0, 0], [1200, 0], [0, 100]) }])).join(' ')).toMatch(/lienzo/);
    expect(validateLayoutShape(level([{ name: 'B', points: poly([0, 0], [20, 0], [0, 10]) }])).join(' ')).toMatch(/pequeño/);
    expect(validateLayoutShape(level([{ name: 'C', points: poly([0, 0], [100, 0]) }])).join(' ')).toMatch(/entre 3 y 64/);
  });
  it('si hay vértices, el rectángulo se ignora', () => {
    expect(validateLayoutShape(level([{ name: 'D', points: ELE, rect: rect(0, 0, 5, 5) }]))).toEqual([]);
  });
});
