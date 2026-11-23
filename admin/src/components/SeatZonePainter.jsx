import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { errorMessage } from "../lib/api.js";
import { fmtMoney, plural } from "../lib/format.js";
import { labelPoint, rectToPolygon } from "../lib/planGeometry.js";
import { SEAT_RADIUS, TABLE_RADIUS } from "../lib/seatingGeometry.js";

// Zonas de precio sobre el plano: el plano del local con cada asiento coloreado según su tier.
// Se eligen asientos (clic, o arrastrando un recuadro sobre el plano) y se asignan a un tier o se
// sacan de él. Los asientos reservados o vendidos aparecen bloqueados y no se pueden mover.

const PALETTE = ["#F0B93A", "#6AA9E9", "#5DB98C", "#E5736F", "#B48EE0", "#7FD1C7", "#E2A04B", "#9DB36A"];
const ZOOMS = [100, 150, 220, 320];
const pointsAttr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(" ");
const KIND_COLOR = { ESCENARIO: "#F0B93A", BARRA: "#6AA9E9", BANOS: "#7FD1C7", SALIDA_EMERGENCIA: "#5DB98C", OTRO: "#8C97A6" };

const seatName = (s) => (s.tableLabel ? `Mesa ${s.tableLabel} · ${s.label}` : s.rowLabel ? `Fila ${s.rowLabel} · ${s.label}` : s.label);

export default function SeatZonePainter({ eventId, tiers, cancelled, onChanged, refreshKey = 0 }) {
  const [map, setMap] = useState(null);
  const [error, setError] = useState("");
  const [levelId, setLevelId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [tierId, setTierId] = useState("");
  const [zoom, setZoom] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text }
  const [band, setBand] = useState(null); // recuadro de selección en coordenadas del plano
  const svgRef = useRef(null);
  const drag = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/events/${eventId}/seats`);
      setMap(data);
      setError("");
      setLevelId((cur) => cur ?? data.levels[0]?.id ?? null);
    } catch (err) {
      setError(errorMessage(err, "No se pudo cargar el plano de asientos."));
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const saleTiers = useMemo(() => tiers.filter((t) => t.kind === "VENTA"), [tiers]);
  const colorOf = useMemo(() => {
    const m = new Map();
    saleTiers.forEach((t, i) => m.set(t.id, PALETTE[i % PALETTE.length]));
    return m;
  }, [saleTiers]);

  const sectorLevel = useMemo(() => new Map(map?.levels.flatMap((l) => l.sectors.map((s) => [s.id, l.id])) ?? []), [map]);
  const seatsById = useMemo(() => new Map(map?.seats.map((s) => [s.id, s]) ?? []), [map]);
  const level = map?.levels.find((l) => l.id === levelId) ?? map?.levels[0];
  const levelSeats = useMemo(() => map?.seats.filter((s) => sectorLevel.get(s.sectorId) === level?.id) ?? [], [map, sectorLevel, level]);
  const levelTables = useMemo(() => map?.tables.filter((t) => sectorLevel.get(t.sectorId) === level?.id) ?? [], [map, sectorLevel, level]);

  const tier = saleTiers.find((t) => t.id === tierId) ?? null;
  const picked = [...selected].map((id) => seatsById.get(id)).filter(Boolean);
  const sectorName = (id) => map?.levels.flatMap((l) => l.sectors).find((x) => x.id === id)?.name ?? "";
  const pickedSectorIds = [...new Set(picked.map((s) => s.sectorId))];
  // con asientos elegidos, solo se ofrecen los tiers de los sectores de esos asientos
  const tierChoices = pickedSectorIds.length ? saleTiers.filter((t) => pickedSectorIds.includes(t.sectorId)) : saleTiers;
  const sectorsWithoutTier = pickedSectorIds.filter((id) => !saleTiers.some((t) => t.sectorId === id));
  const eligible = tier ? picked.filter((s) => s.sectorId === tier.sectorId && s.tierId === null) : [];
  const alreadyIn = tier ? picked.filter((s) => s.tierId === tier.id).length : 0;
  const wrongSector = tier ? picked.filter((s) => s.sectorId !== tier.sectorId).length : 0;
  const elsewhere = tier ? picked.filter((s) => s.sectorId === tier.sectorId && s.tierId && s.tierId !== tier.id).length : 0;
  const removable = picked.filter((s) => s.tierId);

  const toPlan = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };

  function toggleSeat(seat) {
    if (seat.status === "OCUPADO") return;
    setNotice(null);
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(seat.id)) next.delete(seat.id); else next.add(seat.id);
      return next;
    });
  }

  function bgDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    drag.current = { start: toPlan(e), moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function bgMove(e) {
    const d = drag.current;
    if (!d) return;
    const p = toPlan(e);
    if (Math.abs(p.x - d.start.x) + Math.abs(p.y - d.start.y) > 6) d.moved = true;
    if (d.moved) setBand({ x1: d.start.x, y1: d.start.y, x2: p.x, y2: p.y });
  }
  function bgUp(e) {
    const d = drag.current;
    drag.current = null;
    setBand(null);
    if (!d) return;
    if (!d.moved) { setSelected(new Set()); return; }
    const p = toPlan(e);
    const [x1, x2] = [Math.min(d.start.x, p.x), Math.max(d.start.x, p.x)];
    const [y1, y2] = [Math.min(d.start.y, p.y), Math.max(d.start.y, p.y)];
    setNotice(null);
    setSelected((cur) => {
      const next = new Set(cur);
      for (const s of levelSeats) {
        if (s.status !== "OCUPADO" && s.x >= x1 && s.x <= x2 && s.y >= y1 && s.y <= y2) next.add(s.id);
      }
      return next;
    });
  }

  function selectSector(sectorId) {
    setNotice(null);
    setSelected((cur) => {
      const next = new Set(cur);
      for (const s of levelSeats) if (s.sectorId === sectorId && s.status !== "OCUPADO") next.add(s.id);
      return next;
    });
  }

  async function run(fn, doneText) {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setSelected(new Set());
      await load();
      await onChanged?.(doneText);
      setNotice({ tone: "ok", text: doneText });
    } catch (err) {
      setNotice({ tone: "bad", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const assign = () => run(
    () => api.post(`/tiers/${tier.id}/assign-seats`, { seatIds: eligible.map((s) => s.id) }),
    `${plural(eligible.length, "asiento", "asientos")} en «${tier.name}»`,
  );

  const release = () => run(async () => {
    const byTier = new Map();
    for (const s of removable) byTier.set(s.tierId, [...(byTier.get(s.tierId) ?? []), s.id]);
    for (const [id, seatIds] of byTier) await api.post(`/tiers/${id}/assign-seats`, { seatIds, release: true });
  }, `${plural(removable.length, "asiento sacado", "asientos sacados")} de su zona de precio`);

  if (error) {
    return (
      <div role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-[15px] text-bad">
        {error}{" "}
        <button type="button" className="underline" onClick={load}>Reintentar</button>
      </div>
    );
  }
  if (!map) return <p className="text-muted">Cargando plano…</p>;
  if (!level) return <p className="text-muted">El local no tiene plano dibujado todavía.</p>;

  const legend = saleTiers.map((t) => ({ t, n: map.seats.filter((s) => s.tierId === t.id).length }));
  const noZone = map.seats.filter((s) => s.tierId === null).length;
  const locked = map.seats.filter((s) => s.status === "OCUPADO").length;
  const { width, height } = map.canvas;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {map.levels.length > 1 ? (
          <div role="tablist" aria-label="Nivel del plano" className="inline-flex rounded-md border border-line p-0.5">
            {map.levels.map((l) => (
              <button
                key={l.id} type="button" role="tab" aria-selected={l.id === level.id}
                onClick={() => setLevelId(l.id)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${l.id === level.id ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}
              >{l.name}</button>
            ))}
          </div>
        ) : <span />}
        <div className="flex items-center gap-1.5" role="group" aria-label="Zoom">
          <span className="mr-1 text-[13px] text-muted">Zoom</span>
          {ZOOMS.map((z, i) => (
            <button key={z} type="button" aria-pressed={zoom === i} onClick={() => setZoom(i)}
              className={`rounded border px-2 py-1 text-[13px] ${zoom === i ? "border-lamp text-ink" : "border-line text-muted hover:text-ink"}`}>{z}%</button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="max-h-[70vh] overflow-auto rounded-md border border-line bg-bg">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: `${ZOOMS[zoom]}%`, minWidth: "100%", touchAction: "none", display: "block" }}
            role="img"
            aria-label={`Plano de asientos de ${level.name}`}
          >
            <rect x="0" y="0" width={width} height={height} fill="transparent" onPointerDown={bgDown} onPointerMove={bgMove} onPointerUp={bgUp} onPointerCancel={() => { drag.current = null; setBand(null); }} />

            {level.elements.map((el) => (
              <g key={el.id} pointerEvents="none">
                <rect x={el.x} y={el.y} width={el.w} height={el.h} fill={`${KIND_COLOR[el.kind] ?? "#8C97A6"}22`} stroke={KIND_COLOR[el.kind] ?? "#8C97A6"} strokeDasharray="6 4" />
                <text x={el.x + el.w / 2} y={el.y + el.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize="13" fill="#E9E6DD">{el.name}</text>
              </g>
            ))}

            {level.sectors.map((sec) => {
              const poly = sec.points ?? (sec.w ? rectToPolygon({ x: sec.x, y: sec.y, w: sec.w, h: sec.h }) : null);
              if (!poly) return null;
              const lp = labelPoint(poly);
              return (
                <g key={sec.id}>
                  <polygon points={pointsAttr(poly)} fill={`${sec.color}1A`} stroke={sec.color} strokeWidth="1.5" onPointerDown={bgDown} onPointerMove={bgMove} onPointerUp={bgUp} />
                  <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="15" fill={sec.color} opacity="0.55" pointerEvents="none" fontWeight="600">{sec.name}</text>
                </g>
              );
            })}

            {levelTables.map((t) => (
              <g key={t.id} pointerEvents="none">
                <circle cx={t.x} cy={t.y} r={TABLE_RADIUS} fill="#1C2530" stroke="#3A4757" />
                <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#8C97A6">{t.label}</text>
              </g>
            ))}

            {levelSeats.map((s) => {
              const color = s.tierId ? colorOf.get(s.tierId) ?? "#8C97A6" : "#8C97A6";
              const isSel = selected.has(s.id);
              const occupied = s.status === "OCUPADO";
              const fill = occupied ? "#2A3441" : s.tierId ? (s.status === "NO_VENTA" ? `${color}66` : color) : "transparent";
              return (
                <g key={s.id} onPointerDown={(e) => { e.stopPropagation(); toggleSeat(s); }} style={{ cursor: occupied ? "not-allowed" : "pointer" }}>
                  <title>{`${seatName(s)}${s.tierId ? ` · ${saleTiers.find((t) => t.id === s.tierId)?.name ?? ""}` : " · sin zona de precio"}${occupied ? " · reservado o vendido" : ""}`}</title>
                  <circle cx={s.x} cy={s.y} r={SEAT_RADIUS + 5} fill="transparent" />
                  <circle
                    cx={s.x} cy={s.y} r={isSel ? SEAT_RADIUS + 1.5 : SEAT_RADIUS}
                    fill={fill} stroke={isSel ? "#FFFFFF" : color} strokeWidth={isSel ? 2.5 : 1.2}
                    strokeDasharray={!s.tierId && !occupied ? "2 2" : undefined}
                  />
                  {occupied && <path d={`M${s.x - 3},${s.y - 3} L${s.x + 3},${s.y + 3} M${s.x + 3},${s.y - 3} L${s.x - 3},${s.y + 3}`} stroke={color} strokeWidth="1.3" pointerEvents="none" />}
                </g>
              );
            })}

            {band && (
              <rect x={Math.min(band.x1, band.x2)} y={Math.min(band.y1, band.y2)} width={Math.abs(band.x2 - band.x1)} height={Math.abs(band.y2 - band.y1)}
                fill="#F0B93A22" stroke="#F0B93A" strokeDasharray="4 3" pointerEvents="none" />
            )}
          </svg>
        </div>

        <aside className="space-y-4" aria-label="Zonas de precio">
          <div className="rounded-md border border-line bg-surface p-4">
            <h4 className="font-display text-xl font-semibold">Seleccionados: {selected.size}</h4>
            <p className="field-hint">
              Toca asientos o arrastra un recuadro sobre el plano. Tocar un espacio vacío limpia la selección.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {level.sectors.map((sec) => (
                <button key={sec.id} type="button" className="btn btn-quiet !px-2.5 !py-1 !text-[13px]" onClick={() => selectSector(sec.id)}>
                  Todo «{sec.name}»
                </button>
              ))}
              {selected.size > 0 && <button type="button" className="btn btn-ghost !px-2.5 !py-1 !text-[13px]" onClick={() => setSelected(new Set())}>Limpiar</button>}
            </div>

            {!cancelled && (
              <div className="mt-4 border-t border-line pt-4">
                <label htmlFor="zona-tier" className="field-label">Asignar a la zona de precio</label>
                <select id="zona-tier" className="input" value={tierId} onChange={(e) => setTierId(e.target.value)}>
                  <option value="">Elige un tier…</option>
                  {tierChoices.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.sectorName} · {fmtMoney(t.price)}</option>)}
                </select>
                {saleTiers.length === 0 && <p className="field-hint">Primero crea un tier con su precio en la pestaña Entradas.</p>}
                {sectorsWithoutTier.length > 0 && (
                  <p role="status" className="mt-2 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn">
                    {sectorsWithoutTier.length === 1 ? "El sector" : "Los sectores"} {sectorsWithoutTier.map((id) => `«${sectorName(id)}»`).join(", ")} {sectorsWithoutTier.length === 1 ? "no tiene" : "no tienen"} ningún tier de venta.
                    Créalo en la pestaña Entradas (en ese sector, con su precio) y vuelve aquí para asignarle los asientos.
                  </p>
                )}

                {tier && selected.size > 0 && (
                  <p className="field-hint">
                    {plural(eligible.length, "asiento", "asientos")} se asignarán a «{tier.name}».
                    {alreadyIn > 0 && ` ${plural(alreadyIn, "ya está", "ya están")} en esta zona.`}
                    {wrongSector > 0 && ` ${plural(wrongSector, "es", "son")} de otro sector y se ignoran: un tier agrupa asientos de un solo sector.`}
                    {elsewhere > 0 && ` ${plural(elsewhere, "pertenece", "pertenecen")} a otra zona: sácalos primero.`}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary !py-2 !text-sm" disabled={!tier || eligible.length === 0 || busy} onClick={assign}>
                    {busy ? "Guardando…" : `Asignar${eligible.length ? ` ${eligible.length}` : ""}`}
                  </button>
                  <button type="button" className="btn btn-quiet !py-2 !text-sm" disabled={removable.length === 0 || busy} onClick={release}>
                    Sacar de su zona{removable.length ? ` (${removable.length})` : ""}
                  </button>
                </div>
              </div>
            )}
            {notice && (
              <p role={notice.tone === "bad" ? "alert" : "status"} className={`mt-3 text-[13px] ${notice.tone === "bad" ? "text-bad" : "text-ok"}`}>{notice.text}</p>
            )}
          </div>

          <div className="rounded-md border border-line bg-surface p-4">
            <h4 className="font-display text-xl font-semibold">Zonas de precio</h4>
            <ul className="mt-2 space-y-1.5 text-[14px]">
              {legend.map(({ t, n }) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: colorOf.get(t.id) }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t.name} <span className="text-muted">· {t.sectorName}</span></span>
                  <span className="text-muted">{n}</span>
                </li>
              ))}
              <li className="flex items-center gap-2 text-muted">
                <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-dashed border-muted" aria-hidden="true" />
                <span className="flex-1">Sin zona (no se venden)</span><span>{noZone}</span>
              </li>
              <li className="flex items-center gap-2 text-muted">
                <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-line bg-line" aria-hidden="true" />
                <span className="flex-1">Reservados o vendidos (bloqueados)</span><span>{locked}</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
