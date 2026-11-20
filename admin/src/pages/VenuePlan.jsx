import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import Banner from "../components/Banner.jsx";
import PlanCanvas, { KIND_LABEL, TYPE_LABEL } from "../components/PlanCanvas.jsx";
import SeatingPanel, { initialGen, numericParams } from "../components/SeatingPanel.jsx";
import {
  allInside, generateRows, generateTables, nextRowNumber, nextTableLabel, seatLetters, seatingProblems, seatingStats, tableSeatPositions,
} from "../lib/seatingGeometry.js";
import {
  ELEMENT_PRESETS, clampRect, findConflicts, findInvalid, isValidShape, polygonBBox, rectAt, rectAtSize, rectToPolygon, snap,
} from "../lib/planGeometry.js";

const TYPE_OPTIONS = ["MESAS", "BUTACAS", "DE_PIE", "MIXTO"];
const VIEW_OPTIONS = ["LIBRE", "OBSTRUIDA", "PRIVILEGIADA"];
const KIND_OPTIONS = ["ESCENARIO", "BARRA", "BANOS", "SALIDA_EMERGENCIA", "OTRO"];
const VIEW_LABEL = { LIBRE: "Vista libre", OBSTRUIDA: "Vista obstruida", PRIVILEGIADA: "Vista privilegiada" };

export default function VenuePlan() {
  const { id } = useParams();
  const [layout, setLayout] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [levelId, setLevelId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // Cambios sin guardar: shapes[idSector] = { rect, points } (points = vértices si es un polígono,
  // null si es un bloque rectangular), o null para quitarlo del plano.
  // placeLevel[idSector] = nivel donde se ubicó un sector que aún no tenía nivel.
  const [shapes, setShapes] = useState({});
  // Atributos editados por sector (parciales), sectores nuevos (duplicados) y sectores a borrar
  const [attrs, setAttrs] = useState({});
  const [added, setAdded] = useState([]);
  const [deleted, setDeleted] = useState([]);
  const newSectorId = useRef(0);
  // Niveles: nombres editados, niveles nuevos ("newlvl-N"), niveles quitados y sectores movidos de nivel
  const [levelNames, setLevelNames] = useState({});
  const [addedLevels, setAddedLevels] = useState([]);
  const [removedLevels, setRemovedLevels] = useState([]);
  const [moveTo, setMoveTo] = useState({});
  const newLevelId = useRef(0);
  const [placeLevel, setPlaceLevel] = useState({});
  // Elementos de referencia editados, por nivel: elDraft[idNivel] = lista completa de ese nivel.
  // Los elementos nuevos llevan un id temporal "new-N" que no se envía al guardar.
  const [elDraft, setElDraft] = useState({});
  const newElId = useRef(0);
  // Forma que se está dibujando punto a punto: { sectorId, points } (o null)
  const [drawing, setDrawing] = useState(null);
  const [drawError, setDrawError] = useState("");
  const finishRef = useRef(null);
  // Modo "Mesas y asientos" de un sector: { sectorId, saved: { tables, rows } }. `gen` = generador con vista previa.
  const [seatMode, setSeatMode] = useState(null);
  const [gen, setGen] = useState(null);
  const [seatSaving, setSeatSaving] = useState(false);
  // Edición manual: `draft` es el estado editable (con una clave `k` por mesa y asiento), `seatSel` lo elegido,
  // `placing` = "table" | "seat" mientras un toque en el plano pone una pieza nueva
  const [draft, setDraft] = useState(null);
  const [seatDirty, setSeatDirty] = useState(false);
  const [seatSel, setSeatSel] = useState(null);
  const [placing, setPlacing] = useState(null);
  const [addTableSeats, setAddTableSeats] = useState("4");
  const [addRow, setAddRow] = useState("A");
  const newSeatKey = useRef(0);
  const [seatError, setSeatError] = useState("");
  // Mesas y asientos del sector seleccionado, para mirarlos en modo lectura
  const [viewSeating, setViewSeating] = useState(null);

  const load = useCallback(
    () =>
      api
        .get(`/venues/${id}/layout`)
        .then((r) => {
          setLayout(r.data);
          setLevelId((cur) => (r.data.levels.some((l) => l.id === cur) ? cur : r.data.levels[0]?.id ?? null));
        })
        .catch((e) => setError(errorMessage(e, "No se pudo cargar el plano."))),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setViewSeating(null);
    if (editing || !selectedId || !layout) return undefined;
    const s = layout.levels.flatMap((l) => l.sectors).find((x) => x.id === selectedId);
    if (!s || !s.seatCount) return undefined;
    let cancelled = false;
    api
      .get(`/venues/${id}/sectors/${selectedId}/seating`)
      .then((r) => { if (!cancelled) setViewSeating({ sectorId: selectedId, tables: r.data.tables, rows: r.data.rows }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, editing, layout, id]);

  // Atajos de la edición manual: Esc suelta lo elegido (o deja de poner piezas), Supr quita la pieza elegida
  const seatKeysRef = useRef(null);
  useEffect(() => {
    if (!seatMode) return undefined;
    function onKey(e) {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      seatKeysRef.current?.(e);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seatMode]);

  // El plano tal como se ve ahora: lo guardado + los cambios sin guardar
  const view = useMemo(() => {
    if (!layout) return null;
    const withShape = (s) => (s.id in shapes ? { ...s, rect: shapes[s.id]?.rect ?? null, points: shapes[s.id]?.points ?? null } : s);
    const edit = (s) => withShape(attrs[s.id] ? { ...s, ...attrs[s.id] } : s);
    const gone = new Set(deleted);
    const gonLevels = new Set(removedLevels);
    // Todos los sectores con el nivel al que pertenecen ahora (null = sin nivel)
    const source = [
      ...layout.levels.flatMap((l) => l.sectors.map((s) => ({ s, lvl: l.id }))),
      ...added.map((s) => ({ s, lvl: s.levelId })),
      ...layout.unassigned.map((s) => ({ s, lvl: null })),
    ]
      .filter(({ s }) => !gone.has(s.id))
      .map(({ s, lvl }) => ({ s: edit(s), lvl: moveTo[s.id] ?? lvl ?? (shapes[s.id] ? placeLevel[s.id] ?? null : null) }));
    const baseLevels = [
      ...layout.levels.filter((l) => !gonLevels.has(l.id)),
      ...addedLevels.map((l) => ({ ...l, elements: [], sectors: [] })),
    ];
    const levels = baseLevels.map((l) => ({
      ...l,
      name: levelNames[l.id] ?? l.name,
      elements: elDraft[l.id] ?? l.elements,
      sectors: source.filter((x) => x.lvl === l.id).map((x) => x.s),
    }));
    return { ...layout, levels, unassigned: source.filter((x) => !x.lvl || !levels.some((l) => l.id === x.lvl)).map((x) => x.s) };
  }, [layout, shapes, placeLevel, elDraft, attrs, added, deleted, levelNames, addedLevels, removedLevels, moveTo]);

  // Sectores en rojo: los que se pisan con otro del nivel o tienen una forma inválida
  const conflictsByLevel = useMemo(() => {
    const m = new Map();
    view?.levels.forEach((l) => m.set(l.id, new Set([...findConflicts(l.sectors), ...findInvalid(l.sectors, view.canvas)])));
    return m;
  }, [view]);

  // Atajos del dibujo: Enter cierra la forma, Esc cancela, Retroceso quita el último punto
  useEffect(() => {
    if (!drawing) return undefined;
    function onKey(e) {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "Enter") { e.preventDefault(); finishRef.current?.(); }
      else if (e.key === "Escape") { setDrawing(null); setDrawError(""); }
      else if (e.key === "Backspace") { e.preventDefault(); setDrawing((d) => (d ? { ...d, points: d.points.slice(0, -1) } : d)); setDrawError(""); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawing]);

  if (error) {
    return (
      <div className="space-y-4">
        <Banner tone="bad">{error}</Banner>
        <Link to="/locales" className="text-sm text-muted underline underline-offset-4 hover:text-ink">Volver a locales</Link>
      </div>
    );
  }
  if (!view) return <p className="text-muted">Cargando…</p>;

  const level = view.levels.find((l) => l.id === levelId) ?? view.levels[0];
  const all = [...view.levels.flatMap((l) => l.sectors), ...view.unassigned];
  const selected = all.find((s) => s.id === selectedId) ?? null;
  const selectedEl = level?.elements.find((e) => e.id === selectedId) ?? null;
  const elsewhere = editing && level
    ? view.levels.filter((l) => l.id !== level.id).flatMap((l) => l.sectors.map((s) => ({ ...s, levelName: l.name })))
    : [];
  const unplaced = [...(level ? level.sectors.filter((s) => !s.rect) : []), ...view.unassigned];
  const dirty = Object.keys(levelNames).length > 0 || addedLevels.length > 0 || removedLevels.length > 0 || Object.keys(moveTo).length > 0 || Object.keys(shapes).length > 0 || Object.keys(attrs).length > 0 || added.length > 0 || deleted.length > 0 || Object.keys(elDraft).length > 0;
  const hasConflicts = [...conflictsByLevel.values()].some((c) => c.size > 0);
  const badSector = all.some((s) => sectorProblem(s)) || view.levels.some((l) => levelProblem(l));
  const seatSector = seatMode ? all.find((s) => s.id === seatMode.sectorId) ?? null : null;
  let generated = null;
  if (seatMode && gen && seatSector?.rect) {
    const shape = seatSector.points ?? rectToPolygon(seatSector.rect);
    const np = numericParams(gen);
    generated = gen.kind === "MESAS" ? generateTables(shape, view.canvas, np) : generateRows(shape, view.canvas, np);
  }
  const seatShown = generated ?? (seatMode ? draft ?? seatMode.saved : null);
  const seatShapeNow = seatSector?.rect ? seatSector.points ?? rectToPolygon(seatSector.rect) : null;
  const fits = (pts) => !!seatShapeNow && allInside(pts, seatShapeNow, view.canvas);
  const editSeats = (fn) => { setDraft(fn); setSeatDirty(true); setSeatError(""); };

  function moveTable(k, x, y) {
    const t = draft?.tables.find((u) => u.k === k);
    if (!t || (x === t.x && y === t.y)) return;
    const dx = x - t.x;
    const dy = y - t.y;
    if (!fits([{ x, y }, ...t.seats.map((q) => ({ x: q.x + dx, y: q.y + dy }))])) return;
    editSeats((d) => ({ ...d, tables: d.tables.map((u) => (u.k === k ? { ...u, x, y, seats: u.seats.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })) } : u)) }));
  }
  function moveSeat(k, x, y) {
    if (!fits([{ x, y }])) return;
    editSeats((d) => ({
      tables: d.tables.map((t) => ({ ...t, seats: t.seats.map((q) => (q.k === k ? { ...q, x, y } : q)) })),
      rows: d.rows.map((r) => (r.k === k ? { ...r, x, y } : r)),
    }));
  }
  const mapSeat = (k, patch) =>
    editSeats((d) => ({
      tables: d.tables.map((t) => ({ ...t, seats: t.seats.map((q) => (q.k === k ? { ...q, ...patch } : q)) })),
      rows: d.rows.map((r) => (r.k === k ? { ...r, ...patch } : r)),
    }));
  function deleteSeat(k) {
    editSeats((d) => ({ tables: d.tables.map((t) => ({ ...t, seats: t.seats.filter((q) => q.k !== k) })), rows: d.rows.filter((r) => r.k !== k) }));
    setSeatSel(null);
  }
  function deleteTable(k) {
    editSeats((d) => ({ ...d, tables: d.tables.filter((t) => t.k !== k) }));
    setSeatSel(null);
  }
  function addSeatToTable(k) {
    const t = draft.tables.find((u) => u.k === k);
    if (!t || t.seats.length >= 24) return;
    const n = t.seats.length + 1;
    const pos = tableSeatPositions(t.x, t.y, n);
    if (!fits(pos)) { setSeatError("No cabe otro asiento alrededor de esa mesa dentro del sector."); return; }
    const used = new Set(t.seats.map((q) => q.label.toUpperCase()));
    const label = seatLetters(30).find((l) => !used.has(l));
    const seats = [...t.seats, { k: newKey(), label, x: 0, y: 0, active: true }].map((q, i) => ({ ...q, x: pos[i].x, y: pos[i].y }));
    editSeats((d) => ({ ...d, tables: d.tables.map((u) => (u.k === k ? { ...u, seats } : u)) }));
  }
  function setTableSeats(k, n) {
    const t = draft.tables.find((u) => u.k === k);
    const count = Math.max(1, Math.min(24, Math.round(Number(n)) || 1));
    if (!t || count === t.seats.length) return;
    const pos = tableSeatPositions(t.x, t.y, count);
    if (!fits(pos)) { setSeatError("No caben tantos asientos alrededor de esa mesa dentro del sector."); return; }
    const kept = t.seats.slice(0, count);
    const used = new Set(kept.map((q) => q.label.toUpperCase()));
    const spare = seatLetters(40).filter((l) => !used.has(l));
    const seats = Array.from({ length: count }, (_, i) => kept[i] ?? { k: newKey(), label: spare.shift(), active: true }).map((q, i) => ({ ...q, x: pos[i].x, y: pos[i].y }));
    editSeats((d) => ({ ...d, tables: d.tables.map((u) => (u.k === k ? { ...u, seats } : u)) }));
  }
  function placeAt(point) {
    if (!placing || !draft) return;
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (placing === "table") {
      const n = Math.max(1, Math.min(24, Math.round(Number(addTableSeats)) || 4));
      const pos = tableSeatPositions(x, y, n);
      if (!fits([{ x, y }, ...pos])) { setSeatError("No cabe ahí: toca más adentro del sector."); return; }
      const key = newKey();
      const label = nextTableLabel(draft.tables);
      editSeats((d) => ({ ...d, tables: [...d.tables, { k: key, label, x, y, seats: pos.map((q, i) => ({ k: newKey(), label: seatLetters(n)[i], x: q.x, y: q.y, active: true })) }] }));
      setSeatSel({ kind: "table", k: key });
    } else {
      if (!fits([{ x, y }])) { setSeatError("No cabe ahí: toca dentro del sector."); return; }
      const row = (addRow.trim() || "A").toUpperCase();
      const key = newKey();
      const label = nextRowNumber(draft.rows, row);
      editSeats((d) => ({ ...d, rows: [...d.rows, { k: key, rowLabel: row, label, x, y, active: true }] }));
      setSeatSel({ kind: "seat", k: key });
    }
  }
  seatKeysRef.current = (e) => {
    if (e.key === "Escape") { setPlacing(null); setSeatSel(null); }
    else if ((e.key === "Delete" || e.key === "Backspace") && seatSel && !gen) {
      e.preventDefault();
      if (seatSel.kind === "table") deleteTable(seatSel.k);
      else deleteSeat(seatSel.k);
    }
  };
  const selInfo = (() => {
    if (!seatSel || !draft) return null;
    if (seatSel.kind === "table") {
      const item = draft.tables.find((t) => t.k === seatSel.k);
      return item ? { kind: "table", item } : null;
    }
    for (const t of draft.tables) {
      const item = t.seats.find((q) => q.k === seatSel.k);
      if (item) return { kind: "seat", item, table: t };
    }
    const item = draft.rows.find((r) => r.k === seatSel.k);
    return item ? { kind: "seat", item, table: null } : null;
  })();
  const draftStats = seatingStats(draft ?? { tables: [], rows: [] });
  const draftProblems = draft ? [...seatingProblems(draft), ...(draftStats.problem ? [draftStats.problem] : [])] : [];
  const blankElement = view.levels.some((l) => l.elements.some((e) => e.name.trim() === ""));

  const setShape = (sectorId, shape) => setShapes((r) => ({ ...r, [sectorId]: shape }));
  const setRect = (sectorId, rect) => setShape(sectorId, { rect, points: null });

  const withKeys = (s) => ({
    tables: s.tables.map((t) => ({ ...t, k: t.id, seats: t.seats.map((q) => ({ ...q, k: q.id })) })),
    rows: s.rows.map((r) => ({ ...r, k: r.id })),
  });
  const newKey = () => `n-${(newSeatKey.current += 1)}`;

  async function enterSeating(sectorId) {
    setSeatError("");
    setGen(null);
    try {
      const r = await api.get(`/venues/${id}/sectors/${sectorId}/seating`);
      setSeatMode({ sectorId, saved: { tables: r.data.tables, rows: r.data.rows } });
      setDraft(withKeys(r.data));
      setSeatDirty(false);
      setSeatSel(null);
      setPlacing(null);
      setSelectedId(sectorId);
    } catch (e) {
      setSaveError(errorMessage(e, "No se pudieron cargar las mesas y asientos."));
    }
  }

  function exitSeating() {
    if (seatDirty && !window.confirm("Hay cambios sin guardar en las mesas y asientos. ¿Salir y descartarlos?")) return;
    setSeatMode(null);
    setGen(null);
    setSeatError("");
    setDraft(null);
    setSeatDirty(false);
    setSeatSel(null);
    setPlacing(null);
  }

  // Guarda en el servidor el estado completo de mesas y asientos del sector (lo que no llegue se borra)
  async function putSeating(shown) {
    setSeatSaving(true);
    setSeatError("");
    try {
      const body = {
        tables: shown.tables.map((t) => ({
          id: t.id, label: t.label.trim(), x: t.x, y: t.y,
          seats: t.seats.map((q) => ({ id: q.id, label: q.label.trim(), x: q.x, y: q.y, active: q.active })),
        })),
        rows: shown.rows.map((q) => ({ id: q.id, rowLabel: q.rowLabel.trim(), label: q.label.trim(), x: q.x, y: q.y, active: q.active })),
      };
      const r = await api.put(`/venues/${id}/sectors/${seatMode.sectorId}/seating`, body);
      await load();
      setSeatMode({ sectorId: seatMode.sectorId, saved: { tables: r.data.tables, rows: r.data.rows } });
      setDraft(withKeys(r.data));
      setSeatDirty(false);
      setSeatSel(null);
      setPlacing(null);
      setGen(null);
      setNotice(r.data.activeSeats > 0 ? `Mesas y asientos guardados. Aforo del sector: ${r.data.activeSeats}.` : "Mesas y asientos borrados. El aforo del sector se mantiene y vuelve a ser manual.");
    } catch (e) {
      setSeatError(errorMessage(e, "No se pudieron guardar las mesas y asientos."));
    } finally {
      setSeatSaving(false);
    }
  }

  // Un sector solo se puede ubicar en el nivel al que ya pertenece (o en cualquiera si aún no tiene)
  function canPlace(sectorId) {
    if (!level) return false;
    const owner = view.levels.find((l) => l.sectors.some((x) => x.id === sectorId));
    return !owner || owner.id === level.id;
  }

  function startDrawing(sectorId) {
    if (!canPlace(sectorId)) return;
    setDrawing({ sectorId, points: [] });
    setDrawError("");
    setSelectedId(sectorId);
  }

  function addDrawPoint(p) {
    setDrawing((d) => {
      if (!d || d.points.length >= 64) return d;
      const last = d.points[d.points.length - 1];
      return last && last.x === p.x && last.y === p.y ? d : { ...d, points: [...d.points, p] };
    });
    setDrawError("");
  }

  function finishDrawing() {
    if (!drawing) return;
    const { sectorId, points } = drawing;
    if (points.length < 3) { setDrawError("Marca al menos 3 puntos."); return; }
    if (!isValidShape(points, view.canvas)) {
      setDrawError("La forma no es válida: los lados no pueden cruzarse ni repetir puntos, y debe tener un tamaño mínimo.");
      return;
    }
    const owner = view.levels.find((l) => l.sectors.some((x) => x.id === sectorId));
    if (!owner && level) setPlaceLevel((p) => ({ ...p, [sectorId]: level.id }));
    setShape(sectorId, { rect: polygonBBox(points), points });
    setDrawing(null);
    setDrawError("");
  }
  finishRef.current = finishDrawing;

  const setAttr = (sectorId, patch) => setAttrs((a) => ({ ...a, [sectorId]: { ...a[sectorId], ...patch } }));

  // Problemas de un sector (nombre y aforo) que impiden guardar
  function sectorProblem(s) {
    const name = s.name.trim();
    if (name.length < 2) return "El nombre necesita al menos 2 letras.";
    if (all.some((o) => o.id !== s.id && o.name.trim().toLowerCase() === name.toLowerCase())) return "Ya hay otro sector con ese nombre.";
    if (!Number.isInteger(s.capacity) || s.capacity < 1 || s.capacity > 100000) return "El aforo debe ser un entero de 1 a 100000.";
    return "";
  }

  // Problemas del nombre de un nivel
  function levelProblem(l) {
    const name = l.name.trim();
    if (name.length < 2) return "El nombre necesita al menos 2 letras.";
    if (view.levels.some((o) => o.id !== l.id && o.name.trim().toLowerCase() === name.toLowerCase())) return "Ya hay otro nivel con ese nombre.";
    return "";
  }

  function addLevel() {
    if (view.levels.length >= 10) return;
    let n = view.levels.length + 1;
    while (view.levels.some((l) => l.name.toLowerCase() === `nivel ${n}`)) n += 1;
    const id = `newlvl-${(newLevelId.current += 1)}`;
    setAddedLevels((a) => [...a, { id, name: `Nivel ${n}`, position: 0 }]);
    setLevelId(id);
    setSelectedId(null);
  }

  // Un nivel solo se quita si no tiene sectores (los elementos de referencia se borran con él)
  function removeLevel(l) {
    if (l.sectors.length > 0 || view.levels.length <= 1) return;
    if (l.elements.length > 0 && !window.confirm(`El nivel «${l.name}» tiene ${l.elements.length} elemento(s) de referencia que se borrarán al guardar. ¿Continuar?`)) return;
    if (l.id.startsWith("newlvl-")) setAddedLevels((a) => a.filter((x) => x.id !== l.id));
    else setRemovedLevels((r) => [...r, l.id]);
    setLevelNames((n) => { const c = { ...n }; delete c[l.id]; return c; });
    setElDraft((d) => { const c = { ...d }; delete c[l.id]; return c; });
    setLevelId(view.levels.find((x) => x.id !== l.id)?.id ?? null);
    setSelectedId(null);
  }

  function moveSector(sectorId, targetId) {
    setMoveTo((m) => ({ ...m, [sectorId]: targetId }));
    setLevelId(targetId);
  }

  // Copia de un sector (misma forma y atributos, nombre nuevo) un poco desplazada; queda en el mismo nivel
  function duplicate(sectorId) {
    const src = all.find((x) => x.id === sectorId);
    if (!src?.rect || !level) return;
    let n = 2;
    const base = src.name.replace(/ \d+$/, "");
    while (all.some((o) => o.name.trim().toLowerCase() === `${base} ${n}`.toLowerCase())) n += 1;
    const box = src.rect;
    const dx = Math.min(40, view.canvas.width - box.x - box.w);
    const dy = Math.min(40, view.canvas.height - box.y - box.h);
    const id = `new-${(newSectorId.current += 1)}`;
    const copy = {
      id, name: `${base} ${n}`, capacity: src.capacity, type: src.type, view: src.view, accessible: src.accessible,
      sellable: src.sellable, color: src.color, buyerText: src.buyerText ?? null, inUse: false, levelId: level.id,
      rect: { ...box, x: box.x + dx, y: box.y + dy },
      points: src.points ? src.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) : null,
    };
    setAdded((a) => [...a, copy]);
    setSelectedId(id);
  }

  // Borra un sector: si es una copia nueva basta con descartarla; si existe, se borra al guardar
  function removeSector(sectorId) {
    if (sectorId.startsWith("new-")) {
      setAdded((a) => a.filter((x) => x.id !== sectorId));
    } else {
      setDeleted((d) => [...d, sectorId]);
    }
    setShapes((r) => { const n = { ...r }; delete n[sectorId]; return n; });
    setAttrs((r) => { const n = { ...r }; delete n[sectorId]; return n; });
    setSelectedId(null);
  }

  // Pasa un bloque rectangular a polígono (4 vértices) para poder recortarle pasillos
  function toPolygon(sectorId) {
    const s = all.find((x) => x.id === sectorId);
    if (s?.rect) setShape(sectorId, { rect: s.rect, points: rectToPolygon(s.rect) });
  }

  // Cambia la lista de elementos del nivel actual
  function editElements(fn) {
    if (!level) return;
    setElDraft((d) => ({ ...d, [level.id]: fn(d[level.id] ?? layout.levels.find((l) => l.id === level.id)?.elements ?? []) }));
  }

  const patchElement = (elId, patch) => editElements((els) => els.map((x) => (x.id === elId ? { ...x, ...patch } : x)));

  // Copia de un elemento, un poco desplazada, en el mismo nivel
  function duplicateElement(elId) {
    const src = level?.elements.find((x) => x.id === elId);
    if (!src) return;
    const r = src.rect;
    const dx = Math.min(40, view.canvas.width - r.x - r.w);
    const dy = Math.min(40, view.canvas.height - r.y - r.h);
    const id = `new-${(newElId.current += 1)}`;
    editElements((els) => [...els, { ...src, id, rect: { ...r, x: r.x + dx, y: r.y + dy } }]);
    setSelectedId(id);
  }

  function addElement(preset, rect) {
    const id = `new-${(newElId.current += 1)}`;
    editElements((els) => [...els, { id, kind: preset.kind, name: preset.name, rect }]);
    setSelectedId(id);
  }

  // Soltar en el lienzo: "el:CLAVE" es un elemento de la paleta; cualquier otra cosa es el id de un sector
  function handleDrop(payload, point) {
    if (payload.startsWith("el:")) {
      const preset = ELEMENT_PRESETS.find((p) => p.key === payload.slice(3));
      if (preset) addElement(preset, rectAtSize(point, preset.w, preset.h, view.canvas));
      return;
    }
    dropSector(payload, rectAt(point, view.canvas));
  }

  function dropSector(sectorId, rect) {
    const s = all.find((x) => x.id === sectorId);
    if (!s || !level) return;
    const owner = view.levels.find((l) => l.sectors.some((x) => x.id === sectorId));
    if (!owner) setPlaceLevel((p) => ({ ...p, [sectorId]: level.id }));
    if (owner && owner.id !== level.id) {
      // viene de otro nivel: pasa a este conservando su forma, centrada donde se soltó
      setMoveTo((m) => ({ ...m, [sectorId]: level.id }));
      if (s.rect) {
        const box = s.rect;
        const nx = Math.min(Math.max(snap(rect.x + rect.w / 2 - box.w / 2), 0), view.canvas.width - box.w);
        const ny = Math.min(Math.max(snap(rect.y + rect.h / 2 - box.h / 2), 0), view.canvas.height - box.h);
        const dx = nx - box.x;
        const dy = ny - box.y;
        setShape(sectorId, {
          rect: { ...box, x: nx, y: ny },
          points: s.points ? s.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) : null,
        });
        setSelectedId(sectorId);
        return;
      }
    }
    setRect(sectorId, rect);
    setSelectedId(sectorId);
  }

  function removeFromPlan(sectorId) {
    const original = layout.levels.flatMap((l) => l.sectors).find((s) => s.id === sectorId);
    if (sectorId.startsWith("new-")) {
      setShape(sectorId, null);
    } else if (original?.rect === null) {
      // nunca estuvo ubicado: basta con descartar el cambio
      setShapes((r) => { const n = { ...r }; delete n[sectorId]; return n; });
    } else if (!original) {
      setShapes((r) => { const n = { ...r }; delete n[sectorId]; return n; });
      setPlaceLevel((p) => { const n = { ...p }; delete n[sectorId]; return n; });
    } else {
      setShape(sectorId, null);
    }
  }

  function cancelEdit() {
    setShapes({}); setAttrs({}); setAdded([]); setDeleted([]); setPlaceLevel({}); setElDraft({}); setEditing(false); setSaveError(""); setSelectedId(null);
    setLevelNames({}); setAddedLevels([]); setRemovedLevels([]); setMoveTo({});
    setDrawing(null); setDrawError("");
  }

  async function save() {
    setSaving(true); setSaveError("");
    try {
      const body = {
        levels: view.levels.map((l) => ({
          id: l.id.startsWith("newlvl-") ? undefined : l.id,
          name: l.name.trim(),
          sectors: l.sectors.map((s) => ({
            id: s.id.startsWith("new-") ? undefined : s.id, name: s.name, capacity: s.capacity, type: s.type, view: s.view,
            accessible: s.accessible, sellable: s.sellable, color: s.color,
            buyerText: s.buyerText ?? undefined,
            ...(s.points ? { points: s.points } : { rect: s.rect ?? undefined }),
          })),
          elements: l.elements.map((e) => ({
            id: e.id.startsWith("new-") ? undefined : e.id,
            kind: e.kind, name: e.name, rect: e.rect,
          })),
        })),
        ...(deleted.length > 0 ? { deleteSectorIds: deleted } : {}),
      };
      await api.put(`/venues/${id}/layout`, body);
      await load();
      setShapes({}); setAttrs({}); setAdded([]); setDeleted([]); setPlaceLevel({}); setElDraft({}); setEditing(false); setDrawing(null);
      setLevelNames({}); setAddedLevels([]); setRemovedLevels([]); setMoveTo({});
      setNotice("Plano guardado.");
    } catch (e) {
      setSaveError(errorMessage(e, "No se pudo guardar el plano."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to="/locales" className="text-sm text-muted underline underline-offset-4 hover:text-ink">← Locales</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl font-semibold leading-none">{view.venue.name}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted">Aforo vendible <span className="font-medium text-ink">{view.totalCapacity}</span></p>
          {!editing ? (
            <button type="button" className="btn btn-primary" onClick={() => { setEditing(true); setNotice(""); }}>Editar plano</button>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || hasConflicts || blankElement || badSector || saving || !!drawing || !!seatMode}>
                {saving ? "Guardando…" : "Guardar plano"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={cancelEdit} disabled={saving || !!seatMode}>Cancelar</button>
            </>
          )}
        </div>
      </div>
      <p className="mt-3 max-w-xl text-[15px] text-muted">
        {editing
          ? "Arrastra sectores y elementos de referencia al plano. Muévelos arrastrándolos y cambia su tamaño con las esquinas. Para pasillos o formas irregulares, usa «Dibujar forma» en el sector."
          : "Plano del local: así están ubicados los sectores en cada nivel."}
      </p>

      <div className="mt-4 space-y-3">
        {notice && <Banner onClose={() => setNotice("")}>{notice}</Banner>}
        {saveError && <Banner tone="bad" onClose={() => setSaveError("")}>{saveError}</Banner>}
        {editing && hasConflicts && <Banner tone="bad">Hay sectores que se pisan o con forma inválida (en rojo). Corrígelos para poder guardar.</Banner>}
        {drawing && (
          <Banner>
            Dibujando la forma de «{all.find((x) => x.id === drawing.sectorId)?.name}»: toca el plano para marcar cada esquina ({drawing.points.length} punto{drawing.points.length === 1 ? "" : "s"}).
            Cierra tocando el primer punto o con Enter · Retroceso quita el último · Esc cancela.
          </Banner>
        )}
        {drawing && drawError && <Banner tone="bad" onClose={() => setDrawError("")}>{drawError}</Banner>}
      </div>

      {(view.levels.length > 1 || editing) && (
        <div role="tablist" aria-label="Niveles" className="mt-6 flex flex-wrap items-center gap-2">
          {view.levels.map((l) => (
            <button
              key={l.id} type="button" role="tab" aria-selected={l.id === level?.id}
              onClick={() => { setLevelId(l.id); setSelectedId(null); setDrawing(null); setDrawError(""); exitSeating(); }}
              className={`btn !py-1.5 !text-sm ${l.id === level?.id ? "btn-primary" : "btn-quiet"}`}
            >
              {l.name || "Sin nombre"}
            </button>
          ))}
          {editing && view.levels.length < 10 && (
            <button type="button" className="btn btn-ghost !py-1.5 !text-sm" onClick={addLevel} disabled={!!drawing || !!seatMode}>+ Nivel</button>
          )}
        </div>
      )}

      {level && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* El lienzo usa el ancho disponible, pero sin pasarse del alto de la ventana (conserva su proporción) */}
          <div
            className="mx-auto w-full"
            style={{ maxWidth: `max(480px, calc((100vh - 7rem) * ${view.canvas.width / view.canvas.height}))` }}
          >
            <PlanCanvas
              canvas={view.canvas}
              level={level}
              selectedId={selectedId}
              onSelect={seatMode ? () => setSeatSel(null) : setSelectedId}
              editable={editing}
              conflicts={conflictsByLevel.get(level.id)}
              onChangeRect={setRect}
              onChangeShape={setShape}
              drawing={drawing}
              onDrawPoint={addDrawPoint}
              onDrawClose={finishDrawing}
              onChangeElementRect={(id, rect) => editElements((els) => els.map((e) => (e.id === id ? { ...e, rect } : e)))}
              onDrop={handleDrop}
              locked={!!seatMode}
              seatEdit={!!seatMode && !gen}
              seatSelected={seatSel}
              onSeatSelect={setSeatSel}
              onSeatMove={(kind, k, x, y) => (kind === "table" ? moveTable(k, x, y) : moveSeat(k, x, y))}
              placing={!!seatMode && !gen && !!placing}
              onPlace={placeAt}
              seating={seatShown ?? (viewSeating && viewSeating.sectorId === selectedId ? viewSeating : null)}
              focusRect={seatMode ? seatSector?.rect ?? null : null}
            />
            {!editing && level.sectors.every((s) => !s.rect) && level.elements.length === 0 && (
              <p className="mt-3 text-[15px] text-muted">Este nivel todavía no tiene nada dibujado.</p>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
            {seatMode && seatSector && (
              <SeatingPanel
                sector={seatSector}
                savedStats={seatingStats(seatMode.saved)}
                gen={gen}
                setGen={setGen}
                stats={seatingStats(seatShown ?? { tables: [], rows: [] })}
                saving={seatSaving}
                error={seatError}
                onGenerate={(kind) => {
                  if (seatDirty && !window.confirm("Generar reemplaza las mesas y asientos y descarta tus cambios manuales sin guardar. ¿Continuar?")) return;
                  setPlacing(null);
                  setGen(initialGen(kind));
                }}
                manual={{
                  draft, dirty: seatDirty, sel: selInfo, placing, setPlacing, addTableSeats, setAddTableSeats, addRow, setAddRow,
                  stats: draftStats, problems: draftProblems,
                  onRenameTable: (k, label) => editSeats((d) => ({ ...d, tables: d.tables.map((t) => (t.k === k ? { ...t, label } : t)) })),
                  onRenameSeat: (k, label) => mapSeat(k, { label }),
                  onRenameRow: (k, rowLabel) => mapSeat(k, { rowLabel }),
                  onToggleSeat: (k) => { const cur = selInfo?.item; mapSeat(k, { active: !cur?.active }); },
                  onDeleteSeat: deleteSeat,
                  onDeleteTable: deleteTable,
                  onAddSeatToTable: addSeatToTable,
                  onSetTableSeats: setTableSeats,
                  onSaveDraft: () => draft && putSeating(draft),
                  onDiscard: () => { setDraft(withKeys(seatMode.saved)); setSeatDirty(false); setSeatSel(null); setPlacing(null); setSeatError(""); },
                }}
                onSave={() => generated && putSeating(generated)}
                onClear={() => { if (window.confirm(`¿Borrar todas las mesas y asientos de «${seatSector.name}»?`)) putSeating({ tables: [], rows: [] }); }}
                onExit={exitSeating}
              />
            )}
            <div className={seatMode ? "hidden" : "space-y-4"}>
            {editing && (
              <section className="rounded-lg border border-line bg-surface p-4" aria-label="Nivel actual">
                <h2 className="font-display text-xl font-semibold">Nivel</h2>
                <label htmlFor="level-name" className="field-label mt-3">Nombre del nivel</label>
                <input
                  id="level-name" className="input" maxLength={40} value={level.name}
                  onChange={(e) => setLevelNames((n) => ({ ...n, [level.id]: e.target.value }))}
                />
                {levelProblem(level) && <p className="field-error">{levelProblem(level)}</p>}
                <button
                  type="button" className="btn btn-quiet mt-3 !py-1.5 !text-sm"
                  onClick={() => removeLevel(level)} disabled={level.sectors.length > 0 || view.levels.length <= 1}
                >
                  Quitar nivel
                </button>
                {level.sectors.length > 0 && <p className="mt-2 text-[13px] text-muted">Para quitar este nivel, primero mueve o borra sus sectores.</p>}
              </section>
            )}
            <section className="rounded-lg border border-line bg-surface p-4" aria-label="Sector seleccionado">
              <h2 className="font-display text-xl font-semibold">Sector</h2>
              {selected ? (
                <>
                  {editing && !view.unassigned.some((u) => u.id === selected.id) ? (
                    <SectorForm
                      sector={selected}
                      levels={view.levels}
                      levelId={view.levels.find((l) => l.sectors.some((x) => x.id === selected.id))?.id ?? ""}
                      onMove={(target) => moveSector(selected.id, target)}
                      problem={sectorProblem(selected)}
                      capacityLocked={(selected.seatCount ?? 0) > 0}
                      onChange={(patch) => setAttr(selected.id, patch)}
                    />
                  ) : (
                  <dl className="mt-3 space-y-1.5 text-[14px]">
                    <div className="flex justify-between gap-3"><dt className="text-muted">Nombre</dt><dd className="font-medium">{selected.name}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Tipo</dt><dd>{TYPE_LABEL[selected.type]}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Aforo</dt><dd>{selected.capacity}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Vista</dt><dd>{VIEW_LABEL[selected.view]}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Accesible</dt><dd>{selected.accessible ? "Sí" : "No"}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-muted">Vendible</dt><dd>{selected.sellable ? "Sí" : "No"}</dd></div>
                    {selected.buyerText && <p className="pt-2 text-muted">{selected.buyerText}</p>}
                  </dl>
                  )}
                  {editing && view.unassigned.some((u) => u.id === selected.id) && (
                    <p className="mt-3 text-[13px] text-muted">Ubícalo en un nivel (arrástralo al plano o dibuja su forma) para poder editar sus datos.</p>
                  )}
                  {editing && drawing?.sectorId === selected.id && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-primary !py-1.5 !text-sm" onClick={finishDrawing}>Cerrar forma</button>
                      <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => { setDrawing(null); setDrawError(""); }}>Cancelar dibujo</button>
                    </div>
                  )}
                  {editing && !drawing && canPlace(selected.id) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => startDrawing(selected.id)}>
                        {selected.rect ? "Redibujar forma" : "Dibujar forma"}
                      </button>
                      {selected.rect && !selected.points && (
                        <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => toPolygon(selected.id)}>
                          Convertir en polígono
                        </button>
                      )}
                      {selected.rect && !selected.id.startsWith("new-") && selected.type !== "DE_PIE" && (
                        <button
                          type="button" className="btn btn-quiet !py-1.5 !text-sm" disabled={dirty}
                          title={dirty ? "Guarda el plano antes de editar las mesas y asientos" : undefined}
                          onClick={() => enterSeating(selected.id)}
                        >
                          Mesas y asientos
                        </button>
                      )}
                      {selected.rect && (
                        <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => duplicate(selected.id)}>
                          Duplicar
                        </button>
                      )}
                      {selected.rect && (
                        <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => removeFromPlan(selected.id)}>
                          Quitar del plano
                        </button>
                      )}
                      {!selected.inUse && !view.unassigned.some((u) => u.id === selected.id) && (
                        <button
                          type="button" className="btn btn-quiet !py-1.5 !text-sm !text-bad"
                          onClick={() => {
                            if (selected.id.startsWith("new-") || window.confirm(`¿Borrar el sector «${selected.name}»? Se borra al guardar el plano.`)) removeSector(selected.id);
                          }}
                        >
                          Borrar sector
                        </button>
                      )}
                    </div>
                  )}
                  {editing && selected.inUse && (
                    <p className="mt-3 text-[13px] text-muted">Este sector ya tiene tiers o tickets: no se puede borrar ni sacar de la venta, y su aforo no puede bajar de lo ya generado.</p>
                  )}
                  {editing && !drawing && dirty && selected.rect && !selected.id.startsWith("new-") && selected.type !== "DE_PIE" && (
                    <p className="mt-3 text-[13px] text-muted">Para editar las mesas y asientos, primero guarda el plano.</p>
                  )}
                  {editing && !drawing && selected.points && (
                    <p className="mt-3 text-[13px] text-muted">Arrastra los vértices para dar forma; toca un punto medio para agregar uno y haz doble toque en un vértice para quitarlo.</p>
                  )}
                </>
              ) : (
                <p className="mt-2 text-[14px] text-muted">Toca un bloque del plano para ver sus datos.</p>
              )}
            </section>

            {editing && (
              <section className="rounded-lg border border-line bg-surface p-4" aria-label="Elementos de referencia">
                <h2 className="font-display text-xl font-semibold">Elementos</h2>
                <p className="mt-1 text-[13px] text-muted">Dibujos de referencia: no cuentan en el aforo. Arrástralos al plano o tócalos para agregarlos al centro.</p>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                  {ELEMENT_PRESETS.map((p) => (
                    <li key={p.key}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", `el:${p.key}`); e.dataTransfer.effectAllowed = "copy"; }}
                        onClick={() => addElement(p, rectAtSize({ x: view.canvas.width / 2, y: view.canvas.height / 2 }, p.w, p.h, view.canvas))}
                        className="btn btn-quiet w-full cursor-grab !px-2 !py-1.5 !text-[13px]"
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
                {selectedEl && (
                  <div className="mt-4 space-y-3 border-t border-line pt-4 text-[14px]">
                    <div>
                      <label htmlFor="el-name" className="field-label">Nombre del elemento</label>
                      <input
                        id="el-name" className="input" maxLength={60} value={selectedEl.name}
                        onChange={(e) => patchElement(selectedEl.id, { name: e.target.value })}
                      />
                      {selectedEl.name.trim() === "" && <p className="field-error">Escribe un nombre.</p>}
                    </div>
                    <div>
                      <label htmlFor="el-kind" className="field-label">Tipo</label>
                      <select id="el-kind" className="input" value={selectedEl.kind} onChange={(e) => patchElement(selectedEl.id, { kind: e.target.value })}>
                        {KIND_OPTIONS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[["x", "Posición X"], ["y", "Posición Y"], ["w", "Ancho"], ["h", "Alto"]].map(([key, label]) => (
                        <div key={`${selectedEl.id}-${key}-${selectedEl.rect[key]}`}>
                          <label htmlFor={`el-${key}`} className="field-label">{label}</label>
                          <input
                            id={`el-${key}`} className="input" type="number" step="20" defaultValue={selectedEl.rect[key]}
                            onBlur={(e) => {
                              const n = Math.round(Number(e.target.value));
                              if (Number.isFinite(n)) patchElement(selectedEl.id, { rect: clampRect({ ...selectedEl.rect, [key]: n }, view.canvas) });
                              else e.target.value = selectedEl.rect[key];
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => duplicateElement(selectedEl.id)}>Duplicar</button>
                      <button
                        type="button" className="btn btn-quiet !py-1.5 !text-sm"
                        onClick={() => { editElements((els) => els.filter((x) => x.id !== selectedEl.id)); setSelectedId(null); }}
                      >
                        Quitar del plano
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {elsewhere.length > 0 && (
              <section className="rounded-lg border border-line bg-surface p-4" aria-label="Sectores de otros niveles">
                <h2 className="font-display text-xl font-semibold">De otros niveles</h2>
                <p className="mt-1 text-[13px] text-muted">Arrástralos a este plano para pasarlos a «{level.name}», o usa «Traer aquí».</p>
                <ul className="mt-3 space-y-1">
                  {elsewhere.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <button
                        type="button" draggable
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", s.id); e.dataTransfer.effectAllowed = "move"; }}
                        onClick={() => setSelectedId(s.id)}
                        className={`flex min-w-0 flex-1 cursor-grab justify-between gap-3 rounded px-2 py-1.5 text-left text-[14px] hover:bg-raised ${s.id === selectedId ? "bg-raised" : ""}`}
                      >
                        <span className="truncate">{s.name}</span><span className="shrink-0 text-muted">{s.levelName}</span>
                      </button>
                      <button type="button" className="btn btn-quiet !px-2 !py-1 !text-[12px]" onClick={() => moveSector(s.id, level.id)}>Traer aquí</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {unplaced.length > 0 && (
              <section className="rounded-lg border border-line bg-surface p-4" aria-label="Sectores sin ubicar">
                <h2 className="font-display text-xl font-semibold">Sin ubicar</h2>
                <p className="mt-1 text-[13px] text-muted">
                  {editing ? "Arrástralos al plano." : "Existen pero aún no tienen lugar en el plano."}
                </p>
                <ul className="mt-3 space-y-1">
                  {unplaced.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        draggable={editing}
                        onDragStart={editing ? (e) => { e.dataTransfer.setData("text/plain", s.id); e.dataTransfer.effectAllowed = "move"; } : undefined}
                        onClick={() => setSelectedId(s.id)}
                        className={`flex w-full justify-between gap-3 rounded px-2 py-1.5 text-left text-[14px] hover:bg-raised ${editing ? "cursor-grab" : ""} ${s.id === selectedId ? "bg-raised" : ""}`}
                      >
                        <span>{s.name}</span><span className="text-muted">{s.capacity}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

// Formulario de los atributos de un sector (modo edición)
function SectorForm({ sector, problem, onChange, levels, levelId, onMove, capacityLocked }) {
  const id = `sec-${sector.id}`;
  return (
    <div className="mt-3 space-y-3 text-[14px]">
      <div>
        <label htmlFor={`${id}-name`} className="field-label">Nombre</label>
        <input id={`${id}-name`} className="input" maxLength={60} value={sector.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-cap`} className="field-label">Aforo</label>
          <input
            id={`${id}-cap`} className="input" type="number" min="1" max="100000" value={Number.isNaN(sector.capacity) ? "" : sector.capacity}
            disabled={capacityLocked} title={capacityLocked ? "Lo calculan los asientos del sector" : undefined}
            onChange={(e) => onChange({ capacity: e.target.value === "" ? NaN : Number(e.target.value) })}
          />
        </div>
        <div>
          <label htmlFor={`${id}-color`} className="field-label">Color</label>
          <input id={`${id}-color`} className="input !p-1" type="color" value={sector.color} onChange={(e) => onChange({ color: e.target.value.toUpperCase() })} />
        </div>
      </div>
      {problem && <p className="field-error">{problem}</p>}
      {levels.length > 1 && levelId && (
        <div>
          <label htmlFor={`${id}-level`} className="field-label">Nivel</label>
          <select id={`${id}-level`} className="input" value={levelId} onChange={(e) => onMove(e.target.value)}>
            {levels.map((l) => <option key={l.id} value={l.id}>{l.name || "Sin nombre"}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-type`} className="field-label">Tipo</label>
          <select id={`${id}-type`} className="input" value={sector.type} onChange={(e) => onChange({ type: e.target.value })}>
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-view`} className="field-label">Vista</label>
          <select id={`${id}-view`} className="input" value={sector.view} onChange={(e) => onChange({ view: e.target.value })}>
            {VIEW_OPTIONS.map((v) => <option key={v} value={v}>{VIEW_LABEL[v]}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={sector.accessible} onChange={(e) => onChange({ accessible: e.target.checked })} /> Accesible
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox" checked={sector.sellable} disabled={sector.inUse && sector.sellable}
          onChange={(e) => onChange({ sellable: e.target.checked })}
        /> Vendible (cuenta en el aforo)
      </label>
      <div>
        <label htmlFor={`${id}-txt`} className="field-label">Texto para el comprador</label>
        <textarea
          id={`${id}-txt`} className="input" rows={2} maxLength={500} value={sector.buyerText ?? ""}
          onChange={(e) => onChange({ buyerText: e.target.value })}
        />
      </div>
    </div>
  );
}
