import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { API_URL, errorMessage } from "../lib/api.js";
import { fmtFull } from "../lib/format.js";

function Row({ label, children }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-6">
      <dt className="text-[15px] text-muted">{label}</dt>
      <dd className="min-w-0 text-[15px] leading-relaxed">{children}</dd>
    </div>
  );
}

export default function EventDetails() {
  const { ev, reload, flash } = useOutletContext();
  const cancelled = ev.status === "CANCELADO";
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancelEvent() {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/events/${ev.id}/cancel`);
      flash({ title: "Evento cancelado", detail: "Dejó de venderse. Las órdenes y los tickets existentes se conservan." });
      setConfirming(false);
      await reload();
    } catch (err) {
      setError(errorMessage(err, "No se pudo cancelar el evento."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-3xl font-semibold leading-none">Datos del evento</h2>
          {!cancelled && <Link to="../editar" relative="path" className="btn btn-quiet !py-1.5 !text-sm">Editar</Link>}
        </div>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          <Row label="Empieza"><span className="capitalize">{fmtFull(ev.startsAt)}</span></Row>
          <Row label="Termina"><span className="capitalize">{fmtFull(ev.endsAt)}</span></Row>
          <Row label="Local">{ev.venueName}</Row>
          <Row label="Organiza">{ev.organizerName}</Row>
          <Row label="Descripción">
            {ev.description ? <span className="whitespace-pre-line">{ev.description}</span> : <span className="text-muted">Sin descripción.</span>}
          </Row>
          <Row label="Comisión de Rocktickets">
            {ev.commissionPct != null ? `${Number(ev.commissionPct)} % de las ventas` : <span className="text-muted">Sin definir todavía.</span>}
          </Row>
        </dl>

        {!cancelled && (
          <section className="mt-12" aria-labelledby="danger-title">
            <h2 id="danger-title" className="font-display text-3xl font-semibold leading-none">Cancelar el evento</h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              El evento deja de venderse y ya no se puede modificar. Las órdenes, los pagos y los tickets existentes se conservan: no se devuelve dinero de forma automática. Esta acción no se deshace.
            </p>
            {!confirming ? (
              <button type="button" className="btn btn-quiet mt-4 !border-bad/50 !text-bad hover:!bg-bad/10" onClick={() => setConfirming(true)}>
                Cancelar evento
              </button>
            ) : (
              <div className="mt-4 rounded-md border border-bad/50 bg-bad/10 p-4">
                <p className="text-[15px] font-medium">¿Cancelar «{ev.name}»?</p>
                <div className="mt-3 flex gap-3">
                  <button type="button" className="btn !bg-bad !text-white hover:!bg-[#ED8581]" onClick={cancelEvent} disabled={busy}>
                    {busy ? "Cancelando…" : "Sí, cancelar evento"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>No, volver</button>
                </div>
                {error && <p role="alert" className="field-error">{error}</p>}
              </div>
            )}
          </section>
        )}
      </div>

      <aside>
        {ev.imageUrl ? (
          <img src={`${API_URL}${ev.imageUrl}`} alt={`Imagen de ${ev.name}`} className="aspect-[4/5] w-full rounded-lg border border-line object-cover" />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg border border-dashed border-line px-4 text-center text-[13px] text-muted">
            Sin imagen. Agrégala desde Editar.
          </div>
        )}
      </aside>
    </div>
  );
}
