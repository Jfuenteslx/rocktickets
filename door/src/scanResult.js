import { fmtTime } from './format';

// Convierte la respuesta de POST /tickets/scan en lo que se muestra en pantalla.
// tone: ok (verde) | bad (rojo: no pasa) | warn (ámbar: revisar / reintentar)
export function describeScan(res) {
  if (res.offlineUnknown) {
    return { tone: 'warn', glyph: '?', title: 'NO ESTÁ EN LA LISTA', sub: 'Sin conexión: puede ser una compra reciente. Revisa su entrada y escanea de nuevo cuando vuelva la red.', lines: [], sticky: true };
  }
  if (res.neterr && res.nolist) {
    return { tone: 'warn', glyph: '!', title: 'SIN CONEXIÓN', sub: 'Sin red y sin la lista de entradas descargada. Reintenta.', lines: [], sticky: true, retry: true };
  }
  if (res.neterr) {
    return { tone: 'warn', glyph: '!', title: 'SIN CONEXIÓN', sub: 'No se pudo verificar. Reintenta.', lines: [], sticky: true, retry: true };
  }
  const d = res.detail;
  const who = d?.holder ? [d.holder] : [];
  const where = d ? [[d.tierName, d.sectorName].filter(Boolean).join(' · ')] : [];
  const code = res.ticket?.shortCode ? [res.ticket.shortCode] : [];
  // Grupos: "Ingresaron 2 de 4 de esta compra" (solo si la compra tiene más de una entrada)
  const p = d?.party;
  const group = p && p.total > 1 ? `Ingresaron ${p.entered} de ${p.total} de esta compra` : '';

  if (res.result === 'ADMITIDO') {
    return { tone: 'ok', glyph: '✓', title: 'ADMITIDO', sub: [d?.kind === 'CORTESIA' ? 'CORTESÍA' : '', res.offline ? 'SIN CONEXIÓN' : ''].filter(Boolean).join(' · '), lines: [...who, ...where, ...code], group, sticky: false };
  }
  switch (res.reason) {
    case 'YA_USADO':
      return { tone: 'bad', glyph: '✕', title: 'YA USADA', sub: d?.firstScannedAt ? `Ingresó a las ${fmtTime(d.firstScannedAt)}` : 'Esta entrada ya ingresó', lines: [...who, ...code], group, sticky: true };
    case 'ANULADO':
      return { tone: 'bad', glyph: '✕', title: 'ANULADA', sub: 'Esta entrada fue anulada', lines: [...who, ...code], group, sticky: true };
    case 'NO_PAGADO':
      return { tone: 'bad', glyph: '✕', title: 'SIN PAGO', sub: 'El pago de esta entrada no está confirmado', lines: [...who, ...code], group, sticky: true };
    case 'OTRO_EVENTO':
      return { tone: 'warn', glyph: '!', title: 'OTRO EVENTO', sub: 'Esta entrada no es de este evento', lines: [], sticky: true };
    default:
      return { tone: 'warn', glyph: '?', title: 'NO RECONOCIDO', sub: res.message || 'Código no reconocido', lines: [], sticky: true };
  }
}
