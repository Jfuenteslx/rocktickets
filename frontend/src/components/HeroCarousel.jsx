import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EventPoster } from "./EventCard";
import { formatDay, formatTime, saleInfo, STATE_BADGE } from "../lib/events";

// Carrusel de eventos destacados. Rota solo, se pausa al pasar el mouse y respeta
// "reducir movimiento" del sistema.
export default function HeroCarousel({ events }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (events.length < 2 || paused || reduceMotion) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % events.length), 6000);
    return () => clearInterval(t);
  }, [events.length, paused, reduceMotion]);

  if (events.length === 0) return null;
  const current = events[Math.min(index, events.length - 1)];
  const { state } = saleInfo(current);
  const badge = STATE_BADGE[state];

  return (
    <div
      className="overflow-hidden rounded-2xl border border-line bg-panel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carrusel"
      aria-label="Eventos destacados"
    >
      <Link to={`/eventos/${current.id}`} className="relative block aspect-[16/9] bg-zinc-900">
        <EventPoster event={current} className="h-full w-full" />
        {badge && <span className={`absolute right-0 top-0 rounded-bl-lg px-3 py-1.5 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>}
      </Link>
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{current.name}</p>
          <p className="truncate text-sm text-zinc-400">
            {formatDay(current.startsAt)} · {formatTime(current.startsAt)}
            {current.venueName ? ` · ${current.venueName}` : ""}
          </p>
        </div>
        <Link to={`/eventos/${current.id}`} className="btn btn-primary shrink-0">
          Tickets
        </Link>
      </div>
      {events.length > 1 && (
        <div className="flex justify-center gap-2 pb-4">
          {events.map((e, i) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ver ${e.name}`}
              aria-current={i === index}
              className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-brand" : "w-2 bg-zinc-600 hover:bg-zinc-400"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
