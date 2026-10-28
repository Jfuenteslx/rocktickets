import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import { fmtDateTime } from "../lib/format.js";
import Badge from "../components/Badge.jsx";
import Banner from "../components/Banner.jsx";

function EditForm({ org, onSaved }) {
  const [f, setF] = useState({
    name: org.name, contactName: org.contactName ?? "", contactEmail: org.contactEmail ?? "",
    contactPhone: org.contactPhone ?? "", pct: org.defaultCommissionPct ?? "",
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = "Escribe el nombre de la organización.";
    if (f.contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(f.contactEmail.trim())) er.contactEmail = "Escribe un correo válido.";
    if (String(f.pct).trim() !== "" && !(Number(f.pct) >= 0 && Number(f.pct) <= 100)) er.pct = "Debe estar entre 0 y 100.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true); setError("");
    const body = { name: f.name.trim() };
    if (f.contactName.trim()) body.contactName = f.contactName.trim();
    if (f.contactEmail.trim()) body.contactEmail = f.contactEmail.trim();
    if (f.contactPhone.trim()) body.contactPhone = f.contactPhone.trim();
    if (String(f.pct).trim() !== "") body.defaultCommissionPct = Number(f.pct);
    try {
      await api.patch(`/organizers/${org.id}`, body);
      await onSaved("Datos guardados");
    } catch (err) {
      setError(errorMessage(err, "No se pudo guardar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset disabled={busy} className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="e-name" className="field-label">Nombre</label>
          <input id="e-name" className="input" value={f.name} onChange={set("name")} />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="e-contact" className="field-label">Persona de contacto</label>
          <input id="e-contact" className="input" value={f.contactName} onChange={set("contactName")} />
        </div>
        <div>
          <label htmlFor="e-phone" className="field-label">Teléfono</label>
          <input id="e-phone" className="input" value={f.contactPhone} onChange={set("contactPhone")} />
        </div>
        <div>
          <label htmlFor="e-email" className="field-label">Correo de contacto</label>
          <input id="e-email" type="email" className="input" value={f.contactEmail} onChange={set("contactEmail")} />
          {errors.contactEmail && <p className="field-error">{errors.contactEmail}</p>}
        </div>
        <div>
          <label htmlFor="e-pct" className="field-label">Comisión por defecto (%)</label>
          <input id="e-pct" type="number" step="0.01" min="0" max="100" className="input w-32" value={f.pct} onChange={set("pct")} />
          <p className="field-hint">Solo afecta a eventos nuevos. Los ya creados conservan su comisión.</p>
          {errors.pct && <p className="field-error">{errors.pct}</p>}
        </div>
      </fieldset>
      {error && <Banner tone="bad">{error}</Banner>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
    </form>
  );
}

function AdminForm({ orgId, onCreated }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); };

  async function submit(e) {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 2) er.name = "Escribe el nombre.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = "Escribe un correo válido.";
    if (f.password.length < 8) er.password = "Mínimo 8 caracteres.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true); setError("");
    try {
      await api.post(`/organizers/${orgId}/admins`, { name: f.name.trim(), email: f.email.trim(), password: f.password });
      setF({ name: "", email: "", password: "" });
      await onCreated(`Se creó la cuenta de ${f.name.trim()}`);
    } catch (err) {
      setError(errorMessage(err, "No se pudo crear la cuenta."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-5 rounded-md border border-line bg-bg p-4">
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="a-name" className="field-label">Nombre</label>
          <input id="a-name" className="input" value={f.name} onChange={set("name")} />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="a-email" className="field-label">Correo (para entrar)</label>
          <input id="a-email" type="email" className="input" value={f.email} onChange={set("email")} />
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="a-pass" className="field-label">Contraseña inicial</label>
          <input id="a-pass" type="text" autoComplete="off" className="input" value={f.password} onChange={set("password")} />
          {errors.password && <p className="field-error">{errors.password}</p>}
        </div>
      </fieldset>
      {error && <div className="mt-4"><Banner tone="bad">{error}</Banner></div>}
      <button type="submit" className="btn btn-primary mt-4" disabled={busy}>{busy ? "Creando…" : "Crear cuenta"}</button>
    </form>
  );
}

export default function OrganizerDetail() {
  const { id } = useParams();
  const [org, setOrg] = useState(undefined); // undefined = cargando, null = no existe
  const [admins, setAdmins] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [orgs, adm] = await Promise.all([api.get("/organizers"), api.get(`/organizers/${id}/admins`)]);
      setOrg(orgs.data.find((o) => o.id === id) ?? null);
      setAdmins(adm.data);
    } catch (e) {
      if (e.response?.status === 404) setOrg(null);
      else setError(errorMessage(e, "No se pudo cargar el organizador."));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const done = async (msg) => { setNotice(msg); await load(); };

  async function toggleOrg() {
    setBusyId("org"); setError("");
    try {
      await api.patch(`/organizers/${id}`, { isActive: !org.isActive });
      await done(org.isActive ? "Organizador desactivado: sus cuentas ya no pueden entrar." : "Organizador activado.");
    } catch (e) { setError(errorMessage(e)); } finally { setBusyId(null); }
  }
  async function toggleAdmin(a) {
    setBusyId(a.id); setError("");
    try {
      await api.patch(`/organizers/${id}/admins/${a.id}/active`, { isActive: !a.isActive });
      await done(a.isActive ? `${a.name} ya no puede entrar.` : `${a.name} puede entrar de nuevo.`);
    } catch (e) { setError(errorMessage(e)); } finally { setBusyId(null); }
  }

  if (org === undefined && !error) return <p className="text-muted">Cargando…</p>;
  if (org === null) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-4xl font-semibold">No encontramos este organizador</p>
        <Link to="/organizadores" className="btn btn-quiet mt-6">Volver a organizadores</Link>
      </div>
    );
  }
  if (!org) return <Banner tone="bad">{error}</Banner>;

  return (
    <div>
      <Link to="/organizadores" className="text-sm text-muted hover:text-ink">← Organizadores</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h1 className="flex flex-wrap items-center gap-3 font-display text-5xl font-semibold leading-none">
          {org.name} {!org.isActive && <Badge tone="bad">Inactivo</Badge>}
        </h1>
        <button type="button" className="btn btn-quiet" onClick={toggleOrg} disabled={busyId === "org"}>
          {org.isActive ? "Desactivar organizador" : "Activar organizador"}
        </button>
      </div>
      <p className="mt-3 text-[15px] text-muted">
        {org.eventCount} {org.eventCount === 1 ? "evento" : "eventos"} · {org.staffCount} en puerta
        {org.staffPending > 0 && <> · <Link to={`/personal?organizador=${org.id}`} className="font-medium text-warn underline underline-offset-4">{org.staffPending} por aprobar</Link></>}
      </p>

      <div className="mt-6 space-y-4">
        {notice && <Banner onClose={() => setNotice("")}>{notice}</Banner>}
        {error && <Banner tone="bad">{error}</Banner>}
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="datos">
          <h2 id="datos" className="mb-5 font-display text-3xl font-semibold leading-none">Datos</h2>
          <EditForm key={[org.name, org.contactName, org.contactEmail, org.contactPhone, org.defaultCommissionPct].join("|")} org={org} onSaved={done} />
        </section>

        <section aria-labelledby="cuentas">
          <h2 id="cuentas" className="font-display text-3xl font-semibold leading-none">Cuentas de administrador</h2>
          <p className="mt-2 text-[15px] text-muted">Entran al panel y gestionan los eventos de esta organización.</p>
          {admins.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-line px-5 py-8 text-center text-[15px] text-muted">
              Aún no tiene cuentas: sin ellas nadie de esta organización puede entrar.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
              {admins.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[15px] font-medium">{a.name} {!a.isActive && <Badge tone="bad">Sin acceso</Badge>}</p>
                    <p className="break-all text-[13px] text-muted">{a.email} · creada {fmtDateTime(a.createdAt)}</p>
                  </div>
                  <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => toggleAdmin(a)} disabled={busyId === a.id}>
                    {a.isActive ? "Quitar acceso" : "Dar acceso"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AdminForm orgId={id} onCreated={done} />
        </section>
      </div>
    </div>
  );
}
