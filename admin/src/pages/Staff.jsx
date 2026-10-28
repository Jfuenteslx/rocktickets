import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api, { errorMessage } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { fmtDateTime } from "../lib/format.js";
import Badge from "../components/Badge.jsx";
import Banner from "../components/Banner.jsx";

function StatusBadge({ s }) {
  if (s.approvalStatus === "PENDIENTE") return <Badge tone="warn">Por aprobar</Badge>;
  if (s.approvalStatus === "RECHAZADO") return <Badge tone="bad">Rechazado</Badge>;
  return s.isActive ? <Badge tone="ok">Activo</Badge> : <Badge tone="quiet">Sin acceso</Badge>;
}

function NewStaffForm({ isSuper, organizers, defaultOrg, onCreated, onCancel }) {
  const [f, setF] = useState({ name: "", email: "", password: "", organizerId: defaultOrg });
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
    const body = { name: f.name.trim(), email: f.email.trim(), password: f.password };
    if (isSuper && f.organizerId) body.organizerId = f.organizerId;
    try {
      const { data } = await api.post("/staff", body);
      onCreated(data);
    } catch (err) {
      setError(errorMessage(err, "No se pudo crear la cuenta."));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-2xl font-semibold">Nueva persona de puerta</h2>
      {!isSuper && (
        <p className="mt-1 text-[15px] text-muted">Quedará por aprobar: no podrá entrar hasta que Rocktickets la autorice.</p>
      )}
      <fieldset disabled={busy} className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="s-name" className="field-label">Nombre</label>
          <input id="s-name" className="input" value={f.name} onChange={set("name")} />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div>
          <label htmlFor="s-email" className="field-label">Correo (para entrar)</label>
          <input id="s-email" type="email" className="input" value={f.email} onChange={set("email")} />
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>
        <div>
          <label htmlFor="s-pass" className="field-label">Contraseña inicial</label>
          <input id="s-pass" type="text" autoComplete="off" className="input" value={f.password} onChange={set("password")} />
          {errors.password && <p className="field-error">{errors.password}</p>}
        </div>
        {isSuper && (
          <div>
            <label htmlFor="s-org" className="field-label">Trabaja para</label>
            <select id="s-org" className="input" value={f.organizerId} onChange={set("organizerId")}>
              <option value="">Rocktickets (puede escanear cualquier evento)</option>
              {organizers.map((o) => <option key={o.id} value={o.id}>{o.name} (solo sus eventos)</option>)}
            </select>
            <p className="field-hint">Las cuentas creadas por el superadmin nacen aprobadas.</p>
          </div>
        )}
      </fieldset>
      {error && <div className="mt-5"><Banner tone="bad">{error}</Banner></div>}
      <div className="mt-6 flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creando…" : "Crear cuenta"}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
      </div>
    </form>
  );
}

export default function Staff() {
  const { user } = useAuth();
  const isSuper = user.role === "SUPERADMIN";
  const [params, setParams] = useSearchParams();
  const orgFilter = params.get("organizador") ?? "";

  const [list, setList] = useState(null);
  const [organizers, setOrganizers] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("todos");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    api.get("/staff", { params: isSuper && orgFilter ? { organizerId: orgFilter } : {} })
      .then((r) => setList(r.data))
      .catch((e) => setError(errorMessage(e, "No se pudo cargar el personal.")));
  }, [isSuper, orgFilter]);
  useEffect(load, [load]);
  useEffect(() => {
    if (isSuper) api.get("/organizers").then((r) => setOrganizers(r.data)).catch(() => {});
  }, [isSuper]);

  const pending = useMemo(() => (list ?? []).filter((s) => s.approvalStatus === "PENDIENTE"), [list]);
  const shown = tab === "pendientes" ? pending : list ?? [];

  async function act(s, path, body, msg) {
    setBusyId(s.id); setError("");
    try {
      await api.patch(`/staff/${s.id}/${path}`, body);
      setNotice(msg);
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl font-semibold leading-none">Personal de puerta</h1>
        {!creating && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Nueva persona</button>}
      </div>
      <p className="mt-3 max-w-xl text-[15px] text-muted">
        {isSuper
          ? "Quienes escanean entradas. El personal de Rocktickets ve todos los eventos; el de un organizador, solo los suyos."
          : "Quienes escanean entradas en tus eventos. Rocktickets debe aprobar cada cuenta nueva."}
      </p>

      <div className="mt-6 space-y-4">
        {notice && <Banner onClose={() => setNotice("")}>{notice}</Banner>}
        {error && <Banner tone="bad">{error}</Banner>}
      </div>

      {creating && (
        <NewStaffForm
          isSuper={isSuper} organizers={organizers} defaultOrg={orgFilter}
          onCancel={() => setCreating(false)}
          onCreated={(s) => {
            setCreating(false);
            setNotice(s.approvalStatus === "PENDIENTE" ? `Se creó la cuenta de ${s.name}. Falta que Rocktickets la apruebe.` : `Se creó la cuenta de ${s.name}.`);
            load();
          }}
        />
      )}

      <div className="mt-8 flex flex-wrap items-end justify-between gap-4 border-b border-line">
        <div className="flex gap-1" role="tablist" aria-label="Filtrar personal">
          {[["todos", "Todos", list?.length], ["pendientes", "Por aprobar", pending.length]].map(([id, label, n]) => (
            <button
              key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-[15px] font-medium transition-colors ${tab === id ? "border-lamp text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}{n !== undefined && <span className="ml-2 text-[13px] text-muted">{n}</span>}
            </button>
          ))}
        </div>
        {isSuper && (
          <div className="pb-2">
            <label htmlFor="f-org" className="sr-only">Filtrar por organización</label>
            <select id="f-org" className="input !py-1.5 text-sm" value={orgFilter} onChange={(e) => setParams(e.target.value ? { organizador: e.target.value } : {})}>
              <option value="">Todas las organizaciones</option>
              {organizers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {!list && !error && <p className="mt-8 text-muted">Cargando…</p>}
      {list && shown.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-line px-6 py-12 text-center text-[15px] text-muted">
          {tab === "pendientes" ? "No hay cuentas esperando aprobación." : "Todavía no hay personal de puerta."}
        </p>
      )}
      {list && shown.length > 0 && (
        <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
          {shown.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">{s.name} <StatusBadge s={s} /></p>
                <p className="break-all text-[13px] text-muted">{s.email}</p>
                <p className="text-[13px] text-muted">
                  {s.organizerName ? `Solo eventos de ${s.organizerName}` : "Rocktickets · todos los eventos"} · creada {fmtDateTime(s.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isSuper && s.approvalStatus !== "APROBADO" && (
                  <button type="button" className="btn btn-primary !py-1.5 !text-sm" disabled={busyId === s.id}
                    onClick={() => act(s, "approval", { status: "APROBADO" }, `${s.name} fue aprobada.`)}>Aprobar</button>
                )}
                {isSuper && s.approvalStatus === "PENDIENTE" && (
                  <button type="button" className="btn btn-quiet !py-1.5 !text-sm" disabled={busyId === s.id}
                    onClick={() => act(s, "approval", { status: "RECHAZADO" }, `${s.name} fue rechazada.`)}>Rechazar</button>
                )}
                {s.approvalStatus === "APROBADO" && (
                  <button type="button" className="btn btn-quiet !py-1.5 !text-sm" disabled={busyId === s.id}
                    onClick={() => act(s, "active", { isActive: !s.isActive }, s.isActive ? `${s.name} ya no puede entrar.` : `${s.name} puede entrar de nuevo.`)}>
                    {s.isActive ? "Quitar acceso" : "Dar acceso"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
