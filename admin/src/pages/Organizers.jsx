import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import { plural } from "../lib/format.js";
import Badge from "../components/Badge.jsx";
import Banner from "../components/Banner.jsx";

export const pctLabel = (v) => (v === null || v === undefined ? "Sin definir" : `${Number(v)} %`);

function NewOrganizerForm({ onCreated, onCancel }) {
  const [f, setF] = useState({ name: "", contactName: "", contactEmail: "", contactPhone: "", pct: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = "Escribe el nombre de la organización.";
    if (f.contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(f.contactEmail.trim())) er.contactEmail = "Escribe un correo válido.";
    if (f.pct.trim() !== "" && !(Number(f.pct) >= 0 && Number(f.pct) <= 100)) er.pct = "Debe estar entre 0 y 100.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true); setError("");
    const body = { name: f.name.trim() };
    if (f.contactName.trim()) body.contactName = f.contactName.trim();
    if (f.contactEmail.trim()) body.contactEmail = f.contactEmail.trim();
    if (f.contactPhone.trim()) body.contactPhone = f.contactPhone.trim();
    if (f.pct.trim() !== "") body.defaultCommissionPct = Number(f.pct);
    try {
      const { data } = await api.post("/organizers", body);
      onCreated(data);
    } catch (err) {
      setError(errorMessage(err, "No se pudo crear el organizador."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-2xl font-semibold">Nuevo organizador</h2>
      <fieldset disabled={busy} className="mt-4 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="o-name" className="field-label">Nombre de la organización</label>
          <input id="o-name" className="input" value={f.name} onChange={set("name")} />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="o-contact" className="field-label">Persona de contacto</label>
          <input id="o-contact" className="input" value={f.contactName} onChange={set("contactName")} />
        </div>
        <div>
          <label htmlFor="o-phone" className="field-label">Teléfono</label>
          <input id="o-phone" className="input" inputMode="tel" value={f.contactPhone} onChange={set("contactPhone")} />
        </div>
        <div>
          <label htmlFor="o-email" className="field-label">Correo de contacto</label>
          <input id="o-email" type="email" className="input" value={f.contactEmail} onChange={set("contactEmail")} />
          {errors.contactEmail && <p className="field-error">{errors.contactEmail}</p>}
        </div>
        <div>
          <label htmlFor="o-pct" className="field-label">Comisión por defecto (%)</label>
          <input id="o-pct" type="number" step="0.01" min="0" max="100" inputMode="decimal" className="input w-32" value={f.pct} onChange={set("pct")} />
          <p className="field-hint">Opcional. Cada evento nuevo guarda una copia de este valor.</p>
          {errors.pct && <p className="field-error">{errors.pct}</p>}
        </div>
      </fieldset>
      {error && <div className="mt-5"><Banner tone="bad">{error}</Banner></div>}
      <div className="mt-6 flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creando…" : "Crear organizador"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </form>
  );
}

export default function Organizers() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");

  const load = () =>
    api.get("/organizers").then((r) => setList(r.data)).catch((e) => setError(errorMessage(e, "No se pudieron cargar los organizadores.")));
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl font-semibold leading-none">Organizadores</h1>
        {!creating && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Nuevo organizador</button>}
      </div>
      <p className="mt-3 max-w-xl text-[15px] text-muted">
        Quienes usan la plataforma para vender sus eventos. Cada uno ve solo lo suyo.
      </p>

      {notice && <div className="mt-6"><Banner onClose={() => setNotice("")}>{notice}</Banner></div>}
      {creating && (
        <NewOrganizerForm
          onCancel={() => setCreating(false)}
          onCreated={(o) => { setCreating(false); setNotice(`Se creó ${o.name}. Ahora agrégale una cuenta de administrador.`); load(); }}
        />
      )}
      {error && <div className="mt-6"><Banner tone="bad">{error}</Banner></div>}
      {!list && !error && <p className="mt-10 text-muted">Cargando…</p>}

      {list && list.length === 0 && (
        <p className="mt-8 rounded-lg border border-dashed border-line px-6 py-12 text-center text-[15px] text-muted">
          Todavía no hay organizadores.
        </p>
      )}
      {list && list.length > 0 && (
        <ul className="mt-8 divide-y divide-line rounded-lg border border-line bg-surface">
          {list.map((o) => (
            <li key={o.id} className={`relative flex flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4 transition-colors hover:bg-raised/50 ${o.isActive ? "" : "opacity-60"}`}>
              <div className="min-w-0">
                <h2 className="flex flex-wrap items-center gap-2.5 font-display text-2xl font-semibold leading-tight">
                  <Link to={`/organizadores/${o.id}`} className="after:absolute after:inset-0 hover:text-lamp">{o.name}</Link>
                  {!o.isActive && <Badge tone="bad">Inactivo</Badge>}
                  {o.staffPending > 0 && <Badge tone="warn">{plural(o.staffPending, "persona por aprobar", "personas por aprobar")}</Badge>}
                </h2>
                <p className="text-[13px] text-muted">{o.contactName || o.contactEmail || "Sin contacto registrado"}</p>
              </div>
              <dl className="flex gap-6 text-sm">
                <div><dt className="text-muted">Eventos</dt><dd className="font-medium">{o.eventCount}</dd></div>
                <div><dt className="text-muted">Cuentas</dt><dd className="font-medium">{o.adminCount}</dd></div>
                <div><dt className="text-muted">Puerta</dt><dd className="font-medium">{o.staffCount}</dd></div>
                <div><dt className="text-muted">Comisión</dt><dd className="font-medium">{pctLabel(o.defaultCommissionPct)}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
