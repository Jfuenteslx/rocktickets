import { useEffect, useId, useRef, useState } from "react";
import { SEAT_RADIUS, TABLE_RADIUS } from "../lib/seatingGeometry.js";
import { MAX_POINTS, clampRect, labelPoint, polygonBBox, resizeRect, snap } from "../lib/planGeometry.js";

const KIND_LABEL = {
  ESCENARIO: "Escenario",
  BARRA: "Barra",
  BANOS: "Baños",
  SALIDA_EMERGENCIA: "Salida de emergencia",
  OTRO: "Referencia",
};

// Color de cada tipo de elemento de referencia (el borde siempre es punteado: no son sectores)
const KIND_STYLE = {
  ESCENARIO: "#F0B93A",
  BARRA: "#6AA9E9",
  BANOS: "#7FD1C7",
  SALIDA_EMERGENCIA: "#5DB98C",
  OTRO: "#8C97A6",
};

const TYPE_LABEL = { MESAS: "Mesas", BUTACAS: "Butacas", DE_PIE: "De pie", MIXTO: "Mixto" };

const pointsAttr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(" ");

const HANDLE = 12;
const CORNERS = [
  { id: "nw", cursor: "nwse-resize", fx: 0, fy: 0 },
  { id: "ne", cursor: "nesw-resize", fx: 1, fy: 0 },
  { id: "sw", cursor: "nesw-resize", fx: 0, fy: 1 },
  { id: "se", cursor: "nwse-resize", fx: 1, fy: 1 },
];

// Dibujo del plano de UN nivel: un SVG con coordenadas lógicas (canvas.width × canvas.height)
// escalado al ancho disponible. En modo `editable` los bloques se mueven y redimensionan con el
// puntero (ajustados a la cuadrícula) y se pueden soltar sectores desde la lista.
// Un sector puede ser un bloque rectangular (`rect`) o un polígono irregular (`points`): del
// polígono se mueven los vértices, se agregan vértices tocando el punto medio de un lado y se
// quita un vértice con doble toque. La rueda del mouse acerca y aleja (zoom en el cursor) y se
// arrastra el fondo para desplazar el plano cuando está acercado. `seating` ({ tables, rows })
// dibuja las mesas y butacas de un sector; `focusRect` acerca la vista a un rectángulo; `locked`
// deja el plano solo para mirar (se usa mientras se editan las mesas y los asientos). Con `seatEdit`
// las mesas y los asientos se seleccionan y se arrastran (onSeatSelect / onSeatMove); con `placing`
// un toque en el plano llama a onPlace con el punto, para poner una mesa o una butaca nueva. Con `drawing` ({ points }) cada toque en el plano agrega un
// punto de una forma nueva; tocar el primer punto la cierra.
export default function PlanCanvas({
  canvas,
  level,
  selectedId = null,
  onSelect,
  editable = false,
  conflicts,
  onChangeRect,
  onChangeElementRect,
  onChangeShape,
  drawing = null,
  onDrawPoint,
  onDrawClose,
  onDrop,
  locked = false,
  seating = null,
  focusRect = null,
  seatEdit = false,
  seatSelected = null,
  onSeatSelect,
  onSeatMove,
  placing = false,
  onPlace,
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [cursor, setCursor] = useState(null);
  const { width, height } = canvas;
  const placed = level.sectors.filter((s) => s.rect);
  const interactive = editable && !drawing && !locked;

  // Zoom y desplazamiento: la parte del lienzo que se ve ahora
  const [vb, setVb] = useState({ x: 0, y: 0, w: width, h: height });
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const panRef = useRef(null);
  const MIN_W = width / 16;

  const fit = (box) => {
    const w = Math.min(width, Math.max(MIN_W, box.w));
    const h = (w * height) / width;
    return { x: Math.min(Math.max(box.x, 0), width - w), y: Math.min(Math.max(box.y, 0), height - h), w, h };
  };
  function zoomAt(factor, cx, cy) {
    const cur = vbRef.current;
    const w = Math.min(width, Math.max(MIN_W, cur.w / factor));
    const k = w / cur.w;
    setVb(fit({ x: cx - (cx - cur.x) * k, y: cy - (cy - cur.y) * k, w }));
  }
  const reset = () => setVb({ x: 0, y: 0, w: width, h: height });

  // La rueda acerca/aleja alrededor del cursor (listener no pasivo para poder frenar el scroll de la página)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    function onWheel(e) {
      e.preventDefault();
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [width, height]);

  // Acerca la vista a un rectángulo (con margen) o vuelve a ver todo
  const focusKey = focusRect ? `${focusRect.x},${focusRect.y},${focusRect.w},${focusRect.h}` : "";
  useEffect(() => {
    if (!focusRect) { reset(); return; }
    const scale = Math.max((focusRect.w + 80) / width, (focusRect.h + 80) / height);
    const w = Math.min(width, Math.max(MIN_W, width * scale));
    const h = (w * height) / width;
    setVb(fit({ x: focusRect.x + focusRect.w / 2 - w / 2, y: focusRect.y + focusRect.h / 2 - h / 2, w }));
  }, [focusKey]);

  function startPan(e) {
    if (drawing || vbRef.current.w >= width - 0.5) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = { cx: e.clientX, cy: e.clientY, vb: { ...vbRef.current }, moved: false };
  }
  function movePan(e) {
    const d = panRef.current;
    if (!d) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = e.clientX - d.cx;
    const dy = e.clientY - d.cy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    const k = d.vb.w / rect.width;
    setVb(fit({ x: d.vb.x - dx * k, y: d.vb.y - dy * k, w: d.vb.w }));
  }
  const endPan = () => { setTimeout(() => { panRef.current = null; }, 0); };

  // Arrastre de una mesa o de un asiento (en modo edición de mesas y asientos)
  const seatDrag = useRef(null);
  function startSeatDrag(e, kind, item) {
    if (!seatEdit) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSvg(e);
    seatDrag.current = { kind, k: item.k, off: { x: p.x - item.x, y: p.y - item.y } };
    onSeatSelect?.({ kind, k: item.k });
  }
  function moveSeatDrag(e) {
    const d = seatDrag.current;
    if (!d) return;
    const p = toSvg(e);
    onSeatMove?.(d.kind, d.k, Math.round(p.x - d.off.x), Math.round(p.y - d.off.y));
  }
  const endSeatDrag = () => { seatDrag.current = null; };
  const seatEvents = { onPointerMove: moveSeatDrag, onPointerUp: endSeatDrag, onPointerCancel: endSeatDrag };
  const isSel = (kind, k) => seatSelected?.kind === kind && seatSelected.k === k;

  function toSvg(e) {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  }

  // `item` es un sector o un elemento de referencia; `type` dice cuál
  function startDrag(e, item, mode, type = "sector") {
    if (!interactive) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id: item.id, type, mode, start: toSvg(e), rect: { ...item.rect }, points: item.points ?? null };
    onSelect?.(item.id);
  }

  const emitShape = (id, points) => onChangeShape?.(id, { rect: polygonBBox(points), points });

  // Tocar el punto medio de un lado agrega un vértice ahí y lo deja listo para arrastrar
  function startMidpoint(e, sector, i) {
    if (!interactive || sector.points.length >= MAX_POINTS) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const a = sector.points[i];
    const b = sector.points[(i + 1) % sector.points.length];
    const points = [...sector.points];
    points.splice(i + 1, 0, { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) });
    dragRef.current = { id: sector.id, type: "sector", mode: `v${i + 1}`, start: toSvg(e), rect: { ...sector.rect }, points };
    emitShape(sector.id, points);
  }

  function moveDrag(e) {
    const d = dragRef.current;
    if (!d) return;
    const p = toSvg(e);
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    if (d.points) {
      // sector poligonal: mover todo o arrastrar un vértice
      if (d.mode === "move") {
        const box = polygonBBox(d.points);
        const mx = Math.min(Math.max(snap(dx), -box.x), width - box.x - box.w);
        const my = Math.min(Math.max(snap(dy), -box.y), height - box.y - box.h);
        emitShape(d.id, d.points.map((q) => ({ x: q.x + mx, y: q.y + my })));
      } else {
        const i = Number(d.mode.slice(1));
        const pt = { x: Math.min(Math.max(snap(p.x), 0), width), y: Math.min(Math.max(snap(p.y), 0), height) };
        emitShape(d.id, d.points.map((q, k) => (k === i ? pt : q)));
      }
      return;
    }
    const next =
      d.mode === "move"
        ? { ...d.rect, x: snap(d.rect.x + dx), y: snap(d.rect.y + dy) }
        : resizeRect(d.rect, d.mode, dx, dy, canvas);
    (d.type === "element" ? onChangeElementRect : onChangeRect)?.(d.id, clampRect(next, canvas));
  }

  const endDrag = () => { dragRef.current = null; };
  const dragEvents = { onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag };

  function removeVertex(sector, i) {
    if (!interactive || sector.points.length <= 3) return;
    emitShape(sector.id, sector.points.filter((_, k) => k !== i));
  }

  const snapPoint = (e) => {
    const p = toSvg(e);
    return { x: Math.min(Math.max(snap(p.x), 0), width), y: Math.min(Math.max(snap(p.y), 0), height) };
  };

  const selectedSector = placed.find((s) => s.id === selectedId);
  const selectedElement = level.elements.find((el) => el.id === selectedId);
  const handleTarget = selectedSector
    ? { item: selectedSector, type: "sector" }
    : selectedElement
      ? { item: selectedElement, type: "element" }
      : null;

  const rowStarts = new Map();
  for (const r of seating?.rows ?? []) {
    const cur = rowStarts.get(r.rowLabel);
    if (!cur || r.x < cur.x) rowStarts.set(r.rowLabel, { x: r.x, y: r.y });
  }

  return (
    <div className="relative">
    <svg
      ref={svgRef}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      className="w-full select-none rounded-lg border border-line bg-bg"
      role="img"
      aria-label={`Plano del nivel ${level.name}`}
      style={{ cursor: drawing ? "crosshair" : undefined }}
      onPointerMove={drawing ? (e) => setCursor(snapPoint(e)) : undefined}
      onPointerLeave={drawing ? () => setCursor(null) : undefined}
      onDragOver={editable ? (e) => e.preventDefault() : undefined}
      onDrop={
        editable
          ? (e) => {
              e.preventDefault();
              const payload = e.dataTransfer.getData("text/plain");
              if (payload) onDrop?.(payload, toSvg(e));
            }
          : undefined
      }
    >
      <defs>
        <pattern id={`grid-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1.1" fill="#3A4757" />
        </pattern>
        {placed.map((s) => (
          <clipPath key={s.id} id={`clip-${uid}-${s.id}`}>
            {s.points ? (
              <polygon points={pointsAttr(s.points)} />
            ) : (
              <rect x={s.rect.x} y={s.rect.y} width={s.rect.w} height={s.rect.h} rx="6" />
            )}
          </clipPath>
        ))}
        {level.elements.map((el) => (
          <clipPath key={el.id} id={`clip-${uid}-${el.id}`}>
            <rect x={el.rect.x} y={el.rect.y} width={el.rect.w} height={el.rect.h} rx="4" />
          </clipPath>
        ))}
      </defs>
      <rect
        width={width} height={height} fill={`url(#grid-${uid})`}
        onClick={
          drawing
            ? (e) => onDrawPoint?.(snapPoint(e))
            : placing
              ? (e) => { if (!panRef.current?.moved) onPlace?.(toSvg(e)); }
              : () => { if (!panRef.current?.moved) onSelect?.(null); }
        }
        onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}
        style={{ cursor: placing ? "crosshair" : !drawing && vb.w < width - 0.5 ? "grab" : undefined }}
      />

      {level.elements.map((el) => {
        const { x, y, w, h } = el.rect;
        const color = KIND_STYLE[el.kind] ?? KIND_STYLE.OTRO;
        const selected = el.id === selectedId;
        return (
          <g
            key={el.id}
            pointerEvents={interactive ? "auto" : "none"}
            onClick={interactive ? (e) => { e.stopPropagation(); onSelect?.(el.id); } : undefined}
            onPointerDown={(e) => startDrag(e, el, "move", "element")}
            {...dragEvents}
            style={{ cursor: interactive ? "move" : "default", touchAction: interactive ? "none" : "auto" }}
          >
            <rect
              x={x} y={y} width={w} height={h} rx="4"
              fill={color} fillOpacity="0.1"
              stroke={selected ? "#F0B93A" : color} strokeWidth={selected ? 3 : 1.5} strokeDasharray="6 4"
            />
            <text
              x={x + w / 2} y={y + h / 2}
              textAnchor="middle" dominantBaseline="middle" fontSize="13" fill={color}
              clipPath={`url(#clip-${uid}-${el.id})`} pointerEvents="none"
            >
              {el.name || KIND_LABEL[el.kind]}
            </text>
          </g>
        );
      })}

      {placed.map((s) => {
        const { x, y, w, h } = s.rect;
        const selected = s.id === selectedId;
        const dim = !s.sellable;
        const bad = conflicts?.has(s.id);
        const color = bad ? "#E5736F" : s.color;
        const paint = {
          fill: color,
          fillOpacity: bad ? 0.3 : dim ? 0.08 : 0.22,
          stroke: selected ? "#F0B93A" : color,
          strokeWidth: selected || bad ? 3 : 1.5,
          strokeDasharray: dim ? "6 4" : undefined,
        };
        const at = s.points ? labelPoint(s.points) : { x: x + w / 2, y: y + h / 2 };
        return (
          <g
            key={s.id}
            pointerEvents={drawing ? "none" : "auto"}
            onClick={
              placing
                ? (e) => { e.stopPropagation(); if (!panRef.current?.moved) onPlace?.(toSvg(e)); }
                : onSelect ? (e) => { e.stopPropagation(); onSelect(s.id); } : undefined
            }
            onPointerDown={(e) => startDrag(e, s, "move")}
            {...dragEvents}
            style={{ cursor: placing ? "crosshair" : interactive ? "move" : onSelect ? "pointer" : "default", touchAction: interactive ? "none" : "auto" }}
          >
            {s.points ? (
              <polygon points={pointsAttr(s.points)} strokeLinejoin="round" {...paint} />
            ) : (
              <rect x={x} y={y} width={w} height={h} rx="6" {...paint} />
            )}
            <g clipPath={`url(#clip-${uid}-${s.id})`} pointerEvents="none">
              <text x={at.x} y={at.y - 8} textAnchor="middle" fontSize="15" fontWeight="600" fill="#E9E6DD">
                {s.name}
              </text>
              <text x={at.x} y={at.y + 12} textAnchor="middle" fontSize="12" fill="#8C97A6">
                {dim ? "No vendible" : `${TYPE_LABEL[s.type] ?? s.type} · ${s.capacity}`}
              </text>
            </g>
          </g>
        );
      })}

      {seating && (
        <g pointerEvents={seatEdit ? "auto" : "none"}>
          {[...rowStarts].map(([label, p]) => (
            <text key={`r-${label}`} x={p.x - 14} y={p.y + 4} textAnchor="middle" fontSize="11" fill="#8C97A6" pointerEvents="none">{label}</text>
          ))}
          {seating.rows.map((q) => (
            <circle
              key={q.k ?? `${q.rowLabel}-${q.label}`} cx={q.x} cy={q.y} r={SEAT_RADIUS}
              fill={q.active ? "#F0B93A" : "none"} fillOpacity="0.9"
              stroke={isSel("seat", q.k) ? "#FFFFFF" : "#F0B93A"} strokeWidth={isSel("seat", q.k) ? 2.5 : 1} strokeDasharray={q.active ? undefined : "2 2"}
              onPointerDown={(e) => startSeatDrag(e, "seat", q)} {...seatEvents}
              style={{ cursor: seatEdit ? "move" : undefined, touchAction: seatEdit ? "none" : undefined }}
            >
              {seatEdit && <title>{`${q.rowLabel}-${q.label}`}</title>}
            </circle>
          ))}
          {seating.tables.map((t) => (
            <g key={t.k ?? t.id ?? t.label}>
              {t.seats.map((q) => (
                <circle
                  key={q.k ?? q.id ?? q.label} cx={q.x} cy={q.y} r={SEAT_RADIUS}
                  fill={q.active ? "#F0B93A" : "none"} fillOpacity="0.9"
                  stroke={isSel("seat", q.k) ? "#FFFFFF" : "#F0B93A"} strokeWidth={isSel("seat", q.k) ? 2.5 : 1} strokeDasharray={q.active ? undefined : "2 2"}
                  onPointerDown={(e) => startSeatDrag(e, "seat", q)} {...seatEvents}
                  style={{ cursor: seatEdit ? "move" : undefined, touchAction: seatEdit ? "none" : undefined }}
                >
                  {seatEdit && <title>{`${t.label}-${q.label}`}</title>}
                </circle>
              ))}
              <circle
                cx={t.x} cy={t.y} r={TABLE_RADIUS} fill="#2A3442"
                stroke={isSel("table", t.k) ? "#FFFFFF" : "#8C97A6"} strokeWidth={isSel("table", t.k) ? 3 : 1.5}
                onPointerDown={(e) => startSeatDrag(e, "table", t)} {...seatEvents}
                style={{ cursor: seatEdit ? "move" : undefined, touchAction: seatEdit ? "none" : undefined }}
              />
              <text x={t.x} y={t.y + 3.5} textAnchor="middle" fontSize="10" fill="#E9E6DD" pointerEvents="none">{t.label}</text>
            </g>
          ))}
        </g>
      )}

      {interactive && handleTarget && !handleTarget.item.points &&
        CORNERS.map((c) => {
          const r = handleTarget.item.rect;
          return (
            <rect
              key={c.id}
              x={r.x + c.fx * r.w - HANDLE / 2}
              y={r.y + c.fy * r.h - HANDLE / 2}
              width={HANDLE} height={HANDLE} rx="2"
              fill="#F0B93A" stroke="#1B1405"
              onPointerDown={(e) => startDrag(e, handleTarget.item, c.id, handleTarget.type)}
              {...dragEvents}
              style={{ cursor: c.cursor, touchAction: "none" }}
            />
          );
        })}

      {interactive && selectedSector?.points && (
        <g>
          {selectedSector.points.length < MAX_POINTS &&
            selectedSector.points.map((p, i) => {
              const q = selectedSector.points[(i + 1) % selectedSector.points.length];
              return (
                <circle
                  key={`m${i}`} cx={(p.x + q.x) / 2} cy={(p.y + q.y) / 2} r="5"
                  fill="#1B1405" stroke="#F0B93A" strokeWidth="1.5" opacity="0.85"
                  onPointerDown={(e) => startMidpoint(e, selectedSector, i)}
                  {...dragEvents}
                  style={{ cursor: "copy", touchAction: "none" }}
                >
                  <title>Arrastra para agregar un vértice</title>
                </circle>
              );
            })}
          {selectedSector.points.map((p, i) => (
            <circle
              key={`v${i}`} cx={p.x} cy={p.y} r="7"
              fill="#F0B93A" stroke="#1B1405" strokeWidth="1.5"
              onPointerDown={(e) => startDrag(e, selectedSector, `v${i}`)}
              onDoubleClick={() => removeVertex(selectedSector, i)}
              {...dragEvents}
              style={{ cursor: "move", touchAction: "none" }}
            >
              <title>Arrastra para mover · doble toque para quitar</title>
            </circle>
          ))}
        </g>
      )}

      {drawing && (
        <g>
          {drawing.points.length > 0 && (
            <polyline
              points={pointsAttr(cursor ? [...drawing.points, cursor] : drawing.points)}
              fill="none" stroke="#F0B93A" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none"
            />
          )}
          {drawing.points.map((p, i) => (
            <circle
              key={i} cx={p.x} cy={p.y} r={i === 0 && drawing.points.length >= 3 ? 10 : 5}
              fill={i === 0 ? "#F0B93A" : "#1B1405"} stroke="#F0B93A" strokeWidth="2"
              onClick={i === 0 && drawing.points.length >= 3 ? (e) => { e.stopPropagation(); onDrawClose?.(); } : undefined}
              pointerEvents={i === 0 && drawing.points.length >= 3 ? "auto" : "none"}
              style={{ cursor: "pointer" }}
            />
          ))}
        </g>
      )}
    </svg>
    <div className="absolute right-2 top-2 flex gap-1">
      <button type="button" className="btn btn-quiet !px-2.5 !py-1 !text-sm" aria-label="Acercar" onClick={() => zoomAt(1.4, vb.x + vb.w / 2, vb.y + vb.h / 2)}>+</button>
      <button type="button" className="btn btn-quiet !px-2.5 !py-1 !text-sm" aria-label="Alejar" onClick={() => zoomAt(1 / 1.4, vb.x + vb.w / 2, vb.y + vb.h / 2)}>−</button>
      <button type="button" className="btn btn-quiet !px-2.5 !py-1 !text-sm" onClick={reset} disabled={vb.w >= width - 0.5}>Ver todo</button>
    </div>
    </div>
  );
}

export { KIND_LABEL, TYPE_LABEL };
