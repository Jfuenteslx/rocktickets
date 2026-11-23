import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { categoryLabel } from "../lib/categories";
import { RESERVATION_MINUTES } from "../lib/site";
import { formatDayLong, formatMoney, formatTime, saleInfo, STATE_BADGE } from "../lib/events";
import { EventPoster } from "../components/EventCard";
import VenueSection from "../components/VenueSection";
import GoogleButton from "../components/GoogleButton";
import { GOOGLE_ENABLED, useBuyer } from "../lib/buyerAuth";
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
  const { buyer: account, logout } = useBuyer();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [cart, setCart] = useState({}); // { tierId: cantidad }
  const [buyer, setBuyer] = useState({ name: "", email: "", phone: "" });
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Con sesión iniciada, completa nombre y correo (sin pisar lo que el comprador ya escribió)
  useEffect(() => {
    if (account) setBuyer((b) => ({ ...b, name: b.name || account.name, email: b.email || account.email }));
  }, [account]);

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

  const allTiers = event.sectors.flatMap((s) => s.tiers.map((t) => ({ ...t, sectorName: s.name })));
  const cartItems = Object.entries(cart)
    .map(([tierId, quantity]) => ({ tierId, quantity, tier: allTiers.find((t) => t.id === tierId) }))
    .filter((i) => i.tier);
  const total = cartItems.reduce((sum, i) => sum + Number(i.tier.price) * i.quantity, 0);
  const count = cartItems.reduce((sum, i) => sum + i.quantity, 0);
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
    if (cartItems.length === 0) {
      setError("Elige al menos una entrada.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await api.post("/orders", {
        eventId: id,
        buyerName: buyer.name.trim(),
        buyerEmail: buyer.email.trim(),
        buyerPhone: buyer.phone.trim(),
        acceptTerms: true,
        items: cartItems.map((i) => ({ tierId: i.tierId, quantity: i.quantity })),
      });
      navigate(`/orden/${data.order.accessToken}`);
    } catch (err) {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(" ") : msg || "No se pudo completar la compra. Intenta de nuevo.");
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
                        ) : (
                          <Stepper value={qty} max={max} onChange={(n) => setQty(t.id, n)} label={`Cantidad de ${t.name}`} />
                        )}
                      </div>
                      {!note && t.available <= 20 && <p className="mt-2 text-xs text-amber-400">Quedan {t.available}</p>}
                    </div>
                  );
                })}
            </div>

            {cartItems.length > 0 && (
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
                </ul>
                <p className="mt-3 flex justify-between text-lg font-semibold text-white">
                  <span>Total ({count})</span>
                  <span>{formatMoney(total)}</span>
                </p>

                {GOOGLE_ENABLED && (
                  <div className="mt-4">
                    {account ? (
                      <p className="text-sm text-zinc-400">
                        Comprando como <span className="text-white">{account.email}</span> ·{" "}
                        <button type="button" onClick={logout} className="underline hover:text-white">
                          Salir
                        </button>
                      </p>
                    ) : (
                      <>
                        <p className="mb-2 text-sm text-zinc-400">¿Compras más rápido? Inicia sesión y completamos tus datos:</p>
                        <GoogleButton />
                      </>
                    )}
                  </div>
                )}

                <div className="mt-4 grid gap-3">
                  <div>
                    <label htmlFor="buyer-name" className="sr-only">
                      Nombre completo
                    </label>
                    <input
                      id="buyer-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Nombre completo"
                      value={buyer.name}
                      onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                      required
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="buyer-email" className="sr-only">
                      Correo electrónico
                    </label>
                    <input
                      id="buyer-email"
                      type="email"
                      autoComplete="email"
                      placeholder="Correo electrónico"
                      value={buyer.email}
                      onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
                      required
                      className="input"
                    />
                  </div>
                  <div>
                    <label htmlFor="buyer-phone" className="sr-only">
                      Teléfono
                    </label>
                    <input
                      id="buyer-phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="Teléfono"
                      value={buyer.phone}
                      onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
                      required
                      className="input"
                    />
                  </div>
                </div>

                <label className="mt-4 flex items-start gap-2 text-sm text-zinc-400">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required className="mt-1" />
                  <span>
                    Acepto los{" "}
                    <Link to="/terminos" target="_blank" className="text-white underline">
                      términos y condiciones
                    </Link>{" "}
                    y la{" "}
                    <Link to="/privacidad" target="_blank" className="text-white underline">
                      política de privacidad
                    </Link>
                    .
                  </span>
                </label>

                {error && (
                  <p role="alert" className="mt-3 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={submitting || !accepted} className="btn btn-primary mt-4 w-full py-3">
                  {submitting ? "Procesando…" : "Continuar con el pago"}
                </button>
                <p className="mt-3 text-center text-xs text-zinc-500">Reservamos tus entradas por {RESERVATION_MINUTES} minutos.</p>
              </form>
            )}
            {cartItems.length === 0 && error && (
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
