import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import api, { API_URL, errorMessage } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { fmtDay, fmtMonth, fmtTime, fmtWeekday } from "../lib/format.js";
import StockGauge from "../components/StockGauge.jsx";
import Badge from "../components/Badge.jsx";
import { TicketGlyph } from "../components/Logo.jsx";

const TABS = [
  { to: "", label: "Entradas", end: true },
  { to: "ventas", label: "Ventas" },
  { to: "cortesias", label: "Cortesías" },
  { to: "puerta", label: "Puerta" },
  { to: "detalles", label: "Detalles" },
];

// Carga el evento y su inventario una sola vez y se los pasa a las pestañas
export default function EventShell() {
  const { id } = useParams();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [ev, setEv] = useState(null);
  const [inv, setInv] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(location.state?.notice ?? null);

  useEffect(() => {
    // El aviso llega por el historial de navegación; se limpia para que no reaparezca al recargar
    if (location.state?.notice) navigate(location.pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    try {
      const [e, i] = await Promise.all([api.get(`/manage/events/${id}`), api.get(`/events/${id}/inventory`)]);
      setEv(e.data);
      setInv(i.data);
      setError(null);
    } catch (err) {
      setError({ notFound: err.response?.status === 404, message: errorMessage(err, "No se pudo cargar el evento.") });
    }
  }, [id]);

  useEffect(() => {
    setEv(null);
    setInv(null);
    load();
  }, [load]);

  if (error) {
    return (
      <div>
        <Link to="/eventos" className="text-sm text-muted hover:text-ink">Volver a eventos</Link>
        <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-3xl font-semibold">
            {error.notFound ? "No encontramos este evento" : "No se pudo cargar"}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-[15px] text-muted">
            {error.notFound ? "Puede que ya no exista o que pertenezca a otro organizador." : error.message}
          </p>
        </div>
      </div>
    );
  }
  if (!ev || !inv) return <p className="text-muted">Cargando evento…</p>;

  const cancelled = ev.status === "CANCELADO";

  return (
    <div>
      <Link to="/eventos" className="text-sm text-muted hover:text-ink">Volver a eventos</Link>

      <header className="relative mt-4 flex flex-col rounded-lg border border-line bg-surface sm:flex-row">
        <div className="flex shrink-0 items-center gap-4 px-5 pt-5 sm:w-28 sm:flex-col sm:items-start sm:gap-0 sm:pb-5 sm:pr-0">
          <span className="font-display text-6xl font-semibold leading-none">{fmtDay(ev.startsAt)}</span>
          <span className="sm:mt-1">
            <span className="block font-display text-xl font-medium uppercase leading-none tracking-wide text-lamp">{fmtMonth(ev.startsAt)}</span>
            <span className="block text-[13px] capitalize text-muted">{fmtWeekday(ev.startsAt)}</span>
          </span>
        </div>
        <div className="flex min-w-0 flex-1 gap-4 px-5 py-5">
          <div className="hidden h-[88px] w-[70px] shrink-0 overflow-hidden rounded-md border border-line bg-bg sm:block">
            {ev.imageUrl ? (
              <img src={`${API_URL}${ev.imageUrl}`} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full items-center justify-center"><TicketGlyph className="h-6 w-6 opacity-40" /></span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold leading-tight">{ev.name}</h1>
            <p className="mt-1 text-[15px]">{ev.venueName}</p>
            <p className="text-[13px] text-muted">{fmtTime(ev.startsAt)} a {fmtTime(ev.endsAt)}</p>
            {user.role === "SUPERADMIN" && <p className="mt-1.5 text-[13px] text-muted">Organiza {ev.organizerName}</p>}
            {cancelled && <div className="mt-2"><Badge tone="bad">Cancelado</Badge></div>}
          </div>
        </div>
        <div className="stub-notch relative hidden w-0 self-stretch border-l border-dashed border-line sm:block" aria-hidden="true" />
        <div className="mx-5 border-t border-dashed border-line sm:hidden" aria-hidden="true" />
        <div className="px-5 py-5 sm:w-64 sm:shrink-0"><StockGauge tickets={ev.tickets} /></div>
      </header>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line" aria-label="Secciones del evento">
        {TABS.map((t) => (
          <NavLink
            key={t.label} to={t.to} end={t.end}
            className={({ isActive }) =>
              `-mb-px shrink-0 border-b-2 px-4 py-2.5 text-[15px] font-medium transition-colors ${
                isActive ? "border-lamp text-ink" : "border-transparent text-muted hover:text-ink"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      {location.state?.warning && (
        <p role="status" className="mt-6 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-[15px] text-warn">{location.state.warning}</p>
      )}
      {notice && (
        <div role="status" className="mt-6 flex items-start justify-between gap-4 rounded-md border border-ok/40 bg-ok/10 px-4 py-3">
          <div>
            <p className="text-[15px] font-medium text-ok">{notice.title}</p>
            {notice.detail && <p className="mt-0.5 text-sm text-ink/80">{notice.detail}</p>}
          </div>
          <button type="button" onClick={() => setNotice(null)} className="text-sm text-muted hover:text-ink">Cerrar</button>
        </div>
      )}
      {cancelled && (
        <p role="status" className="mt-6 rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-[15px] text-bad">
          Este evento está cancelado: ya no se vende ni se puede modificar.
        </p>
      )}

      <div className="mt-8">
        <Outlet context={{ ev, inv, reload: load, flash: setNotice }} />
      </div>
    </div>
  );
}
