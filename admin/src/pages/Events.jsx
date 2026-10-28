import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api, { API_URL, errorMessage } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { fmtDay, fmtMonth, fmtTime, fmtWeekday } from "../lib/format.js";
import StockGauge from "../components/StockGauge.jsx";
import { TicketGlyph } from "../components/Logo.jsx";

const TABS = [
  { id: "proximos", label: "Próximos" },
  { id: "pasados", label: "Pasados" },
  { id: "cancelados", label: "Cancelados" },
];

function bucket(ev, now) {
  if (ev.status === "CANCELADO") return "cancelados";
  return new Date(ev.endsAt) < now ? "pasados" : "proximos";
}

function EventTicket({ ev, showOrganizer }) {
  const cancelled = ev.status === "CANCELADO";
  return (
    <article
      className={`relative flex flex-col rounded-lg border border-line bg-surface transition-colors hover:border-[#3A4757] sm:flex-row ${
        cancelled ? "opacity-70" : ""
      }`}
    >
      {/* Fecha */}
      <div className="flex shrink-0 items-center gap-4 px-5 pt-5 sm:w-28 sm:flex-col sm:items-start sm:gap-0 sm:pb-5 sm:pr-0">
        <span className="font-display text-6xl font-semibold leading-none">{fmtDay(ev.startsAt)}</span>
        <span className="sm:mt-1">
          <span className="block font-display text-xl font-medium uppercase leading-none tracking-wide text-lamp">
            {fmtMonth(ev.startsAt)}
          </span>
          <span className="block text-[13px] capitalize text-muted">{fmtWeekday(ev.startsAt)}</span>
        </span>
      </div>

      {/* Datos del evento */}
      <div className="flex min-w-0 flex-1 gap-4 px-5 py-5">
        <div className="hidden h-[88px] w-[70px] shrink-0 overflow-hidden rounded-md border border-line bg-bg sm:block">
          {ev.imageUrl ? (
            <img src={`${API_URL}${ev.imageUrl}`} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full items-center justify-center text-muted"><TicketGlyph className="h-6 w-6 opacity-40" /></span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold leading-tight">
            <Link
              to={`/eventos/${ev.id}`}
              className="after:absolute after:inset-0 after:rounded-lg hover:text-lamp focus-visible:outline-offset-4"
            >
              {ev.name}
            </Link>
          </h2>
          <p className="mt-1.5 text-[15px]">{ev.venueName}</p>
          <p className="text-[13px] text-muted">
            {fmtTime(ev.startsAt)} a {fmtTime(ev.endsAt)}
          </p>
          {showOrganizer && <p className="mt-1.5 text-[13px] text-muted">Organiza {ev.organizerName}</p>}
          {cancelled && (
            <span className="mt-2 inline-block rounded border border-bad/40 bg-bad/10 px-2 py-0.5 text-xs font-medium text-bad">
              Cancelado
            </span>
          )}
        </div>
      </div>

      {/* Perforación */}
      <div className="stub-notch relative hidden w-0 self-stretch border-l border-dashed border-line sm:block sm:stub-notch" aria-hidden="true" />
      <div className="mx-5 border-t border-dashed border-line sm:hidden" aria-hidden="true" />

      {/* Talón: tickets */}
      <div className="px-5 py-5 sm:w-64 sm:shrink-0">
        <StockGauge tickets={ev.tickets} />
      </div>
    </article>
  );
}

export default function Events() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("proximos");
  const [notice, setNotice] = useState(location.state?.notice ?? null);

  useEffect(() => {
    // El aviso viene de crear/editar; se limpia del historial para que no reaparezca al recargar
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api
      .get("/manage/events")
      .then((r) => setEvents(r.data))
      .catch((e) => setError(errorMessage(e, "No se pudieron cargar los eventos.")));
  }, []);

  const now = useMemo(() => new Date(), []);
  const groups = useMemo(() => {
    const g = { proximos: [], pasados: [], cancelados: [] };
    (events ?? []).forEach((ev) => g[bucket(ev, now)].push(ev));
    g.proximos.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    g.pasados.sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
    g.cancelados.sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
    return g;
  }, [events, now]);

  const list = groups[tab];
  const isSuper = user.role === "SUPERADMIN";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl font-semibold leading-none">
          {isSuper ? "Eventos" : "Mis eventos"}
        </h1>
        <Link to="/eventos/nuevo" className="btn btn-primary">Crear evento</Link>
      </div>

      {notice && (
        <div role="status" className="mt-6 flex items-start justify-between gap-4 rounded-md border border-ok/40 bg-ok/10 px-4 py-3 text-[15px]">
          <div>
            <p className="font-medium text-ok">{notice.title}</p>
            {notice.detail && <p className="mt-0.5 text-sm text-ink/80">{notice.detail}</p>}
          </div>
          <button type="button" onClick={() => setNotice(null)} className="text-sm text-muted hover:text-ink">Cerrar</button>
        </div>
      )}

      {error && <p role="alert" className="mt-8 rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-bad">{error}</p>}

      {events && (
        <>
          <div className="mt-8 flex gap-1 border-b border-line" role="tablist" aria-label="Filtrar eventos">
            {TABS.map((t) => (
              <button
                key={t.id} type="button" role="tab" aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-4 py-2.5 text-[15px] font-medium transition-colors ${
                  tab === t.id ? "border-lamp text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
                <span className="ml-2 text-[13px] text-muted">{groups[t.id].length}</span>
              </button>
            ))}
          </div>

          {list.length > 0 ? (
            <ul className="mt-6 space-y-4">
              {list.map((ev) => (
                <li key={ev.id}><EventTicket ev={ev} showOrganizer={isSuper} /></li>
              ))}
            </ul>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-14 text-center">
              {events.length === 0 ? (
                <>
                  <p className="font-display text-3xl font-semibold">Aún no hay eventos</p>
                  <p className="mx-auto mt-2 max-w-sm text-[15px] text-muted">
                    Crea el primero: elige el local, la fecha y una imagen. Los tickets se generan después.
                  </p>
                  <Link to="/eventos/nuevo" className="btn btn-primary mt-6">Crear evento</Link>
                </>
              ) : (
                <p className="text-[15px] text-muted">No hay eventos en esta pestaña.</p>
              )}
            </div>
          )}
        </>
      )}

      {!events && !error && <p className="mt-10 text-muted">Cargando eventos…</p>}
    </div>
  );
}
