import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { errorMessage } from "../lib/api.js";
import { plural } from "../lib/format.js";
import { labelPoint, rectToPolygon } from "../lib/planGeometry.js";
import { TABLE_RADIUS } from "../lib/seatingGeometry.js";

// Mesas flexibles: el comprador pide mesa indicando cuántas personas son y el sistema elige.
// Aquí el organizador solo (1) saca de la reserva las mesas que no deben ofrecerse y (2) fija la hora límite.

const ZOOMS = [100, 150, 220, 320];
const KIND_COLOR = { ESCENARIO: "#F0B93A", BARRA: "#6AA9E9", BANOS: "#7FD1C7", SALIDA_EMERGENCIA: "#5DB98C", OTRO: "#8C97A6" };
const STATUS_STYLE = {
  LIBRE: { stroke: "#5DB98C", fill: "#5DB98C26" },
  BLOQUEADA: { stroke: "#E5736F", fill: "#E5736F22" },
  RESERVADA: { stroke: "#2A3441", fill: "#2A3441" },
};
const pointsAttr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(" ");

export default function MesasFlexiblesAdmin({ ev, cancelled, onChanged, refreshKey = 0, onlyBlocks = false }) {
  const [map, setMap] = useState(null);
  const [tables, setTables] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [levelId, setLevelId] = useState(null);
  const [band, setBand] = useState(null);
  const [until, setUntil] = useState(ev.tableValidUntil ?? "23:00");
  const svgRef = useRef(null);
  const drag = useRef(null);

  const load = useCallback(async () => {
    try {
      const [m, t] = await Promise.all([api.get(`/events/${ev.id}/seats`), api.get(`/events/${ev.id}/flex-tables`)]);
      setMap(m.data);
      setTables(t.data);
      setLoadError("");
      setLevelId((cur) => cur ?? m.data.levels[0]?.id ?? null);
    } catch (err) {
      setLoadError(errorMessage(err, "No se pudo cargar el plano."));
    }
  }, [ev.id]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { setUntil(ev.tableValidUntil ?? "23:00"); }, [ev.tableValidUntil]);

  const sectorLevel = useMemo(() => new Map(map?.levels.flatMap((l) => l.sectors.map((s) => [s.id, l.id])) ?? []), [map]);
  const level = map?.levels.find((l) => l.id === levelId) ?? map?.levels[0];
  const byId = useMemo(() => new Map((tables ?? []).map((t) => [t.id, t])), [tables]);
  const levelTables = (tables ?? []).filter((t) => sectorLevel.get(t.sectorId) === level?.id);
  const picked = [...selected].map((id) => byId.get(id)).filter(Boolean);
  const toBlock = picked.filter((t) => t.status === "LIBRE");
  const toFree = picked.filter((t) => t.status === "BLOQUEADA");
  const count = (s) => (tables ?? []).filter((t) => t.status === s).length;
  const seatsLibres = (tables ?? []).filter((t) => t.status === "LIBRE").reduce((a, t) => a + t.capacity, 0);

  const toPlan = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };
  const toggle = (t) => {
    if (t.status === "RESERVADA") return;
    setNotice(null);
    setSelected((cur) => { const n = new Set(cur); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; });
  };
  const bgDown = (e) => { if (e.button !== undefined && e.button !== 0) return; drag.current = { start: toPlan(e), moved: false }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const bgMove = (e) => {
    const d = drag.current; if (!d) return;
    const p = toPlan(e);
    if (Math.abs(p.x - d.start.x) + Math.abs(p.y - d.start.y) > 6) d.moved = true;
    if (d.moved) setBand({ x1: d.start.x, y1: d.start.y, x2: p.x, y2: p.y });
  };
  const bgUp = (e) => {
    const d = drag.current; drag.current = null; setBand(null);
    if (!d) return;
    if (!d.moved) { setSelected(new Set()); return; }
    const p = toPlan(e);
    const [x1, x2] = [Math.min(d.start.x, p.x), Math.max(d.start.x, p.x)];
    const [y1, y2] = [Math.min(d.start.y, p.y), Math.max(d.start.y, p.y)];
    setSelected((cur) => { const n = new Set(cur); for (const t of levelTables) if (t.status !== "RESERVADA" && t.x >= x1 && t.x <= x2 && t.y >= y1 && t.y <= y2) n.add(t.id); return n; });
  };

  async function run(fn, doneText) {
    setBusy(true); setNotice(null);
    try { await fn(); await load(); await onChanged?.(); setNotice({ tone: "ok", text: doneText }); return true; }
    catch (err) { setNotice({ tone: "bad", text: errorMessage(err) }); return false; }
    finally { setBusy(false); }
  }
  const setBlocked = async (list, blocked) => {
    if (await run(() => api.put(`/events/${ev.id}/table-blocks`, { tableIds: list.map((t) => t.id), blocked }),
      blocked ? `${plural(list.length, "mesa fuera de la reserva", "mesas fuera de la reserva")}` : `${plural(list.length, "mesa vuelve", "mesas vuelven")} a la reserva`)) setSelected(new Set());
  };
  const saveUntil = () => run(() => api.patch(`/events/${ev.id}/table-valid-until`, { tableValidUntil: until }), "Vigencia guardada");

  if (loadError) return <p role="alert" className="text-bad">{loadError} <button type="button" className="underline" onClick={load}>Reintentar</button></p>;
  if (!map || !tables) return <p className="text-muted">Cargando…</p>;
  const { width, height } = map.canvas;

  return (
    <div className="space-y-10">
      {!onlyBlocks && <section aria-labelledby="flex-titulo">
        <h3 id="flex-titulo" className="font-display text-3xl font-semibold leading-none">2. Reserva de mesas</h3>
        <p className="mt-1.5 max-w-2xl text-[15px] text-muted">
          Quien compra entradas puede pedir mesa para su grupo: el sistema aparta la mesa libre más ajustada de su sector y, si el grupo no cabe en una, junta mesas vecinas.
          La mesa no se cobra en línea: el voucher indica consumo mínimo de 1 botella, que se paga en el local.
        </p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label" htmlFor="vig-flex">La mesa se guarda hasta las</label>
            <input id="vig-flex" type="time" className="input !w-36" value={until} onChange={(e) => setUntil(e.target.value)} disabled={cancelled} />
          </div>
          <button type="button" className="btn btn-quiet !py-2 !text-sm" onClick={saveUntil} disabled={busy || cancelled || until === ev.tableValidUntil || !until}>Guardar</button>
          <p className="field-hint max-w-md">Pasada esa hora el voucher avisa que la mesa se libera para el local; los tickets siguen valiendo.</p>
        </div>
      </section>}

      <section aria-labelledby="bloq-titulo">
        <h3 id="bloq-titulo" className="font-display text-3xl font-semibold leading-none">{onlyBlocks ? "Mesas que no se ofrecen" : "3. Mesas que no se ofrecen"}</h3>
        <p className="mt-1.5 max-w-2xl text-[15px] text-muted">
          Saca de la reserva las mesas que no deben darse al público en este evento, por ejemplo la del grupo que se presenta. Toca una mesa o arrastra un recuadro para elegir varias.
        </p>

        {tables.length === 0 ? (
          <p className="mt-3 text-[15px] text-warn">El plano del local no tiene mesas con asientos. Dibújalas en el editor del venue.</p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {map.levels.length > 1 ? (
                <div role="tablist" aria-label="Nivel del plano" className="inline-flex rounded-md border border-line p-0.5">
                  {map.levels.map((l) => (
                    <button key={l.id} type="button" role="tab" aria-selected={l.id === level.id} onClick={() => setLevelId(l.id)}
                      className={`rounded px-3 py-1.5 text-sm font-medium ${l.id === level.id ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}>{l.name}</button>
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
                <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} style={{ width: `${ZOOMS[zoom]}%`, minWidth: "100%", touchAction: "none", display: "block" }} role="img" aria-label={`Plano de mesas de ${level.name}`}>
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
                        <text x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize="15" fill={sec.color} opacity="0.45" pointerEvents="none" fontWeight="600">{sec.name}</text>
                      </g>
                    );
                  })}
                  {map.seats.filter((s) => s.tableId && levelTables.some((t) => t.id === s.tableId)).map((s) => (
                    <circle key={s.id} cx={s.x} cy={s.y} r="4" fill="#3A4757" pointerEvents="none" />
                  ))}
                  {levelTables.map((t) => {
                    const st = STATUS_STYLE[t.status];
                    const isSel = selected.has(t.id);
                    const reserved = t.status === "RESERVADA";
                    return (
                      <g key={t.id} onPointerDown={(e) => { e.stopPropagation(); toggle(t); }} style={{ cursor: reserved ? "not-allowed" : "pointer" }}>
                        <title>{`Mesa ${t.label} · ${t.capacity} asientos · ${t.status === "LIBRE" ? "libre" : t.status === "BLOQUEADA" ? "fuera de la reserva" : "reservada por un comprador"}`}</title>
                        <circle cx={t.x} cy={t.y} r={TABLE_RADIUS + 6} fill={st.fill} stroke={isSel ? "#FFFFFF" : st.stroke} strokeWidth={isSel ? 3 : 1.5} strokeDasharray={t.status === "BLOQUEADA" ? "3 3" : undefined} />
                        <text x={t.x} y={t.y - 2} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="600" fill="#E9E6DD" pointerEvents="none">{t.label}</text>
                        <text x={t.x} y={t.y + 10} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#8C97A6" pointerEvents="none">{t.capacity}</text>
                      </g>
                    );
                  })}
                  {band && <rect x={Math.min(band.x1, band.x2)} y={Math.min(band.y1, band.y2)} width={Math.abs(band.x2 - band.x1)} height={Math.abs(band.y2 - band.y1)} fill="#F0B93A22" stroke="#F0B93A" strokeDasharray="4 3" pointerEvents="none" />}
                </svg>
              </div>

              <aside className="space-y-4" aria-label="Mesas fuera de la reserva">
                <div className="rounded-md border border-line bg-surface p-4">
                  <h4 className="font-display text-xl font-semibold">Mesas elegidas: {selected.size}</h4>
                  {selected.size > 0 && <button type="button" className="btn btn-ghost mt-2 !px-2.5 !py-1 !text-[13px]" onClick={() => setSelected(new Set())}>Limpiar</button>}
                  {!cancelled && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                      <button type="button" className="btn btn-primary !py-2 !text-sm" disabled={toBlock.length === 0 || busy} onClick={() => setBlocked(toBlock, true)}>
                        {busy ? "Guardando…" : `Sacar de la reserva${toBlock.length ? ` (${toBlock.length})` : ""}`}
                      </button>
                      <button type="button" className="btn btn-quiet !py-2 !text-sm" disabled={toFree.length === 0 || busy} onClick={() => setBlocked(toFree, false)}>
                        Devolver{toFree.length ? ` (${toFree.length})` : ""}
                      </button>
                    </div>
                  )}
                  {notice && <p role={notice.tone === "bad" ? "alert" : "status"} className={`mt-3 text-[13px] ${notice.tone === "bad" ? "text-bad" : "text-ok"}`}>{notice.text}</p>}
                </div>

                <div className="rounded-md border border-line bg-surface p-4">
                  <h4 className="font-display text-xl font-semibold">Estado</h4>
                  <ul className="mt-2 space-y-1.5 text-[14px]">
                    <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 shrink-0 rounded-full border border-ok bg-ok/30" aria-hidden="true" /><span className="flex-1">Libres para reservar</span><span>{count("LIBRE")}</span></li>
                    <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 shrink-0 rounded-full border border-dashed border-bad" aria-hidden="true" /><span className="flex-1">Fuera de la reserva</span><span>{count("BLOQUEADA")}</span></li>
                    <li className="flex items-center gap-2 text-muted"><span className="inline-block h-3 w-3 shrink-0 rounded-full border border-line bg-line" aria-hidden="true" /><span className="flex-1">Reservadas por compradores</span><span>{count("RESERVADA")}</span></li>
                  </ul>
                  <p className="mt-3 text-[13px] text-muted">Quedan {plural(seatsLibres, "lugar", "lugares")} en mesas libres.</p>
                </div>
              </aside>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
