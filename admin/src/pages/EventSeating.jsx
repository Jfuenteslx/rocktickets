import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import { plural } from "../lib/format.js";
import Badge from "../components/Badge.jsx";
import SeatZonePainter from "../components/SeatZonePainter.jsx";
import MesasFijasAdmin from "../components/MesasFijasAdmin.jsx";
import MesasFlexiblesAdmin from "../components/MesasFlexiblesAdmin.jsx";

// Cómo se ubica el público en este evento. Uno solo por evento.
const MODES = [
  { id: "NINGUNO", title: "Sin ubicación", text: "Entradas por sector y precio, sin lugar asignado. Es el funcionamiento de siempre.", ready: true },
  { id: "BUTACAS", title: "Asientos numerados", text: "Cada entrada va ligada a un asiento del plano. El comprador elige su lugar en el mapa, aunque comparta mesa con desconocidos.", ready: true },
  { id: "MESAS_FIJAS", title: "Mesas fijas", text: "Paquetes de mesa definidos de antemano (personas, botella y precio) que el comprador elige.", ready: true },
  { id: "MESAS_FLEXIBLES", title: "Mesas flexibles", text: "Compra entradas normales y, si quiere, reserva una mesa indicando cuántas personas son: el sistema las acomoda según el espacio libre.", ready: true },
];

export default function EventSeating() {
  const { ev, inv, reload, flash } = useOutletContext();
  const cancelled = ev.status === "CANCELADO";
  const mode = ev.seatingMode ?? "NINGUNO";
  const t = ev.tickets;
  const hasSales = t.reservado + t.vendidos + t.cortesias > 0;

  const [pending, setPending] = useState(null); // modo elegido, esperando confirmación
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [mapKey, setMapKey] = useState(0);

  async function confirmMode() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch(`/events/${ev.id}/seating-mode`, { seatingMode: pending });
      flash({
        title: pending === "BUTACAS" ? "Evento con asientos numerados" : pending === "MESAS_FIJAS" ? "Evento con mesas fijas" : pending === "MESAS_FLEXIBLES" ? "Evento con mesas flexibles" : "Evento sin ubicación",
        detail: data.deletedTickets > 0
          ? `Se eliminaron ${plural(data.deletedTickets, "ticket disponible", "tickets disponibles")}. Genera los tickets de nuevo para el modo nuevo.`
          : "Ahora genera los tickets del evento.",
      });
      setPending(null);
      await reload();
    } catch (err) {
      setError(errorMessage(err, "No se pudo cambiar el modo."));
    } finally {
      setBusy(false);
    }
  }

  const missing = inv.sectors.reduce((a, s) => a + Math.max(0, s.capacity - s.generated), 0);
  const generated = inv.sectors.reduce((a, s) => a + s.generated, 0);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const { data } = await api.post(`/events/${ev.id}/generate-tickets`);
      setGenResult(data);
      await reload();
      setMapKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err, "No se pudieron generar los tickets."));
    } finally {
      setGenerating(false);
    }
  }

  const hasSaleTiers = inv.tiers.some((x) => x.kind === "VENTA");

  return (
    <div className="space-y-10">
      <section aria-labelledby="modo-titulo">
        <h3 id="modo-titulo" className="font-display text-3xl font-semibold leading-none">Cómo se ubica el público</h3>
        <p className="mt-1.5 max-w-2xl text-[15px] text-muted">Elige un modo para este evento. Si no hay ventas todavía, puedes cambiarlo cuando quieras.</p>

        <div role="radiogroup" aria-label="Modo de ubicación" className="mt-5 grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => {
            const active = mode === m.id;
            const disabled = !m.ready || cancelled || (hasSales && !active);
            return (
              <button
                key={m.id} type="button" role="radio" aria-checked={active} disabled={disabled}
                onClick={() => { setError(""); setPending(active ? null : m.id); }}
                className={`rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed ${
                  active ? "border-lamp bg-lamp/10" : "border-line bg-surface hover:border-[#3A4757] disabled:opacity-55 disabled:hover:border-line"
                } ${pending === m.id ? "ring-2 ring-lamp/60" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span className="font-display text-xl font-semibold">{m.title}</span>
                  {active && <Badge tone="ok">Actual</Badge>}
                  {!m.ready && <Badge tone="quiet">Próximamente</Badge>}
                </span>
                <span className="mt-1 block text-[14px] leading-snug text-muted">{m.text}</span>
              </button>
            );
          })}
        </div>

        {hasSales && !cancelled && (
          <p role="status" className="mt-4 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-[15px] text-warn">
            Este evento ya tiene tickets reservados, vendidos o de cortesía, así que el modo no se puede cambiar.
          </p>
        )}

        {pending && !cancelled && (
          <div className="mt-4 rounded-md border border-line bg-bg p-4">
            <p className="text-[15px]">
              Cambiar a <strong>{MODES.find((m) => m.id === pending).title}</strong>.{" "}
              {t.disponible > 0
                ? `Se eliminarán ${plural(t.disponible, "ticket disponible", "tickets disponibles")} (nadie los compró) y luego los generas de nuevo según el modo. Tus tiers y precios se conservan.`
                : "Aún no hay tickets generados: después tendrás que generarlos."}
            </p>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn btn-primary" onClick={confirmMode} disabled={busy}>{busy ? "Cambiando…" : "Confirmar cambio"}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setPending(null)} disabled={busy}>Cancelar</button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="field-error">{error}</p>}
      </section>

      {mode === "NINGUNO" && (
        <p className="text-[15px] text-muted">
          Sin ubicación, las entradas se reparten por sector y tier en la pestaña <Link to=".." className="underline hover:text-ink">Entradas</Link>.
          Elige «Asientos numerados» para vender lugares concretos del plano.
        </p>
      )}

      {(mode === "BUTACAS" || mode === "MESAS_FIJAS" || mode === "MESAS_FLEXIBLES") && (
        <>
          <section aria-labelledby="gen-titulo">
            <h3 id="gen-titulo" className="font-display text-3xl font-semibold leading-none">1. {mode === "MESAS_FIJAS" ? "Tickets por mesa" : mode === "MESAS_FLEXIBLES" ? "Tickets del aforo" : "Tickets por asiento"}</h3>
            {generated === 0 || missing > 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warn/40 bg-warn/10 px-4 py-3">
                <p className="text-[15px] text-warn">
                  {generated === 0
                    ? "Todavía no hay tickets. Se crea uno por cada asiento activo del plano y, en los sectores sin asientos, uno por lugar del aforo."
                    : `Faltan ${plural(missing, "ticket", "tickets")} por generar: el plano del local cambió.`}
                </p>
                {!cancelled && (
                  <button type="button" className="btn btn-primary !py-2 !text-sm" onClick={generate} disabled={generating}>
                    {generating ? "Generando…" : "Generar tickets"}
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[15px] text-muted">Listo: {plural(generated, "ticket generado", "tickets generados")}. Si cambias el plano del local, vuelve a generar para sumar los asientos nuevos.</p>
            )}
            {genResult && (
              <p role="status" className="mt-2 text-[13px] text-ok">
                Se crearon {genResult.created} tickets{genResult.removed > 0 ? ` y se eliminaron ${genResult.removed} de asientos que ya no están en el plano` : ""}.
              </p>
            )}
          </section>

          {generated > 0 && mode === "MESAS_FIJAS" && (
            <MesasFijasAdmin ev={{ ...ev, tableValidUntil: inv.tableValidUntil }} cancelled={cancelled} onChanged={reload} refreshKey={mapKey} />
          )}

          {generated > 0 && mode === "MESAS_FLEXIBLES" && (
            <>
              <p className="-mt-4 max-w-2xl text-[15px] text-muted">
                Las entradas se reparten por sector y tier en la pestaña <Link to=".." className="underline hover:text-ink">Entradas</Link>, igual que sin ubicación. Aquí defines qué mesas se ofrecen.
              </p>
              <MesasFlexiblesAdmin ev={{ ...ev, tableValidUntil: inv.tableValidUntil }} cancelled={cancelled} onChanged={reload} refreshKey={mapKey} />
            </>
          )}

          {generated > 0 && mode === "BUTACAS" && (
            <section aria-labelledby="zonas-titulo">
              <h3 id="zonas-titulo" className="font-display text-3xl font-semibold leading-none">2. Zonas de precio</h3>
              <p className="mt-1.5 max-w-2xl text-[15px] text-muted">
                Cada zona de precio es un tier de la pestaña <Link to=".." className="underline hover:text-ink">Entradas</Link>. Crea los tiers con su precio y luego pinta aquí los asientos de cada uno. Los asientos sin zona no se venden.
              </p>
              {!hasSaleTiers && (
                <p className="mt-2 text-[13px] text-muted">Aún no hay tiers de venta: créalos en Entradas para poder asignar asientos.</p>
              )}
              <div className="mt-5">
                <SeatZonePainter eventId={ev.id} tiers={inv.tiers} cancelled={cancelled} onChanged={reload} refreshKey={mapKey} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
