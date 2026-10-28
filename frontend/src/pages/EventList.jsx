import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("es-BO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" });
}

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function EventList() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/events")
      .then(({ data }) => setEvents(data))
      .catch(() => setError("No se pudieron cargar los eventos"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-6 text-zinc-500">Cargando eventos...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Próximos eventos</h1>

      {events.length === 0 && (
        <p className="text-zinc-500">No hay eventos publicados todavía.</p>
      )}

      <div className="grid gap-4">
        {events.map((event) => {
          const totalAvailable = event.sectors.reduce(
            (sum, s) => sum + s.tiers.reduce((s2, t) => s2 + t.available, 0),
            0
          );
          return (
            <Link
              key={event.id}
              to={`/eventos/${event.id}`}
              className="block border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow"
            >
              {event.imageUrl && (
                <img
                  src={`${API_URL}${event.imageUrl}`}
                  alt={event.name}
                  className="w-full h-40 object-cover rounded-lg mb-4"
                />
              )}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{event.name}</h2>
                  <p className="text-sm text-zinc-500">
                    {formatDate(event.startsAt)} · {formatTime(event.startsAt)} a {formatTime(event.endsAt)}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                    totalAvailable > 0
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {totalAvailable > 0 ? `${totalAvailable} disponibles` : "Agotado"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
