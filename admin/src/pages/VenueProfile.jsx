import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { API_URL, errorMessage } from "../lib/api.js";
import Banner from "../components/Banner.jsx";

// Se muestra de lunes a domingo; en los datos 0 = domingo … 6 = sábado
const DAYS = [
  { day: 1, label: "Lunes" },
  { day: 2, label: "Martes" },
  { day: 3, label: "Miércoles" },
  { day: 4, label: "Jueves" },
  { day: 5, label: "Viernes" },
  { day: 6, label: "Sábado" },
  { day: 0, label: "Domingo" },
];
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

function hoursToState(list) {
  const byDay = new Map((list || []).map((h) => [h.day, h]));
  return Object.fromEntries(
    DAYS.map(({ day }) => {
      const h = byDay.get(day);
      return [day, h && !h.closed ? { closed: false, open: h.open, close: h.close } : { closed: true, open: "20:00", close: "03:00" }];
    })
  );
}

function DataSection({ profile, onSaved, onError }) {
  const [address, setAddress] = useState(profile.address || "");
  const [mapsUrl, setMapsUrl] = useState(profile.mapsUrl || "");
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/venues/${profile.id}`, { address, mapsUrl });
      await onSaved("Dirección y ubicación guardadas");
    } catch (err) {
      onError(errorMessage(err, "No se pudo guardar."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-2xl font-semibold">Dirección y ubicación</h2>
      <div className="mt-4">
        <label htmlFor="v-address" className="field-label">Dirección</label>
        <input id="v-address" className="input" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, zona, ciudad" />
        <p className="field-hint">Con esta dirección se arma el mapa que ve el público. Mientras más completa, más exacto.</p>
      </div>
      <div className="mt-4">
        <label htmlFor="v-maps" className="field-label">Enlace de Google Maps</label>
        <input id="v-maps" className="input" maxLength={500} value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" />
        <p className="field-hint">En Google Maps: Compartir → Copiar enlace. Es el que abre el botón "Cómo llegar".</p>
      </div>
      <button type="submit" className="btn btn-primary mt-5" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
    </form>
  );
}

function HoursSection({ profile, onSaved, onError }) {
  const [hours, setHours] = useState(() => hoursToState(profile.openingHours));
  const [busy, setBusy] = useState(false);
  const set = (day, patch) => setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));

  async function save(e) {
    e.preventDefault();
    for (const { day, label } of DAYS) {
      const h = hours[day];
      if (!h.closed && (!h.open || !h.close)) return onError(`Completa la hora de apertura y cierre del ${label.toLowerCase()}.`);
    }
    setBusy(true);
    try {
      const openingHours = DAYS.map(({ day }) => {
        const h = hours[day];
        return h.closed ? { day, closed: true } : { day, closed: false, open: h.open, close: h.close };
      });
      await api.patch(`/venues/${profile.id}`, { openingHours });
      await onSaved("Horarios guardados");
    } catch (err) {
      onError(errorMessage(err, "No se pudieron guardar los horarios."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-display text-2xl font-semibold">Horarios de atención</h2>
      <p className="mt-1 text-[13px] text-muted">Si el local cierra pasada la medianoche, pon un cierre menor que la apertura (por ejemplo 20:00 a 03:00).</p>
      <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-bg">
        {DAYS.map(({ day, label }) => {
          const h = hours[day];
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <span className="w-24 text-[15px] font-medium">{label}</span>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={h.closed} onChange={(e) => set(day, { closed: e.target.checked })} />
                Cerrado
              </label>
              {!h.closed && (
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor={`o-${day}`}>Apertura {label}</label>
                  <input id={`o-${day}`} type="time" className="input !w-auto" value={h.open || ""} onChange={(e) => set(day, { open: e.target.value })} />
                  <span className="text-muted">a</span>
                  <label className="sr-only" htmlFor={`c-${day}`}>Cierre {label}</label>
                  <input id={`c-${day}`} type="time" className="input !w-auto" value={h.close || ""} onChange={(e) => set(day, { close: e.target.value })} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button type="submit" className="btn btn-primary mt-5" disabled={busy}>{busy ? "Guardando…" : "Guardar horarios"}</button>
    </form>
  );
}

function PhotosSection({ profile, onChanged, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const { photos, maxPhotos } = profile;

  async function upload(files) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const room = maxPhotos - photos.length;
    if (list.length > room) return onError(`Solo caben ${room} foto(s) más (máximo ${maxPhotos}).`);
    const bad = list.find((f) => !TYPES.includes(f.type) || f.size > MAX_SIZE);
    if (bad) return onError(`"${bad.name}": usa JPG, PNG o WEBP de hasta 5 MB.`);

    setBusy(true);
    let done = 0;
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("image", file);
        await api.post(`/venues/${profile.id}/photos`, fd);
        done += 1;
      }
    } catch (err) {
      onError(errorMessage(err, "No se pudo subir una de las fotos."));
    } finally {
      setBusy(false);
      if (done > 0) await onChanged(done === 1 ? "Foto agregada" : `${done} fotos agregadas`);
    }
  }

  async function remove(photo) {
    if (!window.confirm("¿Eliminar esta foto?")) return;
    setBusy(true);
    try {
      await api.delete(`/venues/${profile.id}/photos/${photo.id}`);
      await onChanged("Foto eliminada");
    } catch (err) {
      onError(errorMessage(err, "No se pudo eliminar la foto."));
    } finally {
      setBusy(false);
    }
  }

  async function move(index, delta) {
    const ids = photos.map((p) => p.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(true);
    try {
      await api.put(`/venues/${profile.id}/photos/order`, { photoIds: ids });
      await onChanged("Orden actualizado");
    } catch (err) {
      onError(errorMessage(err, "No se pudo cambiar el orden."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold">Fotos del local</h2>
          <p className="mt-1 text-[13px] text-muted">{photos.length} de {maxPhotos}. La primera es la portada. JPG, PNG o WEBP, hasta 5 MB cada una.</p>
        </div>
        <div>
          <input ref={inputRef} type="file" accept={TYPES.join(",")} multiple className="sr-only" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          <button type="button" className="btn btn-primary" disabled={busy || photos.length >= maxPhotos} onClick={() => inputRef.current?.click()}>
            {busy ? "Procesando…" : "Subir fotos"}
          </button>
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-line px-6 py-10 text-center text-[15px] text-muted">Todavía no hay fotos.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-md border border-line bg-bg">
              <div className="relative aspect-[4/3]">
                <img src={`${API_URL}${p.url}`} alt={`Foto ${i + 1} del local`} className="h-full w-full object-cover" />
                {i === 0 && <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs font-semibold">Portada</span>}
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <div className="flex gap-1">
                  <button type="button" className="btn btn-quiet !px-2 !py-1 !text-sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Mover antes">←</button>
                  <button type="button" className="btn btn-quiet !px-2 !py-1 !text-sm" disabled={busy || i === photos.length - 1} onClick={() => move(i, 1)} aria-label="Mover después">→</button>
                </div>
                <button type="button" className="text-sm text-muted underline underline-offset-4 hover:text-ink" disabled={busy} onClick={() => remove(p)}>Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function VenueProfile() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(
    () => api.get(`/venues/${id}/profile`).then((r) => setProfile(r.data)).catch((e) => setError(errorMessage(e, "No se pudo cargar el local."))),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  const saved = async (msg) => { setError(""); setNotice(msg); await load(); };
  const fail = (msg) => { setNotice(""); setError(msg); };

  return (
    <div>
      <Link to="/locales" className="text-sm text-muted underline underline-offset-4 hover:text-ink">← Locales</Link>
      <h1 className="mt-3 font-display text-5xl font-semibold leading-none">{profile ? `Ficha de ${profile.name}` : "Ficha del local"}</h1>
      <p className="mt-3 max-w-xl text-[15px] text-muted">Lo que ve el público en la sección "El lugar" de cada evento.</p>

      <div className="mt-6 space-y-4">
        {notice && <Banner onClose={() => setNotice("")}>{notice}</Banner>}
        {error && <Banner tone="bad" onClose={() => setError("")}>{error}</Banner>}
      </div>

      {!profile && !error && <p className="mt-10 text-muted">Cargando…</p>}
      {profile && (
        <div className="mt-8 space-y-6">
          <DataSection profile={profile} onSaved={saved} onError={fail} />
          <HoursSection profile={profile} onSaved={saved} onError={fail} />
          <PhotosSection profile={profile} onChanged={saved} onError={fail} />
        </div>
      )}
    </div>
  );
}
