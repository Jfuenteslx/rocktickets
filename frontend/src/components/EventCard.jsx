import { Link } from "react-router-dom";
import { formatDay, formatMoney, formatTime, imageSrc, saleInfo, STATE_BADGE } from "../lib/events";

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function EventPoster({ event, className = "" }) {
  const src = imageSrc(event);
  if (src) return <img src={src} alt={event.name} loading="lazy" className={`object-cover ${className}`} />;
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-red-950 p-4 text-center ${className}`}>
      <span className="font-display text-2xl font-bold uppercase leading-tight text-white/80">{event.name}</span>
    </div>
  );
}

export default function EventCard({ event }) {
  const { state, minPrice } = saleInfo(event);
  const badge = STATE_BADGE[state];
  return (
    <Link
      to={`/eventos/${event.id}`}
      className="group block overflow-hidden rounded-xl border border-line bg-panel transition-colors hover:border-zinc-600"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-zinc-900">
        <EventPoster event={event} className="h-full w-full transition-transform duration-300 group-hover:scale-105" />
        {badge && (
          <span className={`absolute right-0 top-0 rounded-bl-lg px-2.5 py-1 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
        )}
      </div>
      <div className="space-y-1.5 p-4">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-white">{event.name}</h3>
        {event.venueName && (
          <p className="flex items-center gap-1.5 truncate text-xs text-zinc-400">
            <PinIcon />
            <span className="truncate">{event.venueName}</span>
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-zinc-400">
          <CalendarIcon />
          {formatDay(event.startsAt)} · {formatTime(event.startsAt)}
        </p>
        {minPrice !== null && state !== "AGOTADO" && (
          <p className="pt-1 text-sm font-semibold text-white">
            <span className="font-normal text-zinc-500">Desde </span>
            {formatMoney(minPrice)}
          </p>
        )}
      </div>
    </Link>
  );
}
