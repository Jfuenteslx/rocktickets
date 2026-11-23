// Etiqueta legible de un asiento para el comprador y el staff:
//  - asiento de una mesa:  "Mesa 4 · B"
//  - butaca de una fila:   "Fila C · 12"
export function seatLabel(s: { tableLabel?: string | null; rowLabel?: string | null; label: string }): string {
  if (s.tableLabel) return `Mesa ${s.tableLabel} · ${s.label}`;
  if (s.rowLabel) return `Fila ${s.rowLabel} · ${s.label}`;
  return s.label;
}
