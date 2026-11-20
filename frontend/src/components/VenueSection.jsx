import { useState } from "react";
import { API_URL } from "../lib/api";

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

function Gallery({ photos, name }) {
  const [index, setIndex] = useState(0);
  if (photos.length === 0) return null;
  const current = photos[Math.min(index, photos.length - 1)];
  const go = (delta) => setIndex((i) => (i + delta + photos.length) % photos.length);

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-line bg-zinc-900">
        <img src={`${API_URL}${current.url}`} alt={`${name}: foto ${index + 1} de ${photos.length}`} className="aspect-[16/10] w-full object-cover" />
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Foto anterior" className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
              ‹
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Foto siguiente" className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
              ›
            </button>
            <span className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <ul className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === index}
                className={`block overflow-hidden rounded-md border-2 ${i === index ? "border-brand" : "border-transparent opacity-70 hover:opacity-100"}`}
              >
                <img src={`${API_URL}${p.url}`} alt="" loading="lazy" className="h-14 w-20 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Hours({ hours }) {
  const byDay = new Map((hours || []).map((h) => [h.day, h]));
  if (byDay.size === 0) return null;
  const today = new Date().getDay();
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Horarios de atención</h3>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
        {DAYS.map(({ day, label }) => {
          const h = byDay.get(day);
          const isToday = day === today;
          return (
            <li key={day} className={`flex items-center justify-between px-3 py-2 ${isToday ? "bg-zinc-900 font-semibold text-white" : "text-zinc-300"}`}>
              <span>
                {label}
                {isToday && <span className="ml-2 text-xs font-normal text-brand">hoy</span>}
              </span>
              <span className={!h || h.closed ? "text-zinc-500" : ""}>{!h || h.closed ? "Cerrado" : `${h.open} – ${h.close}`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// "El lugar": fotos, dirección, mapa y horarios del local del evento. No se muestra
// nada si el local todavía no tiene ficha.
export default function VenueSection({ venue }) {
  if (!venue) return null;
  const photos = venue.photos || [];
  const hasHours = (venue.openingHours || []).length > 0;
  if (!venue.address && !venue.mapsUrl && photos.length === 0 && !hasHours) return null;

  const mapQuery = [venue.name, venue.address].filter(Boolean).join(", ");

  return (
    <section className="mt-10" aria-labelledby="venue-title">
      <h2 id="venue-title" className="section-title">
        El lugar
      </h2>
      <p className="mt-2 font-medium text-white">{venue.name}</p>
      {venue.address && <p className="text-sm text-zinc-400">{venue.address}</p>}

      <div className="mt-4 space-y-5">
        <Gallery photos={photos} name={venue.name} />

        {(venue.address || venue.mapsUrl) && (
          <div>
            {venue.address && (
              <iframe
                title={`Mapa de ${venue.name}`}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-64 w-full rounded-xl border border-line bg-zinc-900"
              />
            )}
            {venue.mapsUrl && (
              <a href={venue.mapsUrl} target="_blank" rel="noreferrer noopener" className="btn btn-primary mt-3 inline-flex">
                Cómo llegar
              </a>
            )}
          </div>
        )}

        <Hours hours={venue.openingHours} />
      </div>
    </section>
  );
}
