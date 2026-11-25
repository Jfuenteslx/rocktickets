import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { categoryLabel } from "../lib/categories";
import { RESERVATION_MINUTES } from "../lib/site";
import { formatDayLong, formatMoney, formatTime, saleInfo, STATE_BADGE } from "../lib/events";
import { EventPoster } from "../components/EventCard";
import VenueSection from "../components/VenueSection";
import SeatPicker from "../components/SeatPicker";
import TablePicker from "../components/TablePicker";
import TableRequest from "../components/TableRequest";
import { ErrorBox, LoadError, Loading } from "../components/StateMessage";

const MAX_PER_TIER = 10;

function Stepper({ value, max, onChange, label }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 0}
        aria-label="Quitar una"
        className="grid h-8 w-8 place-items-center rounded-md border border-zinc-700 text-lg text-white hover:bg-zinc-800 disabled:opacity-30"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-semibold text-white" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Agregar una"
        className="grid h-8 w-8 place-items-center rounded-md border border-zinc-700 text-lg text-white hover:bg-zinc-800 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [cart, setCart] = useState({}); // { tierId: cantidad }
  const [seats, setSeats] = useState([]); // asientos elegidos en el plano
  const [tables, setTables] = useState([]); // mesas fijas elegidas en el plano
  const [mapKey, setMapKey] = useState(0);
  const [tableRequest, setTableRequest] = useState(null); // mesas flexibles: { sectorId, people }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/events/${id}`)
      .then(({ data }) => setEvent(data))
      .catch((err) => setLoadError(err))
      .finally(() => setLoading(false));
  }, [id, attempt]);

  if (loading) return <Loading text="Cargando evento…" />;
  if (loadError)
    return (
      <LoadError
        error={loadError}
        notFoundText="No encontramos este evento."
        onRetry={() => {
          setLoadError(null);
          setLoading(true);
          setAttempt((n) => n + 1);
        }}
      />
    );
  if (!event) return <ErrorBox>No encontramos este evento.</ErrorBox>;

  const allTiers = event.sectors.flatMap((s) => s.tiers.map((t) => ({ ...t, sectorName: s.name, sectorId: s.id })));
  const cartItems = Object.entries(cart)
    .map(([tierId, quantity]) => ({ tierId, quantity, tier: allTiers.find((t) => t.id === tierId) }))
    .filter((i) => i.tier);
  const bySeatMode = event.seatingMode === "BUTACAS";
  const byTableMode = event.seatingMode === "MESAS_FIJAS";
  const flexMode = event.seatingMode === "MESAS_FLEXIBLES";
  // entradas elegidas por sector: de ahí sale cuántas personas pueden pedir mesa
  const flexSectors = event.sectors
    .map((s) => ({ id: s.id, name: s.name, tickets: cartItems.filter((i) => i.tier.sectorId === s.id).reduce((n, i) => n + i.quantity, 0) }))
    .filter((s) => s.tickets > 0);
  const total =
    cartItems.reduce((sum, i) => sum + Number(i.tier.price) * i.quantity, 0) +
    seats.reduce((sum, s) => sum + Number(s.price), 0) +
    tables.reduce((sum, t) => sum + Number(t.price), 0);
  // "count" cuenta tickets: cada persona de una mesa lleva el suyo
  const count = cartItems.reduce((sum, i) => sum + i.quantity, 0) + seats.length + tables.reduce((sum, t) => sum + t.people, 0);
  const { state } = saleInfo(event);
  const badge = STATE_BADGE[state];
  const ended = new Date(event.endsAt) <= new Date();

  function setQty(tierId, qty) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[tierId];
      else next[tierId] = qty;
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (count === 0) {
      setError("Elige al menos una entrada.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await api.post("/orders", {
        eventId: id,
        ...(cartItems.length > 0 && { items: cartItems.map((i) => ({ tierId: i.tierId, quantity: i.quantity })) }),
        ...(seats.length > 0 && { seatIds: seats.map((s) => s.id) }),
        ...(tables.length > 0 && { tables: tables.map((t) => ({ tableId: t.id })) }),
        ...(flexMode && tableRequest && { tableRequest: { sectorId: tableRequest.sectorId, people: tableRequest.people } }),
      });
      navigate(`/orden/${data.order.accessToken}`);
    } catch (err) {
      const msg = err.response?.data?.message;
      const gone = err.response?.data?.unavailableSeatIds;
      const goneTables = err.response?.data?.unavailableTableIds;
      if (err.response?.data?.noTableAvailable) {
        setTableRequest(null);
        setMapKey((k) => k + 1);
      }
      if (Array.isArray(goneTables) && goneTables.length > 0) {
        setTables((cur) => cur.filter((t) => !goneTables.includes(t.id)));
        setMapKey((k) => k + 1);
      }
      if (Array.isArray(gone) && gone.length > 0) {
        // alguien se llevó esos asientos: se sueltan y se recarga el plano
        setSeats((cur) => cur.filter((s) => !gone.includes(s.id)));
        setMapKey((k) => k + 1);
      }
      setError(Array.isArray(msg) ? msg.join(" ") : msg || "No se pudo completar la compra. Intenta de nuevo.");
      if (err.response?.data?.noTableAvailable) setError((m) => `${m} Quitamos la reserva de mesa: puedes continuar solo con las entradas.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link to="/eventos" className="text-sm text-zinc-400 hover:text-white">
        ← Volver a eventos
      </Link>

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Información del evento */}
        <div>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-zinc-900">
            <EventPoster event={event} className="aspect-[16/9] w-full" />
            {badge && <span className={`absolute right-0 top-0 rounded-bl-lg px-3 py-1.5 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>}
          </div>

          <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-brand">{categoryLabel(event.category)}</p>
          <h1 className="mt-1 font-display text-5xl font-extrabold uppercase leading-none text-white sm:text-6xl">{event.name}</h1>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="card p-4">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Fecha y hora</dt>
              <dd className="mt-1 font-medium text-white">{formatDayLong(event.startsAt)}</dd>
              <dd className="text-sm text-zinc-400">
                {formatTime(event.startsAt)} a {formatTime(event.endsAt)}
              </dd>
            </div>
            {event.venueName && (
              <div className="card p-4">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Lugar</dt>
                <dd className="mt-1 font-medium text-white">{event.venueName}</dd>
              </div>
            )}
          </dl>

          {event.description && (
            <div className="mt-8">
              <h2 className="section-title">Acerca del evento</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-zinc-300">{event.description}</p>
            </div>
          )}

          {bySeatMode && !ended && (
            <section id="asientos" className="mt-8" aria-labelledby="asientos-titulo">
              <h2 id="asientos-titulo" className="section-title">Elige tu asiento</h2>
              <p className="mt-2 text-sm text-zinc-400">Toca los asientos libres del plano. Puedes elegir varios y pagas todo junto.</p>
              <div className="mt-4">
                <SeatPicker eventId={id} selected={seats} onChange={setSeats} refreshKey={mapKey} />
              </div>
            </section>
          )}

          {byTableMode && !ended && (
            <section id="asientos" className="mt-8" aria-labelledby="mesas-titulo">
              <h2 id="mesas-titulo" className="section-title">Elige tu mesa</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Cada mesa se reserva completa con su paquete, que incluye las entradas de todos los que van.
                Tu mesa se guarda hasta las {event.tableValidUntil ?? "23:00"}; pasada esa hora se libera para el local, y tus entradas siguen valiendo.
              </p>
              <div className="mt-4">
                <TablePicker eventId={id} selected={tables} onChange={setTables} refreshKey={mapKey} />
              </div>
            </section>
          )}

          <VenueSection venue={event.venue} />
        </div>

        {/* Selector de entradas */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <h2 className="font-display text-2xl font-bold uppercase text-white">Elige tus entradas</h2>

            {ended && <p className="mt-3 text-sm text-zinc-400">Este evento ya terminó.</p>}
            {!ended && allTiers.length === 0 && <p className="mt-3 text-sm text-zinc-400">Las entradas se publicarán pronto.</p>}

            <div className="mt-4 space-y-3">
              {!ended &&
                allTiers.map((t) => {
                  const max = Math.min(t.available, MAX_PER_TIER);
                  const qty = cart[t.id] || 0;
                  let note = null;
                  if (t.available === 0) note = "Agotado";
                  else if (!t.disponibleParaCompra) note = t.isPaused ? "Venta pausada" : "Aún no disponible";
                  return (
                    <div key={t.id} className={`rounded-lg border p-3 ${qty > 0 ? "border-brand" : "border-line"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{t.name}</p>
                          <p className="text-xs text-zinc-500">{t.sectorName}</p>
                          <p className="mt-1 text-sm font-semibold text-white">{formatMoney(t.price)}</p>
                        </div>
                        {note ? (
                          <span className="shrink-0 text-xs font-semibold uppercase text-zinc-500">{note}</span>
                        ) : t.bySeat ? (
                          <a href="#asientos" className="shrink-0 text-xs font-semibold uppercase text-brand hover:underline">
                            {byTableMode ? "Elige tu mesa" : "Elige en el plano"}
                          </a>
                        ) : (
                          <Stepper value={qty} max={max} onChange={(n) => setQty(t.id, n)} label={`Cantidad de ${t.name}`} />
                        )}
                      </div>
                      {!note && !t.bySeat && t.available <= 20 && <p className="mt-2 text-xs text-amber-400">Quedan {t.available}</p>}
                    </div>
                  );
                })}
            </div>

            {count > 0 && (
              <form onSubmit={handleSubmit} className="mt-5 border-t border-line pt-5">
                <ul className="space-y-1 text-sm text-zinc-400">
                  {cartItems.map((i) => (
                    <li key={i.tierId} className="flex justify-between">
                      <span>
                        {i.quantity} × {i.tier.name}
                      </span>
                      <span>{formatMoney(Number(i.tier.price) * i.quantity)}</span>
                    </li>
                  ))}
                  {tables.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        Mesa {t.label} · {t.packageName}
                        <span className="block text-xs text-zinc-500">{t.people} personas{t.bottle ? ` · botella incluida: ${t.bottle}` : ""}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {formatMoney(t.price)}
                        <button type="button" onClick={() => setTables((cur) => cur.filter((x) => x.id !== t.id))} aria-label={`Quitar mesa ${t.label}`} className="text-zinc-500 hover:text-white">✕</button>
                      </span>
                    </li>
                  ))}
                  {seats.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{s.label}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {formatMoney(s.price)}
                        <button type="button" onClick={() => setSeats((cur) => cur.filter((x) => x.id !== s.id))} aria-label={`Quitar ${s.label}`} className="text-zinc-500 hover:text-white">✕</button>
                      </span>
                    </li>
                  ))}
                </ul>
                {flexMode && (
                  <TableRequest
                    eventId={id} sectors={flexSectors} validUntil={event.tableValidUntil}
                    value={flexSectors.length ? tableRequest : null} onChange={setTableRequest} refreshKey={mapKey}
                  />
                )}
                <p className="mt-3 flex justify-between text-lg font-semibold text-white">
                  <span>Total ({count})</span>
                  <span>{formatMoney(total)}</span>
                </p>

                {error && (
                  <p role="alert" className="mt-3 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={submitting} className="btn btn-primary mt-4 w-full py-3">
                  {submitting ? "Procesando…" : "Continuar con el pago"}
                </button>
                <p className="mt-3 text-center text-xs text-zinc-500">
                  Reservamos tus entradas por {RESERVATION_MINUTES} minutos. En el siguiente paso pagas con QR y nos dejas tus datos.
                </p>
              </form>
            )}
            {count === 0 && error && (
              <p role="alert" className="mt-3 text-sm text-red-400">
                {error}
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
