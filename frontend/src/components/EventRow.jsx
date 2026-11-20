import { Link } from "react-router-dom";
import EventCard from "./EventCard";

// Fila de una categoría: título con barra de color, "Ver más" y una cuadrícula de carteles.
export default function EventRow({ title, accent = "bg-brand", to, events, max = 4 }) {
  if (events.length === 0) return null;
  return (
    <section className="mt-14">
      <div className="mb-5 flex items-end justify-between">
        <h2 className="section-title flex items-center gap-3">
          <span className={`h-6 w-1 rounded-full ${accent}`} aria-hidden="true" />
          {title}
        </h2>
        {to && (
          <Link to={to} className="text-sm font-medium text-zinc-400 hover:text-white">
            Ver más →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {events.slice(0, max).map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
    </section>
  );
}
