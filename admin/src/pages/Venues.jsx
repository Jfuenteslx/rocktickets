import { useCallback, useEffect, useState } from "react";
import api, { errorMessage } from "../lib/api.js";
import Banner from "../components/Banner.jsx";

function SectorRow({ sector, onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sector.name);
  const [cap, setCap] = useState(String(sector.capacity));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(e) {
    e.preventDefault();
    const n = Number(cap);
    if (name.trim().length < 2) return setErr("Escribe un nombre.");
    if (!Number.isInteger(n) || n < 1) return setErr("El aforo debe ser un número entero de 1 en adelante.");
    setBusy(true); setErr("");
    try {
      await api.patch(`/sectors/${sector.id}`, { name: name.trim(), capacity: n });
      setEditing(false);
      await onSaved(`Sector ${name.trim()} actualizado`);
    } catch (e2) {
      setErr(errorMessage(e2, "No se pudo guardar."));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-4 px-4 py-3">
        <div>
          <p className="text-[15px] font-medium">{sector.name}</p>
          <p className="text-[13px] text-muted">Aforo {sector.capacity}</p>
        </div>
        <button type="button" className="btn btn-quiet !py-1.5 !text-sm" onClick={() => setEditing(true)}>Editar</button>
      </li>
    );
  }
  return (
    <li className="px-4 py-3">
      <form onSubmit={save} noValidate className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px] flex-1">
          <label htmlFor={`sn-${sector.id}`} className="field-label">Nombre</label>
          <input id={`sn-${sector.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`sc-${sector.id}`} className="field-label">Aforo</label>
          <input id={`sc-${sector.id}`} type="number" min="1" className="input w-28" value={cap} onChange={(e) => setCap(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setErr(""); setName(sector.name); setCap(String(sector.capacity)); }} disabled={busy}>Cancelar</button>
      </form>
      {err && <p className="field-error">{err}</p>}
    </li>
  );
}

function AddSector({ venueId, onAdded }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    const n = Number(cap);
    if (name.trim().length < 2) return setErr("Escribe el nombre del sector, por ejemplo VIP.");
    if (!Number.isInteger(n) || n < 1) return setErr("Indica el aforo (número entero de 1 en adelante).");
    setBusy(true); setErr("");
    try {
      await api.post(`/venues/${venueId}/sectors`, { name: name.trim(), capacity: n });
      setOpen(false); setName(""); setCap("");
      await onAdded(`Sector ${name.trim()} agregado`);
    } catch (e2) {
      setErr(errorMessage(e2, "No se pudo agregar el sector."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <button type="button" className="btn btn-quiet !py-1.5 !text-sm mt-3" onClick={() => setOpen(true)}>Agregar sector</button>;
  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-line bg-bg p-4">
      <div className="min-w-[160px] flex-1">
        <label htmlFor={`an-${venueId}`} className="field-label">Nombre del sector</label>
        <input id={`an-${venueId}`} className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`ac-${venueId}`} className="field-label">Aforo</label>
        <input id={`ac-${venueId}`} type="number" min="1" className="input w-28" value={cap} onChange={(e) => setCap(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Agregando…" : "Agregar"}</button>
      <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setErr(""); }} disabled={busy}>Cancelar</button>
      {err && <p className="field-error basis-full">{err}</p>}
    </form>
  );
}

function VenueName({ venue, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(venue.name);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save(e) {
    e.preventDefault();
    if (name.trim().length < 2) return setErr("Escribe un nombre.");
    setBusy(true); setErr("");
    try {
      await api.patch(`/venues/${venue.id}`, { name: name.trim() });
      setEditing(false);
      await onSaved("Nombre del local actualizado");
    } catch (e2) {
      setErr(errorMessage(e2, "No se pudo guardar."));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <h2 className="font-display text-3xl font-semibold leading-none">{venue.name}</h2>
        <button type="button" className="text-sm text-muted underline underline-offset-4 hover:text-ink" onClick={() => setEditing(true)}>Renombrar</button>
      </div>
    );
  }
  return (
    <form onSubmit={save} noValidate className="flex flex-wrap items-center gap-3">
      <label htmlFor={`vn-${venue.id}`} className="sr-only">Nombre del local</label>
      <input id={`vn-${venue.id}`} className="input max-w-xs" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="btn btn-primary !py-1.5" disabled={busy}>Guardar</button>
      <button type="button" className="btn btn-ghost" onClick={() => { setEditing(false); setName(venue.name); setErr(""); }}>Cancelar</button>
      {err && <p className="field-error basis-full">{err}</p>}
    </form>
  );
}

export default function Venues() {
  const [venues, setVenues] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newErr, setNewErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.get("/manage/venues").then((r) => setVenues(r.data)).catch((e) => setError(errorMessage(e, "No se pudieron cargar los locales."))),
    []
  );
  useEffect(() => { load(); }, [load]);
  const done = async (msg) => { setNotice(msg); await load(); };

  async function createVenue(e) {
    e.preventDefault();
    if (newName.trim().length < 2) return setNewErr("Escribe el nombre del local.");
    setBusy(true); setNewErr("");
    try {
      await api.post("/venues", { name: newName.trim() });
      setCreating(false); setNewName("");
      await done("Local creado. Agrégale sus sectores para poder usarlo en eventos.");
    } catch (err) {
      setNewErr(errorMessage(err, "No se pudo crear el local."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-5xl font-semibold leading-none">Locales</h1>
        {!creating && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>Nuevo local</button>}
      </div>
      <p className="mt-3 max-w-xl text-[15px] text-muted">
        Los locales son de la plataforma y los comparten todos los organizadores. El aforo de un local es la suma de sus sectores.
      </p>

      <div className="mt-6 space-y-4">
        {notice && <Banner onClose={() => setNotice("")}>{notice}</Banner>}
        {error && <Banner tone="bad">{error}</Banner>}
      </div>

      {creating && (
        <form onSubmit={createVenue} noValidate className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-5">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="v-name" className="field-label">Nombre del local</label>
            <input id="v-name" className="input" value={newName} onChange={(e) => { setNewName(e.target.value); setNewErr(""); }} />
            {newErr && <p className="field-error">{newErr}</p>}
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Creando…" : "Crear local"}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setCreating(false); setNewErr(""); }} disabled={busy}>Cancelar</button>
        </form>
      )}

      {!venues && !error && <p className="mt-10 text-muted">Cargando…</p>}
      {venues && venues.length === 0 && (
        <p className="mt-8 rounded-lg border border-dashed border-line px-6 py-12 text-center text-[15px] text-muted">Todavía no hay locales.</p>
      )}
      {venues && (
        <div className="mt-8 space-y-6">
          {venues.map((v) => (
            <section key={v.id} aria-label={v.name} className="rounded-lg border border-line bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <VenueName venue={v} onSaved={done} />
                <p className="text-sm text-muted">Aforo total <span className="font-medium text-ink">{v.capacity}</span></p>
              </div>
              {v.sectors.length === 0 ? (
                <p className="mt-4 text-[15px] text-muted">Sin sectores: todavía no se puede usar en eventos.</p>
              ) : (
                <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-bg">
                  {v.sectors.map((s) => <SectorRow key={s.id} sector={s} onSaved={done} />)}
                </ul>
              )}
              <AddSector venueId={v.id} onAdded={done} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
