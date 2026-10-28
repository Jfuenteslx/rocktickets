import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import { fmtMoney, fmtWindow, fromLocalInput, plural, toLocalInput } from "../lib/format.js";
import Badge from "../components/Badge.jsx";

const ESTADO = {
  ABIERTO: { tone: "ok", label: "Abierto" },
  PAUSADO: { tone: "warn", label: "Pausado" },
  AGOTADO: { tone: "bad", label: "Agotado" },
  PROGRAMADO: { tone: "info", label: "Programado" },
  CERRADO: { tone: "quiet", label: "Cerrado" },
  SIN_TICKETS: { tone: "quiet", label: "Sin tickets" },
};

function Stat({ label, value }) {
  return (
    <div>
      <dd className="font-display text-2xl font-semibold leading-none">{value}</dd>
      <dt className="mt-1 text-[13px] text-muted">{label}</dt>
    </div>
  );
}

// Reparte tickets del sector a un tier (o los devuelve)
function AssignForm({ tier, sector, onDone, onCancel }) {
  const [mode, setMode] = useState("add");
  const [qty, setQty] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const max = mode === "add" ? sector.libres : tier.tickets.disponibles;
  const n = Number(qty);
  const valid = Number.isInteger(n) && n >= 1 && n <= max;

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/tiers/${tier.id}/assign`, { quantity: mode === "add" ? n : -n });
      await onDone(mode === "add" ? `Se agregaron ${plural(n, "ticket", "tickets")} a ${tier.name}` : `Se devolvieron ${plural(n, "ticket", "tickets")} de ${tier.name}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 rounded-md border border-line bg-bg p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div role="radiogroup" aria-label="Qué hacer con los tickets" className="inline-flex rounded-md border border-line p-0.5">
          {[["add", "Agregar"], ["remove", "Devolver"]].map(([v, l]) => (
            <button
              key={v} type="button" role="radio" aria-checked={mode === v}
              onClick={() => { setMode(v); setError(""); }}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${mode === v ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}
            >{l}</button>
          ))}
        </div>
        <div>
          <label htmlFor={`qty-${tier.id}`} className="field-label">Cantidad</label>
          <input
            id={`qty-${tier.id}`} type="number" min="1" max={max} inputMode="numeric" className="input w-28"
            value={qty} onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
          {busy ? "Guardando…" : mode === "add" ? "Agregar tickets" : "Devolver tickets"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">Cancelar</button>
      </div>
      <p className="field-hint">
        {mode === "add"
          ? `Salen de los ${sector.libres} tickets sin asignar de ${sector.name}.`
          : `Solo se pueden devolver los disponibles: ${tier.tickets.disponibles}. Los vendidos y reservados no se mueven.`}
      </p>
      {n > max && <p className="field-error">{max === 0 ? (mode === "add" ? "No quedan tickets sin asignar en este sector." : "Este tier no tiene tickets disponibles para devolver.") : `El máximo es ${max}.`}</p>}
      {error && <p role="alert" className="field-error">{error}</p>}
    </form>
  );
}

function EditTierForm({ tier, onCancel, onDone }) {
  const courtesy = tier.kind === "CORTESIA";
  const [form, setForm] = useState({
    name: tier.name,
    price: String(Number(tier.price)),
    startsAt: toLocalInput(tier.startsAt),
    endsAt: toLocalInput(tier.endsAt),
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const sold = tier.tickets.vendidos + tier.tickets.reservados;

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (!form.name.trim()) er.name = "El tier necesita un nombre.";
    if (!courtesy && (form.price === "" || Number(form.price) < 0 || Number.isNaN(Number(form.price)))) er.price = "Indica el precio en bolivianos (0 si es gratis).";
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) er.endsAt = "El cierre debe ser después de la apertura.";
    setErrors(er);
    if (Object.keys(er).length) return;

    const body = {};
    if (form.name.trim() !== tier.name) body.name = form.name.trim();
    if (!courtesy) {
      if (Number(form.price) !== Number(tier.price)) body.price = Number(form.price);
      if (form.startsAt !== toLocalInput(tier.startsAt)) body.startsAt = form.startsAt ? fromLocalInput(form.startsAt) : null;
      if (form.endsAt !== toLocalInput(tier.endsAt)) body.endsAt = form.endsAt ? fromLocalInput(form.endsAt) : null;
    }
    if (Object.keys(body).length === 0) return onCancel();

    setBusy(true);
    setFormError("");
    try {
      await api.patch(`/tiers/${tier.id}`, body);
      await onDone(`Se guardaron los cambios de ${form.name.trim()}`);
    } catch (err) {
      setFormError(errorMessage(err, "No se pudieron guardar los cambios."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 rounded-md border border-line bg-bg p-4">
      <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`et-name-${tier.id}`} className="field-label">Nombre</label>
          <input id={`et-name-${tier.id}`} className="input" value={form.name} onChange={set("name")} maxLength={60} />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        {!courtesy && (
          <>
            <div>
              <label htmlFor={`et-price-${tier.id}`} className="field-label">Precio por ticket (Bs)</label>
              <input id={`et-price-${tier.id}`} type="number" min="0" step="0.5" inputMode="decimal" className="input" value={form.price} onChange={set("price")} />
              {errors.price && <p className="field-error">{errors.price}</p>}
              {sold > 0 && <p className="field-hint">Quienes ya compraron o reservaron conservan el precio anterior.</p>}
            </div>
            <div>
              <label htmlFor={`et-from-${tier.id}`} className="field-label">Abre la venta</label>
              <input id={`et-from-${tier.id}`} type="datetime-local" className="input" value={form.startsAt} onChange={set("startsAt")} />
            </div>
            <div>
              <label htmlFor={`et-to-${tier.id}`} className="field-label">Cierra la venta</label>
              <input id={`et-to-${tier.id}`} type="datetime-local" className="input" value={form.endsAt} onChange={set("endsAt")} />
              {errors.endsAt && <p className="field-error">{errors.endsAt}</p>}
            </div>
            <p className="field-hint -mt-2 sm:col-span-2">Vacía una fecha para quitar ese límite (hora de La Paz).</p>
          </>
        )}
      </fieldset>
      {formError && <p role="alert" className="mt-4 rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-[15px] text-bad">{formError}</p>}
      <div className="mt-4 flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </form>
  );
}

function TierRow({ tier, sector, cancelled, startOpen, onChanged }) {
  const [assigning, setAssigning] = useState(startOpen);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isCourtesy = tier.kind === "CORTESIA";
  const t = tier.tickets;
  const pct = (x) => (t.total > 0 ? `${(x / t.total) * 100}%` : "0%");

  async function togglePause() {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/tiers/${tier.id}/paused`, { isPaused: !tier.isPaused });
      await onChanged(tier.isPaused ? `${tier.name} vuelve a estar a la venta` : `${tier.name} quedó en pausa: nadie puede comprarlo`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h4 className="font-display text-2xl font-semibold leading-tight">{tier.name}</h4>
            {isCourtesy ? <Badge tone="info">Cortesía</Badge> : <Badge tone={ESTADO[tier.estado].tone}>{ESTADO[tier.estado].label}</Badge>}
          </div>
          <p className="mt-1 text-[15px]">
            <span className="font-medium">{fmtMoney(tier.price)}</span>
            {!isCourtesy && <span className="text-muted"> por ticket · {fmtWindow(tier.startsAt, tier.endsAt)}</span>}
          </p>
        </div>
        {!cancelled && (
          <div className="flex gap-2">
            <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => { setAssigning((v) => !v); setEditing(false); }} aria-expanded={assigning}>
              Cambiar cantidad
            </button>
            <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => { setEditing((v) => !v); setAssigning(false); }} aria-expanded={editing}>
              Editar
            </button>
            {!isCourtesy && (
              <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={togglePause} disabled={busy}>
                {tier.isPaused ? "Reanudar venta" : "Pausar venta"}
              </button>
            )}
          </div>
        )}
      </div>

      {t.total > 0 ? (
        <div className="mt-4">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-raised" role="img"
            aria-label={`${t.vendidos} vendidos, ${t.reservados} reservados, ${t.disponibles} disponibles`}>
            {t.vendidos > 0 && <div className="h-full bg-lamp" style={{ width: pct(t.vendidos) }} />}
            {t.reservados > 0 && <div className="h-full bg-warn" style={{ width: pct(t.reservados) }} />}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Disponibles" value={t.disponibles} />
            <Stat label={isCourtesy ? "Emitidas" : "Vendidos"} value={t.vendidos} />
            {!isCourtesy && <Stat label="Reservados" value={t.reservados} />}
            <Stat label="Ingresaron" value={t.ingresaron} />
          </dl>
        </div>
      ) : (
        <p className="mt-3 text-[15px] text-muted">
          Este tier todavía no tiene tickets. Usa "Cambiar cantidad" para agregarlos.
        </p>
      )}

      {error && <p role="alert" className="field-error">{error}</p>}
      {editing && !cancelled && (
        <EditTierForm
          tier={tier}
          onCancel={() => setEditing(false)}
          onDone={async (msg) => { setEditing(false); await onChanged(msg); }}
        />
      )}
      {assigning && !cancelled && (
        <AssignForm
          tier={tier} sector={sector}
          onCancel={() => setAssigning(false)}
          onDone={async (msg) => { setAssigning(false); await onChanged(msg); }}
        />
      )}
    </li>
  );
}

function NewTierForm({ eventId, sector, onCreated, onCancel }) {
  const [form, setForm] = useState({ name: "", kind: "VENTA", price: "", startsAt: "", endsAt: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const courtesy = form.kind === "CORTESIA";

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (!form.name.trim()) er.name = "Ponle un nombre, por ejemplo Preventa.";
    if (!courtesy && (form.price === "" || Number(form.price) < 0 || Number.isNaN(Number(form.price)))) er.price = "Indica el precio en bolivianos (0 si es gratis).";
    if (form.startsAt && form.endsAt && new Date(form.endsAt) <= new Date(form.startsAt)) er.endsAt = "El cierre debe ser después de la apertura.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setFormError("");
    try {
      const body = { sectorId: sector.id, name: form.name.trim(), kind: form.kind, price: courtesy ? 0 : Number(form.price) };
      if (!courtesy && form.startsAt) body.startsAt = fromLocalInput(form.startsAt);
      if (!courtesy && form.endsAt) body.endsAt = fromLocalInput(form.endsAt);
      const { data } = await api.post(`/events/${eventId}/tiers`, body);
      await onCreated(data.id, `Se creó el tier ${data.name}`);
    } catch (err) {
      setFormError(errorMessage(err, "No se pudo crear el tier."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-md border border-lamp/50 bg-surface p-5">
      <h4 className="font-display text-2xl font-semibold">Nuevo tier en {sector.name}</h4>
      <p className="mt-1 text-[13px] text-muted">Un tier es un precio y un periodo de venta. Después le asignas tickets.</p>
      <fieldset disabled={busy} className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="tier-name" className="field-label">Nombre</label>
          <input id="tier-name" className="input" value={form.name} onChange={set("name")} placeholder="Preventa" maxLength={60} autoFocus />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div>
          <span className="field-label">Tipo</span>
          <div role="radiogroup" aria-label="Tipo de tier" className="inline-flex rounded-md border border-line p-0.5">
            {[["VENTA", "Venta"], ["CORTESIA", "Cortesía"]].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={form.kind === v}
                onClick={() => setForm((f) => ({ ...f, kind: v }))}
                className={`rounded px-4 py-2 text-sm font-medium transition-colors ${form.kind === v ? "bg-raised text-ink" : "text-muted hover:text-ink"}`}>{l}</button>
            ))}
          </div>
          <p className="field-hint">{courtesy ? "Las cortesías son gratis y solo las emites tú." : "Se vende al público."}</p>
        </div>
        {!courtesy && (
          <>
            <div>
              <label htmlFor="tier-price" className="field-label">Precio por ticket (Bs)</label>
              <input id="tier-price" type="number" min="0" step="0.5" inputMode="decimal" className="input" value={form.price} onChange={set("price")} placeholder="25" />
              {errors.price && <p className="field-error">{errors.price}</p>}
            </div>
            <div className="hidden sm:block" />
            <div>
              <label htmlFor="tier-from" className="field-label">Abre la venta</label>
              <input id="tier-from" type="datetime-local" className="input" value={form.startsAt} onChange={set("startsAt")} />
            </div>
            <div>
              <label htmlFor="tier-to" className="field-label">Cierra la venta</label>
              <input id="tier-to" type="datetime-local" className="input" value={form.endsAt} onChange={set("endsAt")} />
              {errors.endsAt && <p className="field-error">{errors.endsAt}</p>}
            </div>
            <p className="field-hint -mt-2 sm:col-span-2">Las fechas son opcionales (hora de La Paz). Sin ellas, se vende mientras haya tickets.</p>
          </>
        )}
      </fieldset>
      {formError && <p role="alert" className="mt-4 rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-[15px] text-bad">{formError}</p>}
      <div className="mt-5 flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creando…" : "Crear tier"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </form>
  );
}

export default function EventTiers() {
  const { ev, inv, reload, flash } = useOutletContext();
  const cancelled = ev.status === "CANCELADO";
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [newTierFor, setNewTierFor] = useState(null); // sectorId con el formulario abierto
  const [justCreated, setJustCreated] = useState(null); // tier recién creado: abre "Cambiar cantidad"

  const capacity = inv.sectors.reduce((a, s) => a + s.capacity, 0);
  const generated = inv.sectors.reduce((a, s) => a + s.generated, 0);
  const missing = Math.max(0, capacity - generated);

  async function generate() {
    setGenerating(true);
    setGenError("");
    try {
      const { data } = await api.post(`/events/${ev.id}/generate-tickets`);
      flash({
        title: data.created > 0 ? `Se generaron ${data.created} tickets` : "Ya estaban todos los tickets",
        detail: data.created > 0 ? "Ahora crea un tier y asígnale tickets para empezar a vender." : undefined,
      });
      await reload();
    } catch (err) {
      setGenError(errorMessage(err, "No se pudieron generar los tickets."));
    } finally {
      setGenerating(false);
    }
  }

  const changed = (title) => async (msg) => { flash({ title: msg ?? title }); await reload(); };

  // Aún no hay tickets: el primer paso es generarlos
  if (generated === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
        <p className="font-display text-3xl font-semibold">Primero, genera los tickets</p>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-muted">
          Se crea un ticket por cada lugar del aforo de {ev.venueName}:{" "}
          {inv.sectors.map((s) => `${s.name} ${s.capacity}`).join(", ")}. Después los repartes en tiers con su precio.
        </p>
        {!cancelled && (
          <button type="button" className="btn btn-primary mt-6" onClick={generate} disabled={generating}>
            {generating ? "Generando…" : `Generar ${capacity} tickets`}
          </button>
        )}
        {genError && <p role="alert" className="field-error">{genError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {missing > 0 && !cancelled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warn/40 bg-warn/10 px-4 py-3">
          <p className="text-[15px] text-warn">Faltan {plural(missing, "ticket", "tickets")} por generar: el aforo del local cambió.</p>
          <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={generate} disabled={generating}>
            {generating ? "Generando…" : "Generar los que faltan"}
          </button>
        </div>
      )}
      {genError && <p role="alert" className="field-error">{genError}</p>}

      {inv.sectors.map((sector) => {
        const tiers = inv.tiers.filter((t) => t.sectorId === sector.id);
        return (
          <section key={sector.id} aria-labelledby={`sec-${sector.id}`}>
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
              <div>
                <h3 id={`sec-${sector.id}`} className="font-display text-3xl font-semibold leading-none">{sector.name}</h3>
                <p className="mt-1.5 text-[13px] text-muted">
                  Aforo {sector.capacity} · {sector.libres} sin asignar a ningún tier (no se venden)
                </p>
              </div>
              {!cancelled && newTierFor !== sector.id && (
                <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => setNewTierFor(sector.id)}>Nuevo tier</button>
              )}
            </div>

            <div className="mt-5 space-y-4">
              {newTierFor === sector.id && (
                <NewTierForm
                  eventId={ev.id} sector={sector}
                  onCancel={() => setNewTierFor(null)}
                  onCreated={async (tierId, msg) => { setNewTierFor(null); setJustCreated(tierId); flash({ title: msg }); await reload(); }}
                />
              )}
              {tiers.length > 0 ? (
                <ul className="space-y-4">
                  {tiers.map((t) => (
                    <TierRow key={t.id} tier={t} sector={sector} cancelled={cancelled} startOpen={justCreated === t.id} onChanged={changed()} />
                  ))}
                </ul>
              ) : (
                newTierFor !== sector.id && (
                  <p className="text-[15px] text-muted">
                    Este sector todavía no tiene tiers, así que no se vende nada aquí.{" "}
                    {!cancelled && "Crea uno con su precio para empezar."}
                  </p>
                )
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
