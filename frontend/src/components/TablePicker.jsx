import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { formatMoney } from "../lib/events";

// Plano para elegir mesa (modo mesas fijas). Cada mesa se compra completa con su paquete.
// Solo se pueden tocar las mesas LIBRES; las ocupadas no revelan quién las tiene.

const PALETTE = ["#F0B93A", "#6AA9E9", "#5DB98C", "#E5736F", "#B48EE0", "#7FD1C7", "#E2A04B", "#9DB36A"];
const ZOOMS = [100, 160, 240, 340];
const KIND_COLOR = { ESCENARIO: "#F0B93A", BARRA: "#6AA9E9", BANOS: "#7FD1C7", SALIDA_EMERGENCIA: "#5DB98C", OTRO: "#8C97A6" };
const pts = (p) => p.map((q) => `${q.x},${q.y}`).join(" ");
const center = (p) => {
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

export default function TablePicker({ eventId, selected, onChange, refreshKey = 0, disabled = false }) {
  const [map, setMap] = useState(null);
  const [error, setError] = useState("");
  const [levelId, setLevelId] = useState(null);
  const [zoom, setZoom] = useState(0);
  const [limitMsg, setLimitMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/events/${eventId}/seats`);
      setMap(data);
      setError("");
      setLevelId((cur) => cur ?? data.levels[0]?.id ?? null);
    } catch {
      setError("No pudimos cargar el plano de mesas.");
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  // Si el plano se refresca, suelta las mesas elegidas que ya no están libres
  useEffect(() => {
    if (!map || selected.length === 0) return;
    const free = new Set(map.mesas.filter((m) => m.status === "LIBRE").map((m) => m.id));
    const keep = selected.filter((m) => free.has(m.id));
    if (keep.length !== selected.length) onChange(keep);
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  const packages = useMemo(() => {
    const m = new Map();
    for (const t of map?.mesas ?? []) if (t.package && !m.has(t.package.id)) m.set(t.package.id, t.package);
    return [...m.values()].sort((a, b) => a.people - b.people || Number(a.price) - Number(b.price));
  }, [map]);
  const colorOf = useMemo(() => new Map(packages.map((p, i) => [p.id, PALETTE[i % PALETTE.length]])), [packages]);
  const sectorLevel = useMemo(() => new Map(map?.levels.flatMap((l) => l.sectors.map((s) => [s.id, l.id])) ?? []), [map]);
  const sectorName = useMemo(() => new Map(map?.levels.flatMap((l) => l.sectors.map((s) => [s.id, s.name])) ?? []), [map]);
  const level = map?.levels.find((l) => l.id === levelId) ?? map?.levels[0];
  const mesas = useMemo(() => map?.mesas.filter((m) => sectorLevel.get(m.sectorId) === level?.id) ?? [], [map, sectorLevel, level]);
  const seats = useMemo(() => map?.seats.filter((s) => sectorLevel.get(s.sectorId) === level?.id && s.tableId) ?? [], [map, sectorLevel, level]);
  const selectedIds = new Set(selected.map((m) => m.id));

  function toggle(m) {
    if (disabled || m.status !== "LIBRE") return;
    setLimitMsg("");
    if (selectedIds.has(m.id)) return onChange(selected.filter((x) => x.id !== m.id));
    if (selected.length >= (map.maxTablesPerOrder ?? 3)) {
      setLimitMsg(`Puedes reservar hasta ${map.maxTablesPerOrder ?? 3} mesas por compra.`);
      return;
    }
    onChange([...selected, {
      id: m.id, label: m.label, sectorName: sectorName.get(m.sectorId) ?? "",
      packageName: m.package.name, people: m.package.people, price: m.package.price, bottle: m.package.bottleOptions.join(" / "),
    }]);
  }

  if (error) {
    return <p role="alert" className="text-sm text-red-400">{error} <button type="button" onClick={load} className="underline">Reintentar</button></p>;
  }
  if (!map) return <p className="text-sm text-zinc-400">Cargando plano…</p>;
  if (!level) return null;
  const { width, height } = map.canvas;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {map.levels.length > 1 ? (
          <div role="tablist" aria-label="Nivel" className="inline-flex rounded-md border border-line p-0.5">
            {map.levels.map((l) => (
              <button key={l.id} type="button" role="tab" aria-selected={l.id === level.id} onClick={() => setLevelId(l.id)}
                className={`rounded px-3 py-1.5 text-sm font-medium ${l.id === level.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"}`}>{l.name}</button>
            ))}
          </div>
        ) : <span />}
        <div className="flex items-center gap-1.5" role="group" aria-label="Zoom del plano">
          <span className="mr-1 text-xs text-zinc-500">Zoom</span>
          {ZOOMS.map((z, i) => (
            <button key={z} type="button" aria-pressed={zoom === i} onClick={() => setZoom(i)}
              className={`rounded border px-2 py-1 text-xs ${zoom === i ? "border-brand text-white" : "border-line text-zinc-400 hover:text-white"}`}>{z}%</button>
          ))}
        </div>
      </div>

      <div className="mt-3 max-h-[70vh] overflow-auto rounded-lg border border-line bg-zinc-950">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: `${ZOOMS[zoom]}%`, minWidth: "100%", display: "block" }} role="group" aria-label={`Plano de mesas de ${level.name}`}>
          {level.elements.map((el) => (
            <g key={el.id} pointerEvents="none">
              <rect x={el.x} y={el.y} width={el.w} height={el.h} fill={`${KIND_COLOR[el.kind] ?? "#8C97A6"}22`} stroke={KIND_COLOR[el.kind] ?? "#8C97A6"} strokeDasharray="6 4" />
              <text x={el.x + el.w / 2} y={el.y + el.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize="14" fill="#E4E4E7">{el.name}</text>
            </g>
          ))}
          {level.sectors.map((sec) => {
            const poly = sec.points ?? (sec.w ? [{ x: sec.x, y: sec.y }, { x: sec.x + sec.w, y: sec.y }, { x: sec.x + sec.w, y: sec.y + sec.h }, { x: sec.x, y: sec.y + sec.h }] : null);
            if (!poly) return null;
            const c = center(poly);
            return (
              <g key={sec.id} pointerEvents="none">
                <polygon points={pts(poly)} fill={`${sec.color}14`} stroke={sec.color} strokeWidth="1.5" />
                <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="600" fill={sec.color} opacity="0.5">{sec.name}</text>
              </g>
            );
          })}
          {seats.map((s) => <circle key={s.id} cx={s.x} cy={s.y} r="4" fill="#3f3f46" pointerEvents="none" />)}
          {mesas.map((m) => {
            const free = m.status === "LIBRE";
            const isSel = selectedIds.has(m.id);
            const color = m.package ? colorOf.get(m.package.id) ?? "#a1a1aa" : "#52525b";
            if (m.status === "NO_VENTA") {
              return (
                <g key={m.id} pointerEvents="none" opacity="0.5">
                  <circle cx={m.x} cy={m.y} r="18" fill="transparent" stroke="#3f3f46" strokeDasharray="3 3" />
                  <text x={m.x} y={m.y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#71717a">{m.label}</text>
                </g>
              );
            }
            return (
              <g key={m.id} onClick={() => toggle(m)} style={{ cursor: free && !disabled ? "pointer" : "default" }}
                role={free ? "button" : undefined} tabIndex={free ? 0 : undefined} aria-pressed={free ? isSel : undefined}
                aria-label={free ? `Mesa ${m.label}, ${m.package.people} personas, ${formatMoney(m.package.price)}${isSel ? ", elegida" : ""}` : undefined}
                onKeyDown={(e) => { if (free && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(m); } }}>
                <title>{free ? `Mesa ${m.label} · ${m.package.name} · ${m.package.people} personas · ${formatMoney(m.package.price)}` : `Mesa ${m.label} · ocupada`}</title>
                <circle cx={m.x} cy={m.y} r="26" fill="transparent" />
                <circle cx={m.x} cy={m.y} r={isSel ? 20 : 18} fill={isSel ? "#ffffff" : free ? `${color}` : "#27272a"} stroke={isSel ? "#dc2626" : color} strokeWidth={isSel ? 4 : 1.5} />
                <text x={m.x} y={m.y} textAnchor="middle" dominantBaseline="middle" fontSize="12" fontWeight="700" fill={isSel ? "#18181b" : free ? "#18181b" : "#71717a"} pointerEvents="none">{m.label}</text>
                {!free && <path d={`M${m.x - 6},${m.y - 6} L${m.x + 6},${m.y + 6} M${m.x + 6},${m.y - 6} L${m.x - 6},${m.y + 6}`} stroke="#71717a" strokeWidth="1.5" pointerEvents="none" opacity="0.7" />}
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2" aria-label="Paquetes de mesa">
        {packages.map((p) => (
          <li key={p.id} className="flex items-start gap-2 rounded-lg border border-line p-3">
            <span className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: colorOf.get(p.id) }} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium text-white">{p.name} · {formatMoney(p.price)}</span>
              <span className="block text-xs text-zinc-400">
                {p.people} personas, con {p.people === 1 ? "su entrada" : "las entradas de cada una"}
                {p.bottleOptions.length > 0 ? ` y botella incluida (${p.bottleOptions.join(" / ")}, se elige en el local)` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400" aria-label="Leyenda">
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-brand bg-white" aria-hidden="true" />Tu elección</li>
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border border-zinc-600 bg-zinc-800" aria-hidden="true" />Ocupada</li>
      </ul>
      {limitMsg && <p role="alert" className="mt-2 text-sm text-amber-400">{limitMsg}</p>}
    </div>
  );
}
