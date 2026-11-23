import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { formatMoney } from "../lib/events";

// Plano de asientos para elegir lugar. Solo se pueden tocar los asientos LIBRES;
// los ocupados no revelan quién los tiene. El servidor valida de nuevo al comprar.

const PALETTE = ["#F0B93A", "#6AA9E9", "#5DB98C", "#E5736F", "#B48EE0", "#7FD1C7", "#E2A04B", "#9DB36A"];
const ZOOMS = [100, 160, 240, 340];
const KIND_COLOR = { ESCENARIO: "#F0B93A", BARRA: "#6AA9E9", BANOS: "#7FD1C7", SALIDA_EMERGENCIA: "#5DB98C", OTRO: "#8C97A6" };
const pts = (p) => p.map((q) => `${q.x},${q.y}`).join(" ");
const center = (p) => {
  const xs = p.map((q) => q.x), ys = p.map((q) => q.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

export const seatName = (s) => (s.tableLabel ? `Mesa ${s.tableLabel} · ${s.label}` : s.rowLabel ? `Fila ${s.rowLabel} · ${s.label}` : s.label);

export default function SeatPicker({ eventId, selected, onChange, refreshKey = 0, disabled = false }) {
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
      setError("No pudimos cargar el plano de asientos.");
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Si el plano se refresca, suelta los asientos elegidos que ya no están libres
  useEffect(() => {
    if (!map || selected.length === 0) return;
    const free = new Set(map.seats.filter((s) => s.status === "LIBRE").map((s) => s.id));
    const keep = selected.filter((s) => free.has(s.id));
    if (keep.length !== selected.length) onChange(keep);
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  const colorOf = useMemo(() => {
    const m = new Map();
    (map?.tiers ?? []).forEach((t, i) => m.set(t.id, PALETTE[i % PALETTE.length]));
    return m;
  }, [map]);
  const sectorLevel = useMemo(() => new Map(map?.levels.flatMap((l) => l.sectors.map((s) => [s.id, l.id])) ?? []), [map]);
  const level = map?.levels.find((l) => l.id === levelId) ?? map?.levels[0];
  const seats = useMemo(() => map?.seats.filter((s) => sectorLevel.get(s.sectorId) === level?.id) ?? [], [map, sectorLevel, level]);
  const tables = useMemo(() => map?.tables.filter((t) => sectorLevel.get(t.sectorId) === level?.id) ?? [], [map, sectorLevel, level]);
  const selectedIds = new Set(selected.map((s) => s.id));

  function toggle(seat) {
    if (disabled || seat.status !== "LIBRE") return;
    setLimitMsg("");
    if (selectedIds.has(seat.id)) return onChange(selected.filter((s) => s.id !== seat.id));
    if (selected.length >= map.maxSeatsPerOrder) {
      setLimitMsg(`Puedes elegir hasta ${map.maxSeatsPerOrder} asientos por compra.`);
      return;
    }
    onChange([...selected, { id: seat.id, label: seatName(seat), price: seat.price, tierId: seat.tierId, sectorId: seat.sectorId }]);
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-red-400">
        {error} <button type="button" onClick={load} className="underline">Reintentar</button>
      </p>
    );
  }
  if (!map) return <p className="text-sm text-zinc-400">Cargando plano…</p>;
  if (!level) return null;
  const { width, height } = map.canvas;
  const tierName = (id) => map.tiers.find((t) => t.id === id)?.name ?? "";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {map.levels.length > 1 ? (
          <div role="tablist" aria-label="Nivel" className="inline-flex rounded-md border border-line p-0.5">
            {map.levels.map((l) => (
              <button key={l.id} type="button" role="tab" aria-selected={l.id === level.id} onClick={() => setLevelId(l.id)}
                className={`rounded px-3 py-1.5 text-sm font-medium ${l.id === level.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"}`}>
                {l.name}
              </button>
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
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: `${ZOOMS[zoom]}%`, minWidth: "100%", display: "block" }} role="group" aria-label={`Plano de asientos de ${level.name}`}>
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
          {tables.map((t) => (
            <g key={t.id} pointerEvents="none">
              <circle cx={t.x} cy={t.y} r="14" fill="#18181b" stroke="#3f3f46" />
              <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="#a1a1aa">{t.label}</text>
            </g>
          ))}
          {seats.map((s) => {
            const free = s.status === "LIBRE";
            const isSel = selectedIds.has(s.id);
            const color = s.tierId ? colorOf.get(s.tierId) ?? "#a1a1aa" : "#52525b";
            return (
              <g key={s.id} onClick={() => toggle(s)} style={{ cursor: free && !disabled ? "pointer" : "default" }}
                role={free ? "button" : undefined} aria-label={free ? `${seatName(s)}, ${formatMoney(s.price)}${isSel ? ", elegido" : ""}` : undefined}
                aria-pressed={free ? isSel : undefined} tabIndex={free ? 0 : undefined}
                onKeyDown={(e) => { if (free && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(s); } }}>
                <title>{free ? `${seatName(s)} · ${tierName(s.tierId)} · ${formatMoney(s.price)}` : s.status === "OCUPADO" ? `${seatName(s)} · ocupado` : `${seatName(s)} · no disponible`}</title>
                <circle cx={s.x} cy={s.y} r="12" fill="transparent" />
                <circle cx={s.x} cy={s.y} r={isSel ? 8 : 6.5}
                  fill={isSel ? "#ffffff" : free ? color : "transparent"}
                  stroke={isSel ? "#dc2626" : free ? color : "#3f3f46"} strokeWidth={isSel ? 3 : 1.2}
                  strokeDasharray={s.status === "NO_VENTA" ? "2 2" : undefined} />
                {s.status === "OCUPADO" && <path d={`M${s.x - 3},${s.y - 3} L${s.x + 3},${s.y + 3} M${s.x + 3},${s.y - 3} L${s.x - 3},${s.y + 3}`} stroke="#71717a" strokeWidth="1.3" pointerEvents="none" />}
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-zinc-400" aria-label="Leyenda">
        {map.tiers.map((t) => (
          <li key={t.id} className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: colorOf.get(t.id) }} aria-hidden="true" />
            {t.name} · {formatMoney(t.price)}
          </li>
        ))}
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border-2 border-brand bg-white" aria-hidden="true" />Tu elección</li>
        <li className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full border border-zinc-600" aria-hidden="true" />Ocupado</li>
      </ul>
      {limitMsg && <p role="alert" className="mt-2 text-sm text-amber-400">{limitMsg}</p>}
    </div>
  );
}
