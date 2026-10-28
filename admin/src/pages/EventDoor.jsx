import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import Badge from "../components/Badge.jsx";
import Banner from "../components/Banner.jsx";

// Quién trabaja la puerta de este evento. El personal solo ve en la app los eventos asignados aquí.
export default function EventDoor() {
  const { ev, flash } = useOutletContext();
  const cancelled = ev.status === "CANCELADO";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(
    () => api.get(`/events/${ev.id}/door`).then((r) => { setData(r.data); setError(""); })
      .catch((e) => setError(errorMessage(e, "No se pudo cargar el personal de puerta."))),
    [ev.id]
  );
  useEffect(() => { load(); }, [load]);

  async function assign(e) {
    e.preventDefault();
    if (!pick) return;
    const who = data.available.find((a) => a.id === pick);
    setBusyId("assign"); setError("");
    try {
      await api.put(`/events/${ev.id}/door/${pick}`);
      flash({ title: `${who.name} quedó asignada a la puerta de este evento` });
      setPick("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "No se pudo asignar."));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a) {
    setBusyId(a.id); setError("");
    try {
      await api.delete(`/events/${ev.id}/door/${a.id}`);
      flash({ title: `${a.name} ya no ve este evento en la app de puerta` });
      await load();
    } catch (err) {
      setError(errorMessage(err, "No se pudo quitar."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[360px_1fr]">
      <section aria-labelledby="door-add">
        <h2 id="door-add" className="font-display text-3xl font-semibold leading-none">Asignar personal</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Quien esté asignado verá este evento en la app de puerta y podrá escanear sus entradas. Los demás no.
        </p>
        {error && <div className="mt-4"><Banner tone="bad">{error}</Banner></div>}
        {cancelled ? (
          <p className="mt-4 text-[15px] text-muted">El evento está cancelado: ya no se asigna personal.</p>
        ) : !data ? (
          !error && <p className="mt-4 text-muted">Cargando…</p>
        ) : data.available.length === 0 ? (
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            No hay personal disponible para asignar. Las cuentas nuevas deben estar aprobadas antes de poder trabajar.{" "}
            <Link to="/personal" className="font-medium text-lamp underline underline-offset-4">Ir a Personal de puerta</Link>
          </p>
        ) : (
          <form onSubmit={assign} className="mt-5 space-y-4">
            <div>
              <label htmlFor="door-pick" className="field-label">Persona</label>
              <select id="door-pick" className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Elige a alguien</option>
                {data.available.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.organizerName ? "" : " (Rocktickets)"}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary" disabled={!pick || busyId === "assign"}>
              {busyId === "assign" ? "Asignando…" : "Asignar a este evento"}
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby="door-list" className="min-w-0">
        <h2 id="door-list" className="font-display text-3xl font-semibold leading-none">En la puerta</h2>
        {data && data.assigned.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-line px-6 py-10 text-center text-[15px] text-muted">
            Nadie asignado todavía: nadie podrá escanear este evento.
          </p>
        )}
        {data && data.assigned.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-lg border border-line bg-surface">
            {data.assigned.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
                    {a.name}
                    {!a.organizerName && <Badge tone="info">Rocktickets</Badge>}
                    {!a.isActive && <Badge tone="bad">Sin acceso</Badge>}
                  </p>
                  <p className="break-all text-[13px] text-muted">{a.email}</p>
                </div>
                {!cancelled && (
                  <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => remove(a)} disabled={busyId === a.id}>
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
