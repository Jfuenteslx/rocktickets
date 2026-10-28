import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import api, { API_URL, errorMessage } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { fromLocalInput, toLocalInput } from "../lib/format.js";
import ImagePicker from "../components/ImagePicker.jsx";

const empty = { name: "", description: "", venueId: "", organizerId: "", startsAt: "", endsAt: "" };

export default function EventForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuper = user.role === "SUPERADMIN";

  const [form, setForm] = useState(empty);
  const [venues, setVenues] = useState([]);
  const [organizers, setOrganizers] = useState([]);
  const [image, setImage] = useState(null);
  const [existing, setExisting] = useState(null); // evento ya guardado (al editar)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setImage(null);
    setErrors({});
    (async () => {
      try {
        const reqs = [api.get("/manage/venues")];
        if (isSuper) reqs.push(api.get("/organizers"));
        if (editing) reqs.push(api.get(`/manage/events/${id}`));
        const [v, o, e] = isSuper
          ? [await reqs[0], await reqs[1], editing ? await reqs[2] : null]
          : [await reqs[0], null, editing ? await reqs[1] : null];
        if (cancelled) return;
        setVenues(v.data);
        if (o) setOrganizers(o.data.filter((x) => x.isActive));
        if (e) {
          setExisting(e.data);
          setForm({
            name: e.data.name,
            description: e.data.description ?? "",
            venueId: e.data.venueId,
            organizerId: e.data.organizerId,
            startsAt: toLocalInput(e.data.startsAt),
            endsAt: toLocalInput(e.data.endsAt),
          });
        } else if (v.data.length === 1) {
          setForm((f) => ({ ...f, venueId: v.data[0].id }));
        }
      } catch (err) {
        if (!cancelled) setFormError(errorMessage(err, "No se pudo cargar el formulario."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, editing, isSuper]);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
  };

  function validate() {
    const er = {};
    if (form.name.trim().length < 3) er.name = "Escribe un nombre de al menos 3 letras.";
    if (!form.venueId) er.venueId = "Elige el local.";
    if (isSuper && !editing && !form.organizerId) er.organizerId = "Elige quién organiza el evento.";
    if (!form.startsAt) er.startsAt = "Indica cuándo empieza.";
    if (!form.endsAt) er.endsAt = "Indica cuándo termina.";
    if (form.startsAt && form.endsAt && new Date(fromLocalInput(form.endsAt)) <= new Date(fromLocalInput(form.startsAt))) {
      er.endsAt = "El fin debe ser después del inicio.";
    }
    setErrors(er);
    return Object.keys(er).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    if (!validate()) return;
    setBusy(true);
    let savedId = id;
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        venueId: form.venueId,
        startsAt: fromLocalInput(form.startsAt),
        endsAt: fromLocalInput(form.endsAt),
      };
      let warnings = [];
      if (editing) {
        if (existing && !existing.canEditVenue) delete body.venueId; // con tickets generados el local no cambia
        if (!body.description) body.description = "";
        await api.patch(`/events/${id}`, body);
      } else {
        if (isSuper) body.organizerId = form.organizerId;
        const { data } = await api.post("/events", body);
        savedId = data.id;
        warnings = data.warnings ?? [];
      }

      // La imagen se sube aparte; si falla, el evento ya existe y se puede reintentar al editarlo
      if (image) {
        try {
          const fd = new FormData();
          fd.append("image", image);
          await api.post(`/events/${savedId}/image`, fd);
        } catch (imgErr) {
          const msg = `El evento se guardó, pero la imagen no se pudo subir: ${errorMessage(imgErr)}`;
          if (editing) {
            setFormError(msg);
            setBusy(false);
          } else {
            navigate(`/eventos/${savedId}/editar`, { replace: true, state: { warning: msg } });
          }
          return;
        }
      }

      navigate(editing ? `/eventos/${id}/detalles` : `/eventos/${savedId}`, {
        state: {
          notice: {
            title: editing ? "Cambios guardados" : "Evento creado",
            detail: warnings[0]?.message
              ? `Aviso: ${warnings[0].message}`
              : editing ? undefined : "Siguiente paso: genera los tickets y crea tus tiers.",
          },
        },
      });
    } catch (err) {
      setFormError(errorMessage(err, "No se pudo guardar el evento."));
      setBusy(false);
    }
  }

  if (loading) return <p className="text-muted">Cargando…</p>;

  const venue = venues.find((v) => v.id === form.venueId);
  const venueLocked = editing && existing && !existing.canEditVenue;
  const cancelled = existing?.status === "CANCELADO";

  return (
    <div>
      <Link to={editing ? `/eventos/${id}/detalles` : "/eventos"} className="text-sm text-muted hover:text-ink">{editing ? "Volver al evento" : "Volver a eventos"}</Link>
      <h1 className="mt-3 font-display text-5xl font-semibold leading-none">
        {editing ? "Editar evento" : "Crear evento"}
      </h1>

      {location.state?.warning && (
        <p role="status" className="mt-6 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-[15px] text-warn">
          {location.state.warning}
        </p>
      )}

      {cancelled && (
        <p role="status" className="mt-6 rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-[15px] text-bad">
          Este evento está cancelado y ya no se puede modificar.
        </p>
      )}

      <form onSubmit={submit} noValidate className="mt-8 grid gap-10 lg:grid-cols-[1fr_280px]">
        <fieldset disabled={cancelled || busy} className="min-w-0 space-y-6">
          {isSuper && (
            <div>
              <label htmlFor="org" className="field-label">Organizador</label>
              <select id="org" className="input" value={form.organizerId} onChange={set("organizerId")} disabled={editing}>
                <option value="">Elige un organizador</option>
                {organizers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {editing && <p className="field-hint">El organizador de un evento no se cambia.</p>}
              {errors.organizerId && <p className="field-error">{errors.organizerId}</p>}
            </div>
          )}

          <div>
            <label htmlFor="name" className="field-label">Nombre del evento</label>
            <input id="name" className="input" value={form.name} onChange={set("name")} placeholder="Noche de rock en vivo" maxLength={120} />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="description" className="field-label">Descripción</label>
            <textarea id="description" rows={6} className="input resize-y leading-relaxed" value={form.description} onChange={set("description")}
              placeholder="Bandas, precios, horarios de apertura, condiciones de ingreso…" />
            <p className="field-hint">Es lo que lee quien compra. Opcional.</p>
          </div>

          <div>
            <label htmlFor="venue" className="field-label">Local</label>
            <select id="venue" className="input" value={form.venueId} onChange={set("venueId")} disabled={venueLocked}>
              <option value="">Elige un local</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}, aforo {v.capacity}</option>)}
            </select>
            {venueLocked && (
              <p className="field-hint">Ya hay tickets generados para este evento, por eso el local no se puede cambiar.</p>
            )}
            {venue && !venueLocked && venue.sectors.length > 0 && (
              <p className="field-hint">
                Sectores: {venue.sectors.map((s) => `${s.name} (${s.capacity})`).join(", ")}.
              </p>
            )}
            {errors.venueId && <p className="field-error">{errors.venueId}</p>}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="startsAt" className="field-label">Empieza</label>
              <input id="startsAt" type="datetime-local" className="input" value={form.startsAt} onChange={set("startsAt")} />
              {errors.startsAt && <p className="field-error">{errors.startsAt}</p>}
            </div>
            <div>
              <label htmlFor="endsAt" className="field-label">Termina</label>
              <input id="endsAt" type="datetime-local" className="input" value={form.endsAt} onChange={set("endsAt")} />
              {errors.endsAt && <p className="field-error">{errors.endsAt}</p>}
            </div>
          </div>
          <p className="field-hint -mt-3">Hora de Bolivia (La Paz).</p>
        </fieldset>

        <aside className="space-y-6">
          <div>
            <span className="field-label">Imagen</span>
            <ImagePicker
              value={image}
              onChange={setImage}
              currentUrl={existing?.imageUrl ? `${API_URL}${existing.imageUrl}` : null}
            />
          </div>
        </aside>

        <div className="lg:col-span-2">
          {formError && (
            <p role="alert" className="mb-4 rounded-md border border-bad/40 bg-bad/10 px-4 py-3 text-[15px] text-bad">{formError}</p>
          )}
          <div className="flex items-center gap-3 border-t border-line pt-6">
            <button type="submit" className="btn btn-primary" disabled={busy || cancelled}>
              {busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear evento"}
            </button>
            <Link to={editing ? `/eventos/${id}/detalles` : "/eventos"} className="btn btn-ghost">Cancelar</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
