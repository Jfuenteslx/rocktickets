// Lienzo lógico de cada nivel del plano. Las posiciones (x, y, w, h) de sectores y
// elementos se guardan en estas unidades; el editor las escala a la pantalla.
// El backend manda estas medidas en GET /venues/:id/layout para que el editor no
// tenga que duplicarlas.
export const LAYOUT_CANVAS = { width: 1000, height: 760 } as const;

// Tamaño mínimo de un bloque (en unidades del lienzo)
export const MIN_BLOCK_SIZE = 20;

export const MAX_LEVELS = 10;

// Un sector puede ser un polígono irregular (para recortar pasillos): de 3 a 64 vértices
export const MAX_POINTS = 64;

// Área mínima de un polígono (en unidades del lienzo al cuadrado): la de un bloque mínimo
export const MIN_POLYGON_AREA = MIN_BLOCK_SIZE * MIN_BLOCK_SIZE;
