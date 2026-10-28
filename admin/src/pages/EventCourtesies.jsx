import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import { fmtDateTime, plural } from "../lib/format.js";

// Dónde vive el sitio público (el invitado abre ahí su enlace)
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL || "http://localhost:5173").replace(/\/$/, "");
const linkFor = (c) => `${PUBLIC_URL}/cortesia/${c.accessToken}`;

function LinkActions({ c }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(linkFor(c));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia el enlace:", linkFor(c));
    }
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px]">
      <button type="button" onClick={copy} className="font-medium text-lamp underline underline-offset-4">
        {copied ? "Enlace copiado" : "Copiar enlace"}
      </button>
      <a href={linkFor(c)} target="_blank" rel="noreferrer" className="text-muted underline underline-offset-4 hover:text-ink">
        Ver y descargar
      </a>
    </div>
  );
}

export default function EventCourtesies() {
  const { ev, inv, reload, flash } = useOutletContext();
  const cancelled = ev.status === "CANCELADO";
  const tiers = inv.tiers.filter((t) => t.kind === "CORTESIA");
  const withStock = tiers.filter((t) => t.tickets.disponibles > 0);

  const [list, setList] = useState(null);
  const [listError, setListError] = useState("");
  const [form, setForm] = useState({ tierId: "", recipientName: "", recipientEmail: "", reason: "", quantity: "1" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const loadList = useCallback(() => {
    api.get(`/events/${ev.id}/courtesies`)
      .then((r) => { setList(r.data); setListError(""); })
      .catch((e) => setListError(errorMessage(e, "No se pudo cargar el listado.")));
  }, [ev.id]);
  useEffect(loadList, [loadList]);

  // Si hay un solo tier con tickets, queda elegido
  useEffect(() => {
    if (!form.tierId && withStock.length === 1) setForm((f) => ({ ...f, tierId: withStock[0].id }));
  }, [withStock.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const chosen = tiers.find((t) => t.id === form.tierId);

  async function submit(e) {
    e.preventDefault();
    const er = {};
    const q = Number(form.quantity);
    if (!form.tierId) er.tierId = "Elige de qué tier salen las cortesías.";
    if (form.recipientName.trim().length < 2) er.recipientName = "Escribe el nombre de quien las recibe.";
    if (!/^\S+@\S+\.\S+$/.test(form.recipientEmail.trim())) er.recipientEmail = "Escribe un correo válido.";
    if (!Number.isInteger(q) || q < 1) er.quantity = "Indica cuántas entradas (mínimo 1).";
    else if (chosen && q > chosen.tickets.disponibles) er.quantity = `En ese tier solo quedan ${chosen.tickets.disponibles}.`;
    setErrors(er);
    if (Object.keys(er).length) return;

    setBusy(true);
    setFormError("");
    try {
      const body = { recipientName: form.recipientName.trim(), recipientEmail: form.recipientEmail.trim(), quantity: q };
      if (form.reason.trim()) body.reason = form.reason.trim();
      await api.post(`/tiers/${form.tierId}/courtesies`, body);
      flash({ title: `Se emitieron ${plural(q, "cortesía", "cortesías")} para ${body.recipientName}` });
      setForm((f) => ({ ...f, recipientName: "", recipientEmail: "", reason: "", quantity: "1" }));
      await Promise.all([reload(), loadList()]);
    } catch (err) {
      setFormError(errorMessage(err, "No se pudo emitir la cortesía."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[360px_1fr]">
      <section aria-labelledby="emit-title">
        <h2 id="emit-title" className="font-display text-3xl font-semibold leading-none">Emitir cortesías</h2>

        {cancelled ? (
          <p className="mt-4 text-[15px] text-muted">El evento está cancelado: ya no se pueden emitir.</p>
        ) : tiers.length === 0 ? (
          <div className="mt-4 text-[15px] leading-relaxed text-muted">
            <p>Las cortesías salen de un tier de tipo Cortesía. Este evento todavía no tiene ninguno.</p>
            <Link to=".." relative="path" className="mt-3 inline-block font-medium text-lamp underline underline-offset-4">
              Crear uno en Entradas
            </Link>
          </div>
        ) : withStock.length === 0 ? (
          <div className="mt-4 text-[15px] leading-relaxed text-muted">
            <p>Los tiers de cortesía no tienen tickets disponibles.</p>
            <Link to=".." relative="path" className="mt-3 inline-block font-medium text-lamp underline underline-offset-4">
              Asignar tickets en Entradas
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-5 space-y-5">
            <fieldset disabled={busy} className="space-y-5">
              <div>
                <label htmlFor="c-tier" className="field-label">Tier</label>
                <select id="c-tier" className="input" value={form.tierId} onChange={set("tierId")}>
                  <option value="">Elige un tier</option>
                  {withStock.map((t) => <option key={t.id} value={t.id}>{t.name}, quedan {t.tickets.disponibles}</option>)}
                </select>
                {errors.tierId && <p className="field-error">{errors.tierId}</p>}
              </div>
              <div>
                <label htmlFor="c-name" className="field-label">Nombre de quien recibe</label>
                <input id="c-name" className="input" value={form.recipientName} onChange={set("recipientName")} placeholder="Carla Mamani" />
                {errors.recipientName && <p className="field-error">{errors.recipientName}</p>}
              </div>
              <div>
                <label htmlFor="c-email" className="field-label">Correo</label>
                <input id="c-email" type="email" className="input" value={form.recipientEmail} onChange={set("recipientEmail")} placeholder="carla@correo.com" />
                {errors.recipientEmail && <p className="field-error">{errors.recipientEmail}</p>}
              </div>
              <div>
                <label htmlFor="c-reason" className="field-label">Motivo</label>
                <input id="c-reason" className="input" value={form.reason} onChange={set("reason")} placeholder="Prensa, banda invitada, sorteo…" />
                <p className="field-hint">Opcional. Queda registrado.</p>
              </div>
              <div>
                <label htmlFor="c-qty" className="field-label">Cantidad de entradas</label>
                <input id="c-qty" type="number" min="1" inputMode="numeric" className="input w-28" value={form.quantity} onChange={set("quantity")} />
                {errors.quantity && <p className="field-error">{errors.quantity}</p>}
              </div>
            </fieldset>
            {formError && <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-[15px] text-bad">{formError}</p>}
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Emitiendo…" : "Emitir cortesía"}</button>
            <p className="field-hint">
              El sistema todavía no envía el correo. Copia el enlace de la cortesía emitida y mándaselo al invitado: desde ahí ve y descarga sus entradas (PNG y PDF).
            </p>
          </form>
        )}
      </section>

      <section aria-labelledby="issued-title" className="min-w-0">
        <h2 id="issued-title" className="font-display text-3xl font-semibold leading-none">Emitidas</h2>
        {listError && <p role="alert" className="field-error">{listError}</p>}
        {!list && !listError && <p className="mt-4 text-muted">Cargando…</p>}
        {list && list.length === 0 && (
          <p className="mt-4 rounded-lg border border-dashed border-line px-6 py-10 text-center text-[15px] text-muted">
            Aún no emitiste cortesías para este evento.
          </p>
        )}
        {list && list.length > 0 && (
          <ul className="mt-5 divide-y divide-line rounded-lg border border-line bg-surface">
            {list.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-5 py-4">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">{c.recipientName}</p>
                  <p className="break-all text-[13px] text-muted">{c.recipientEmail}</p>
                  {c.reason && <p className="mt-1 text-[13px]">Motivo: {c.reason}</p>}
                  <LinkActions c={c} />
                </div>
                <div className="text-right text-[13px] text-muted">
                  <p className="text-[15px] font-medium text-ink">{plural(c.quantity, "entrada", "entradas")}</p>
                  <p>{c.tierName} · {c.used > 0 ? `${c.used} ya ingres${c.used === 1 ? "ó" : "aron"}` : "sin ingresar"}</p>
                  <p>{fmtDateTime(c.createdAt)} por {c.issuedByName}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
