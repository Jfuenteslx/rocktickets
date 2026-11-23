import { useEffect, useState } from "react";
import api from "../lib/api";

// Mesas flexibles: el comprador indica cuántas personas son y el sistema aparta la mesa más ajustada.
// `sectors`: [{ id, name, tickets }] con las entradas que ya eligió en cada sector.
export default function TableRequest({ eventId, sectors, validUntil, value, onChange, refreshKey = 0 }) {
  const enabled = !!value;
  const current = sectors.find((s) => s.id === value?.sectorId) ?? sectors[0];
  const [check, setCheck] = useState(null); // { available, tables } | "loading" | "error"

  const sectorId = current?.id;
  const people = value?.people;

  // Si cambia el carrito, mantiene el grupo dentro de las entradas del sector
  useEffect(() => {
    if (!enabled || !current) return;
    const max = current.tickets;
    if (value.sectorId !== current.id || value.people > max) onChange({ sectorId: current.id, people: Math.min(value.people, max) || 1 });
  }, [enabled, current?.id, current?.tickets]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled || !sectorId || !people) { setCheck(null); return; }
    let live = true;
    setCheck("loading");
    const t = setTimeout(() => {
      api.get(`/events/${eventId}/table-availability`, { params: { sectorId, people } })
        .then(({ data }) => live && setCheck(data))
        .catch(() => live && setCheck("error"));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [eventId, enabled, sectorId, people, refreshKey]);

  if (sectors.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-line bg-zinc-900/60 p-3">
      <label className="flex items-start gap-2 text-sm text-white">
        <input
          type="checkbox" className="mt-1" checked={enabled}
          onChange={(e) => onChange(e.target.checked ? { sectorId: current.id, people: Math.min(2, current.tickets) || 1 } : null)}
        />
        <span>
          <span className="font-semibold">Reservar mesa para mi grupo</span>
          <span className="block text-xs text-zinc-400">Sin costo en línea. Consumo mínimo: 1 botella, que se paga en el local.</span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-3">
          {sectors.length > 1 && (
            <div>
              <label htmlFor="mesa-sector" className="text-xs uppercase tracking-wide text-zinc-500">Sector</label>
              <select id="mesa-sector" className="input mt-1" value={current.id} onChange={(e) => {
                const s = sectors.find((x) => x.id === e.target.value);
                onChange({ sectorId: s.id, people: Math.min(value.people, s.tickets) || 1 });
              }}>
                {sectors.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.tickets} entradas)</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-300">¿Cuántas personas son?</span>
            <div className="flex items-center gap-1" role="group" aria-label="Personas en la mesa">
              <button type="button" aria-label="Menos personas" disabled={value.people <= 1} onClick={() => onChange({ ...value, sectorId: current.id, people: value.people - 1 })} className="grid h-8 w-8 place-items-center rounded-md border border-zinc-700 text-lg text-white hover:bg-zinc-800 disabled:opacity-30">−</button>
              <span className="w-8 text-center text-sm font-semibold text-white" aria-live="polite">{value.people}</span>
              <button type="button" aria-label="Más personas" disabled={value.people >= current.tickets} onClick={() => onChange({ ...value, sectorId: current.id, people: value.people + 1 })} className="grid h-8 w-8 place-items-center rounded-md border border-zinc-700 text-lg text-white hover:bg-zinc-800 disabled:opacity-30">+</button>
            </div>
          </div>
          <p className="text-xs text-zinc-500">Máximo {current.tickets}: tantas como entradas de este sector elegiste.</p>

          <p role="status" className="text-sm">
            {check === "loading" && <span className="text-zinc-400">Buscando mesa…</span>}
            {check === "error" && <span className="text-amber-400">No pudimos revisar la disponibilidad; la verificamos al continuar.</span>}
            {check && typeof check === "object" && check.available && (
              <span className="text-emerald-400">
                Hay lugar. Te apartamos {check.tables > 1 ? `${check.tables} mesas juntas` : "una mesa"} para {value.people} {value.people === 1 ? "persona" : "personas"}.
              </span>
            )}
            {check && typeof check === "object" && !check.available && (
              <span className="text-amber-400">
                {check.maxPeople > 0 ? `En este sector ya no hay mesa para ${value.people}. Prueba con ${check.maxPeople} o menos, o compra solo las entradas.` : "En este sector ya no quedan mesas. Puedes comprar solo las entradas."}
              </span>
            )}
          </p>
          <p className="text-xs text-zinc-500">
            La mesa se aparta entera aunque sean menos; se guarda hasta las {validUntil ?? "23:00"} y debes presentar tus entradas.
          </p>
        </div>
      )}
    </div>
  );
}
