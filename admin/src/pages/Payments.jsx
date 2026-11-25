import { useCallback, useEffect, useState } from "react";
import api, { errorMessage } from "../lib/api.js";
import { fmtBs, fmtDateTime, plural } from "../lib/format.js";
import Badge from "../components/Badge.jsx";
import Banner from "../components/Banner.jsx";

const TABS = [
  ["EN_REVISION", "Por verificar"],
  ["CONFIRMADO", "Aprobados"],
  ["RECHAZADO", "Rechazados"],
  ["EXPIRADO", "Vencidos"],
];

// Número para WhatsApp: solo dígitos; los de 8 dígitos son bolivianos (prefijo 591)
function whatsappLink(phone) {
  let d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 8) d = `591${d}`;
  return d.length >= 8 ? `https://wa.me/${d}` : null;
}

function PaymentCard({ p, tab, onDone }) {
  const [step, setStep] = useState(null); // null | "approve" | "reject"
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const wa = whatsappLink(p.payerPhone);

  async function run(kind) {
    setBusy(true);
    setErr("");
    try {
      const { data } = await api.post(`/payments/manual/${p.id}/${kind}`, kind === "reject" ? { reason: reason.trim() || undefined } : {});
      onDone(kind, data, p);
    } catch (e) {
      setErr(errorMessage(e, "No se pudo completar la acción."));
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 text-[14px]">
          <p className="text-[16px] font-medium">
            {p.payerName} <span className="font-normal text-muted">· #{p.ref}</span>
          </p>
          <p className="mt-1 break-all">
            <a href={`mailto:${p.payerEmail}`} className="text-lamp underline underline-offset-4">{p.payerEmail}</a>
          </p>
          <p className="mt-0.5">
            <a href={`tel:${p.payerPhone}`} className="text-lamp underline underline-offset-4">{p.payerPhone}</a>
            {wa && (
              <> · <a href={wa} target="_blank" rel="noreferrer" className="text-lamp underline underline-offset-4">WhatsApp</a></>
            )}
          </p>
          <p className="mt-2 text-muted">{p.eventName} · {fmtDateTime(p.eventStartsAt)}</p>
          <p className="text-muted">
            {plural(p.tickets, "entrada", "entradas")}
            {p.detail ? ` · ${p.detail}` : ""}
            {p.tables > 0 ? ` · ${plural(p.tables, "mesa", "mesas")}` : ""}
          </p>
        </div>

        <div className="text-right">
          <p className="font-display text-3xl font-semibold tabular-nums">{fmtBs(p.amount)}</p>
          <p className="mt-1 text-[12px] text-muted">Avisó el {p.declaredAt ? fmtDateTime(p.declaredAt) : "—"}</p>
          {tab === "EN_REVISION" && <p className="text-[12px] text-warn">Se libera el {fmtDateTime(p.holdUntil)} si no lo resuelves</p>}
          {tab === "CONFIRMADO" && <Badge tone="ok">Aprobado {p.reviewedAt ? fmtDateTime(p.reviewedAt) : ""}</Badge>}
          {tab === "RECHAZADO" && <Badge tone="bad">Rechazado {p.reviewedAt ? fmtDateTime(p.reviewedAt) : ""}</Badge>}
          {tab === "EXPIRADO" && <Badge tone="quiet">Venció sin resolver</Badge>}
        </div>
      </div>

      {tab === "RECHAZADO" && p.reviewNote && <p className="mt-3 text-[14px] text-muted">Motivo: {p.reviewNote}</p>}

      {tab === "EN_REVISION" && (
        <div className="mt-4 border-t border-line pt-4">
          {step === null && (
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" onClick={() => setStep("approve")}>Aprobar y enviar entradas</button>
              <button type="button" className="btn btn-quiet" onClick={() => setStep("reject")}>Rechazar</button>
            </div>
          )}

          {step === "approve" && (
            <div>
              <p className="text-[14px]">
                ¿Ya viste el depósito de <strong>{fmtBs(p.amount)}</strong> en tu banco? Se enviarán las entradas a <strong>{p.payerEmail}</strong> y no se puede deshacer.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" disabled={busy} className="btn btn-primary" onClick={() => run("approve")}>
                  {busy ? "Aprobando…" : "Sí, aprobar"}
                </button>
                <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => setStep(null)}>Cancelar</button>
              </div>
            </div>
          )}

          {step === "reject" && (
            <div>
              <label htmlFor={`reason-${p.id}`} className="field-label">Motivo (se le envía al comprador)</label>
              <input
                id={`reason-${p.id}`}
                className="input"
                maxLength={300}
                placeholder="Ej.: No encontramos el depósito"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="field-hint">Al rechazar, las entradas vuelven a la venta y el comprador recibe un correo.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button type="button" disabled={busy} className="btn btn-quiet" onClick={() => run("reject")}>
                  {busy ? "Rechazando…" : "Rechazar pago"}
                </button>
                <button type="button" disabled={busy} className="btn btn-ghost" onClick={() => setStep(null)}>Cancelar</button>
              </div>
            </div>
          )}
          {err && <p role="alert" className="field-error">{err}</p>}
        </div>
      )}
    </li>
  );
}

// Bandeja de pagos avisados por los compradores (solo superadmin)
export default function Payments() {
  const [tab, setTab] = useState("EN_REVISION");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState(null); // { tone, text }

  const load = useCallback(() => {
    return api
      .get("/payments/manual", { params: { status: tab } })
      .then((r) => { setRows(r.data); setErr(""); })
      .catch((e) => setErr(errorMessage(e, "No se pudo cargar la lista.")));
  }, [tab]);

  useEffect(() => {
    setRows(null);
    load();
    // Los pagos nuevos aparecen solos
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  function onDone(kind, data, p) {
    if (kind === "approve" && data.outcome === "CONFIRMADO_SIN_ORDEN") {
      setNotice({
        tone: "bad",
        text: `El pago de ${p.payerName} (#${p.ref}) quedó registrado pero la reserva ya había vencido: las entradas no se pudieron entregar. Devuélvele el dinero o contáctalo.`,
      });
    } else if (kind === "approve") {
      setNotice({ tone: "ok", text: `Pago de ${p.payerName} aprobado: le enviamos las entradas a ${p.payerEmail}.` });
    } else {
      setNotice({ tone: "ok", text: `Pago de ${p.payerName} rechazado: las entradas volvieron a la venta.` });
    }
    load();
    window.dispatchEvent(new Event("payments-changed"));
  }

  return (
    <div>
      <h1 className="font-display text-4xl font-semibold leading-none">Pagos</h1>
      <p className="mt-2 text-[15px] text-muted">
        Compradores que avisaron que pagaron con el QR. Verifica el depósito en tu banco y apruébalo para que reciban sus entradas.
      </p>

      <div className="mt-6 flex flex-wrap gap-1 border-b border-line" role="tablist" aria-label="Estado del pago">
        {TABS.map(([key, label]) => (
          <button
            key={key} type="button" role="tab" aria-selected={tab === key}
            onClick={() => { setTab(key); setNotice(null); }}
            className={`border-b-2 px-3 py-2 text-[15px] font-medium transition-colors ${tab === key ? "border-lamp text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && <div className="mt-5"><Banner tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Banner></div>}
      {err && <p role="alert" className="field-error mt-6">{err}</p>}
      {!rows && !err && <p className="mt-6 text-muted">Cargando…</p>}

      {rows && rows.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-line px-6 py-12 text-center text-[15px] text-muted">
          {tab === "EN_REVISION" ? "No hay pagos por verificar." : "No hay pagos en esta lista."}
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="mt-6 space-y-4">
          {rows.map((p) => <PaymentCard key={p.id} p={p} tab={tab} onDone={onDone} />)}
        </ul>
      )}
    </div>
  );
}
