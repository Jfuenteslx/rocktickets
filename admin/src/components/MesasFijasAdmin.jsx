import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { errorMessage } from "../lib/api.js";
import { fmtMoney, plural } from "../lib/format.js";
import { labelPoint, rectToPolygon } from "../lib/planGeometry.js";
import { TABLE_RADIUS } from "../lib/seatingGeometry.js";

// Mesas fijas: 1) paquetes (personas + botella + precio) y 2) qué paquete vende cada mesa del plano.

const PALETTE = ["#F0B93A", "#6AA9E9", "#5DB98C", "#E5736F", "#B48EE0", "#7FD1C7", "#E2A04B", "#9DB36A"];
const ZOOMS = [100, 150, 220, 320];
const KIND_COLOR = { ESCENARIO: "#F0B93A", BARRA: "#6AA9E9", BANOS: "#7FD1C7", SALIDA_EMERGENCIA: "#5DB98C", OTRO: "#8C97A6" };
const pointsAttr = (pts) => pts.map((p) => `${p.x},${p.y}`).join(" ");
const splitBottles = (text) => [...new Set(text.split(",").map((b) => b.trim()).filter(Boolean))];

function PackageForm({ initial, locked, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [people, setPeople] = useState(initial ? String(initial.people) : "6");
  const [price, setPrice] = useState(initial ? String(Number(initial.price)) : "");
  const [bottles, setBottles] = useState(initial?.bottleOptions.join(", ") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const p = Number(people), pr = Number(price);
  const cents = Math.round(pr * 100);
  const splits = p > 0 && cents > 0 && cents % p === 0;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ name: name.trim(), people: p, price: pr, bottleOptions: splitBottles(bottles) });
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar el paquete."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-md border border-line bg-bg p-4">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <label className="field-label" htmlFor="pk-name">Nombre</label>
          <input id="pk-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mesa 6 + botella" maxLength={60} required />
        </div>
        <div>
          <label className="field-label" htmlFor="pk-people">Personas</label>
          <input id="pk-people" className="input" type="number" min="1" max="30" value={people} onChange={(e) => setPeople(e.target.value)} required disabled={locked} />
        </div>
        <div>
          <label className="field-label" htmlFor="pk-price">Precio total (Bs)</label>
          <input id="pk-price" className="input" type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
      </div>
      <p className={`field-hint ${price && !splits ? "!text-warn" : ""}`}>
        {price && p > 0
          ? splits
            ? `Cada persona paga ${fmtMoney(cents / p / 100)}: el precio incluye la entrada de cada una.`
            : `El precio debe repartirse en partes iguales entre ${p} personas (en centavos exactos).`
          : "El precio incluye las entradas de cada persona y la botella."}
      </p>
      <div className="mt-3">
        <label className="field-label" htmlFor="pk-bottles">Botellas a elegir (separadas por coma)</label>
        <input id="pk-bottles" className="input" value={bottles} onChange={(e) => setBottles(e.target.value)} placeholder="Fernet, Singani" />
        <p className="field-hint">El comprador elige una al reservar. Déjalo vacío si el paquete no pide elegir.</p>
      </div>
      {locked && <p className="field-hint">Este paquete ya tiene mesas: para cambiar las personas quítalo antes de sus mesas.</p>}
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" className="btn btn-primary !py-2 !text-sm" disabled={busy || !splits || !name.trim()}>{busy ? "Guardando…" : "Guardar paquete"}</button>
        <button type="button" className="btn btn-ghost !py-2 !text-sm" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </form>
  );
}

export default function MesasFijasAdmin({ ev, cancelled, onChanged, refreshKey = 0 }) {
  const [packages, setPackages] = useState(null);
  const [map, setMap] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(null); // "new" | packageId | null
  const [confirmDel, setConfirmDel] = useState(null);
  const [notice, setNotice] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [pkgId, setPkgId] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [levelId, setLevelId] = useState(null);
  const [band, setBand] = useState(null);
  const [until, setUntil] = useState(ev.tableValidUntil ?? "23:00");
  const svgRef = useRef(null);
  const drag = useRef(null);

  const load = useCallback(async () => {
    try {
      const [p, m] = await Promise.all([api.get(`/events/${ev.id}/table-packages`), api.get(`/events/${ev.id}/seats`)]);
      setPackages(p.data);
      setMap(m.data);
      setLoadError("");
      setLevelId((cur) => cur ?? m.data.levels[0]?.id ?? null);
    } catch (err) {
      setLoadError(errorMessage(err, "No se pudo cargar los paquetes y el plano."));
    }
  }, [ev.id]);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { setUntil(ev.tableValidUntil ?? "23:00"); }, [ev.tableValidUntil]);

  const colorOf = useMemo(() => new Map((packages ?? []).map((p, i) => [p.id, PALETTE[i % PALETTE.length]])), [packages]);
  const sectorLevel = useMemo(() => new Map(map?.levels.flatMap((l) => l.sectors.map((s) => [s.id, l.id])) ?? []), [map]);
  const level = map?.levels.find((l) => l.id === levelId) ?? map?.levels[0];
  const mesas = map?.mesas ?? [];
  const levelMesas = mesas.filter((m) => sectorLevel.get(m.sectorId) === level?.id);
  const mesasById = new Map(mesas.map((m) => [m.id, m]));
  const seatsById = useMemo(() => new Map(map?.seats.map((s) => [s.id, s]) ?? []), [map]);
  const pkg = packages?.find((p) => p.id === pkgId) ?? null;
  const picked = [...selected].map((id) => mesasById.get(id)).filter(Boolean);
  const eligible = pkg ? picked.filter((m) => m.seatIds.length === pkg.people && m.package?.id !== pkg.id) : [];
  const mismatch = pkg ? picked.filter((m) => m.seatIds.length !== pkg.people).length : 0;
  const sameAlready = pkg ? picked.filter((m) => m.package?.id === pkg.id).length : 0;
  const removable = picked.filter((m) => m.package);
  const sizes = [...new Set(picked.map((m) => m.seatIds.length))];
  const pkgChoices = picked.length ? (packages ?? []).filter((p) => sizes.includes(p.people)) : packages ?? [];

  const toPlan = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  };
  const toggle = (m) => {
    if (m.status === "OCUPADO") return;
    setNotice(null);
    setSelected((cur) => { const n = new Set(cur); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; });
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
    setSelected((cur) => { const n = new Set(cur); for (const m of levelMesas) if (m.status !== "OCUPADO" && m.x >= x1 && m.x <= x2 && m.y >= y1 && m.y <= y2) n.add(m.id); return n; });
  };
  const selectSector = (sid) => setSelected((cur) => { const n = new Set(cur); for (const m of levelMesas) if (m.sectorId === sid && m.status !== "OCUPADO") n.add(m.id); return n; });

  async function run(fn, doneText) {
    setBusy(true); setNotice(null);
    try { await fn(); await load(); await onChanged?.(); setNotice({ tone: "ok", text: doneText }); return true; }
    catch (err) { setNotice({ tone: "bad", text: errorMessage(err) }); return false; }
    finally { setBusy(false); }
  }
  const assign = async () => { if (await run(() => api.put(`/events/${ev.id}/table-assignments`, { packageId: pkg.id, tableIds: eligible.map((m) => m.id) }), `${plural(eligible.length, "mesa", "mesas")} con «${pkg.name}»`)) setSelected(new Set()); };
  const clear = async () => { if (await run(() => api.put(`/events/${ev.id}/table-assignments`, { packageId: null, tableIds: removable.map((m) => m.id) }), `${plural(removable.length, "mesa sin paquete", "mesas sin paquete")}`)) setSelected(new Set()); };
  const savePackage = async (body) => {
    if (editing === "new") await api.post(`/events/${ev.id}/table-packages`, body);
    else await api.patch(`/table-packages/${editing}`, body);
    setEditing(null); await load(); await onChanged?.();
  };
  const removePackage = (p) => run(() => api.delete(`/table-packages/${p.id}`), `Paquete «${p.name}» eliminado`).then(() => setConfirmDel(null));
  const saveUntil = () => run(() => api.patch(`/events/${ev.id}/table-valid-until`, { tableValidUntil: until }), "Vigencia guardada");

  if (loadError) return <p role="alert" className="text-bad">{loadError} <button type="button" className="underline" onClick={load}>Reintentar</button></p>;
  if (!packages || !map) return <p className="text-muted">Cargando…</p>;
  const { width, height } = map.canvas;
  const noPackage = mesas.filter((m) => !m.package).length;

  return (
    <div className="space-y-10">
      <section aria-labelledby="paq-titulo">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="paq-titulo" className="font-display text-3xl font-semibold leading-none">2. Paquetes</h3>
            <p className="mt-1.5 max-w-2xl text-[15px] text-muted">Cada paquete es «personas + botella a un precio». Incluye las entradas: el comprador recibe un ticket con QR por persona.</p>
          </div>
          {!cancelled && editing === null && <button type="button" className="btn btn-primary !py-2 !text-sm" onClick={() => setEditing("new")}>Nuevo paquete</button>}
        </div>

        {editing === "new" && <div className="mt-4"><PackageForm onSave={savePackage} onCancel={() => setEditing(null)} /></div>}

        <ul className="mt-4 space-y-3">
          {packages.map((p) => (
            <li key={p.id} className="rounded-md border border-line bg-surface p-4">
              {editing === p.id ? (
                <PackageForm initial={p} locked={p.tables.length > 0} onSave={savePackage} onCancel={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-display text-xl font-semibold">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorOf.get(p.id) }} aria-hidden="true" />{p.name}
                    </p>
                    <p className="text-[14px] text-muted">
                      {plural(p.people, "persona", "personas")} · {fmtMoney(p.price)} (<span className="tabular-nums">{fmtMoney(p.unitPrice)}</span> c/u)
                      {p.bottleOptions.length > 0 ? ` · Botella: ${p.bottleOptions.join(" / ")}` : ""}
                    </p>
                    <p className="text-[13px] text-muted">{p.tables.length > 0 ? `En ${plural(p.tables.length, "mesa", "mesas")}: ${p.tables.map((t) => t.label).join(", ")}` : "Sin mesas asignadas todavía"}</p>
                  </div>
                  {!cancelled && (
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => setEditing(p.id)}>Editar</button>
                      {confirmDel === p.id ? (
                        <>
                          <button type="button" className="btn btn-quiet !py-1.5 !text-sm !text-bad" disabled={busy} onClick={() => removePackage(p)}>Confirmar</button>
                          <button type="button" className="btn btn-ghost !py-1.5 !text-sm" onClick={() => setConfirmDel(null)}>No</button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-ghost !py-1.5 !text-sm" onClick={() => setConfirmDel(p.id)}>Eliminar</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
          {packages.length === 0 && editing !== "new" && <li className="text-[15px] text-muted">Aún no hay paquetes. Crea el primero, por ejemplo «Mesa 6 + botella».</li>}
        </ul>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label className="field-label" htmlFor="vig">La mesa se guarda hasta las</label>
            <input id="vig" type="time" className="input !w-36" value={until} onChange={(e) => setUntil(e.target.value)} disabled={cancelled} />
          </div>
          <button type="button" className="btn btn-quiet !py-2 !text-sm" onClick={saveUntil} disabled={busy || cancelled || until === ev.tableValidUntil || !until}>Guardar</button>
          <p className="field-hint max-w-md">Pasada esa hora el voucher avisa que la mesa se libera para el local; los tickets siguen valiendo.</p>
        </div>
      </section>

      <section aria-labelledby="mesas-titulo">
        <h3 id="mesas-titulo" className="font-display text-3xl font-semibold leading-none">3. Paquete de cada mesa</h3>
        <p className="mt-1.5 max-w-2xl text-[15px] text-muted">
          Elige mesas en el plano (toca o arrastra un recuadro) y asígnales un paquete. El paquete debe tener tantas personas como asientos tiene la mesa. Las mesas sin paquete no se venden.
        </p>

        {mesas.length === 0 ? (
          <p className="mt-3 text-[15px] text-warn">El plano del local no tiene mesas con asientos. Dibújalas en el editor del venue y vuelve a generar los tickets.</p>
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
                  {levelMesas.map((m) => (map.seats.filter((s) => s.tableId === m.id).map((s) => (
                    <circle key={s.id} cx={s.x} cy={s.y} r="4" fill="#3A4757" pointerEvents="none" />
                  ))))}
                  {levelMesas.map((m) => {
                    const color = m.package ? colorOf.get(m.package.id) ?? "#8C97A6" : "#8C97A6";
                    const isSel = selected.has(m.id);
                    const sold = m.status === "OCUPADO";
                    return (
                      <g key={m.id} onPointerDown={(e) => { e.stopPropagation(); toggle(m); }} style={{ cursor: sold ? "not-allowed" : "pointer" }}>
                        <title>{`Mesa ${m.label} · ${m.seatIds.length} asientos${m.package ? ` · ${m.package.name}` : " · sin paquete"}${sold ? " · reservada o vendida" : ""}`}</title>
                        <circle cx={m.x} cy={m.y} r={TABLE_RADIUS + 6} fill={sold ? "#2A3441" : m.package ? `${color}33` : "transparent"} stroke={isSel ? "#FFFFFF" : color} strokeWidth={isSel ? 3 : 1.5} strokeDasharray={!m.package && !sold ? "3 3" : undefined} />
                        <text x={m.x} y={m.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="600" fill="#E9E6DD" pointerEvents="none">{m.label}</text>
                      </g>
                    );
                  })}
                  {band && <rect x={Math.min(band.x1, band.x2)} y={Math.min(band.y1, band.y2)} width={Math.abs(band.x2 - band.x1)} height={Math.abs(band.y2 - band.y1)} fill="#F0B93A22" stroke="#F0B93A" strokeDasharray="4 3" pointerEvents="none" />}
                </svg>
              </div>

              <aside className="space-y-4" aria-label="Asignar paquete">
                <div className="rounded-md border border-line bg-surface p-4">
                  <h4 className="font-display text-xl font-semibold">Mesas elegidas: {selected.size}</h4>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {level.sectors.filter((s) => levelMesas.some((m) => m.sectorId === s.id)).map((sec) => (
                      <button key={sec.id} type="button" className="btn btn-quiet !px-2.5 !py-1 !text-[13px]" onClick={() => selectSector(sec.id)}>Todas en «{sec.name}»</button>
                    ))}
                    {selected.size > 0 && <button type="button" className="btn btn-ghost !px-2.5 !py-1 !text-[13px]" onClick={() => setSelected(new Set())}>Limpiar</button>}
                  </div>
                  {!cancelled && (
                    <div className="mt-4 border-t border-line pt-4">
                      <label htmlFor="mesa-paq" className="field-label">Paquete</label>
                      <select id="mesa-paq" className="input" value={pkgId} onChange={(e) => setPkgId(e.target.value)}>
                        <option value="">Elige un paquete…</option>
                        {pkgChoices.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.people} pers. · {fmtMoney(p.price)}</option>)}
                      </select>
                      {packages.length === 0 && <p className="field-hint">Primero crea un paquete arriba.</p>}
                      {picked.length > 0 && packages.length > 0 && pkgChoices.length === 0 && (
                        <p className="mt-2 rounded border border-warn/40 bg-warn/10 px-3 py-2 text-[13px] text-warn">
                          Las mesas elegidas tienen {sizes.join(" o ")} asientos y ningún paquete es de ese tamaño. Crea uno con esa cantidad de personas.
                        </p>
                      )}
                      {pkg && picked.length > 0 && (
                        <p className="field-hint">
                          {plural(eligible.length, "mesa recibirá", "mesas recibirán")} «{pkg.name}».
                          {sameAlready > 0 && ` ${plural(sameAlready, "ya lo tiene", "ya lo tienen")}.`}
                          {mismatch > 0 && ` ${plural(mismatch, "tiene", "tienen")} otra cantidad de asientos y se ignoran.`}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn btn-primary !py-2 !text-sm" disabled={!pkg || eligible.length === 0 || busy} onClick={assign}>{busy ? "Guardando…" : `Asignar${eligible.length ? ` ${eligible.length}` : ""}`}</button>
                        <button type="button" className="btn btn-quiet !py-2 !text-sm" disabled={removable.length === 0 || busy} onClick={clear}>Quitar paquete{removable.length ? ` (${removable.length})` : ""}</button>
                      </div>
                    </div>
                  )}
                  {notice && <p role={notice.tone === "bad" ? "alert" : "status"} className={`mt-3 text-[13px] ${notice.tone === "bad" ? "text-bad" : "text-ok"}`}>{notice.text}</p>}
                </div>

                <div className="rounded-md border border-line bg-surface p-4">
                  <h4 className="font-display text-xl font-semibold">Leyenda</h4>
                  <ul className="mt-2 space-y-1.5 text-[14px]">
                    {packages.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: colorOf.get(p.id) }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span><span className="text-muted">{p.tables.length}</span>
                      </li>
                    ))}
                    <li className="flex items-center gap-2 text-muted"><span className="inline-block h-3 w-3 shrink-0 rounded-full border border-dashed border-muted" aria-hidden="true" /><span className="flex-1">Sin paquete (no se venden)</span><span>{noPackage}</span></li>
                    <li className="flex items-center gap-2 text-muted"><span className="inline-block h-3 w-3 shrink-0 rounded-full border border-line bg-line" aria-hidden="true" /><span className="flex-1">Reservadas o vendidas</span><span>{mesas.filter((m) => m.status === "OCUPADO").length}</span></li>
                  </ul>
                </div>
              </aside>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
