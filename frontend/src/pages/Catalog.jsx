import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import useEvents from "../lib/useEvents";
import { CATEGORIES } from "../lib/categories";
import { isSameDay, saleInfo } from "../lib/events";
import EventCard from "../components/EventCard";
import { ErrorBox, Loading } from "../components/StateMessage";

const DATE_FILTERS = [
  { value: "", label: "Cualquier fecha" },
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Próximos 7 días" },
  { value: "mes", label: "Este mes" },
];

// Quita tildes y pasa a minúsculas para que "cafe" encuentre "Café".
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function matchesDate(event, filter) {
  if (!filter) return true;
  const start = new Date(event.startsAt);
  const now = new Date();
  if (filter === "hoy") return isSameDay(start, now);
  if (filter === "semana") return start >= new Date(now.setHours(0, 0, 0, 0)) && start < new Date(Date.now() + 7 * 864e5);
  if (filter === "mes") return start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
  return true;
}

export default function Catalog() {
  const { events, loading, error } = useEvents();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const categoria = params.get("categoria") ?? "";
  const fecha = params.get("fecha") ?? "";
  const soloDisponibles = params.get("disponibles") === "1";

  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (q && !norm(`${e.name} ${e.venueName ?? ""}`).includes(norm(q))) return false;
        if (categoria && e.category !== categoria) return false;
        if (!matchesDate(e, fecha)) return false;
        if (soloDisponibles && !saleInfo(e).canBuy) return false;
        return true;
      }),
    [events, q, categoria, fecha, soloDisponibles],
  );

  const hasFilters = q || categoria || fecha || soloDisponibles;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase text-white">Eventos</h1>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor="q" className="sr-only">
            Buscar por artista o evento
          </label>
          <input
            id="q"
            value={q}
            onChange={(e) => update("q", e.target.value)}
            placeholder="Buscar por artista, evento o lugar"
            className="input sm:max-w-md"
          />
          <label htmlFor="fecha" className="sr-only">
            Fecha
          </label>
          <select id="fecha" value={fecha} onChange={(e) => update("fecha", e.target.value)} className="input sm:w-48">
            {DATE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={soloDisponibles}
              onChange={(e) => update("disponibles", e.target.checked ? "1" : "")}
              className="h-4 w-4 accent-red-600"
            />
            Solo con entradas
          </label>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Categorías">
          {[{ value: "", label: "Todos" }, ...CATEGORIES].map((c) => {
            const active = categoria === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => update("categoria", c.value)}
                aria-pressed={active}
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  active ? "border-brand bg-brand text-white" : "border-line text-zinc-300 hover:border-zinc-500"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading && <Loading text="Cargando eventos…" />}
      {error && <ErrorBox>{error}</ErrorBox>}

      {!loading && !error && (
        <>
          <p className="mt-8 text-sm text-zinc-500" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "evento" : "eventos"}
          </p>
          {filtered.length === 0 ? (
            <div className="py-20 text-center text-zinc-500">
              <p>No encontramos eventos con esos filtros.</p>
              {hasFilters && (
                <button type="button" onClick={() => setParams({}, { replace: true })} className="btn btn-ghost mt-4">
                  Quitar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {filtered.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
