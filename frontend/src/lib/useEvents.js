import { useEffect, useState } from "react";
import api from "./api";
import { isUpcoming } from "./events";

// Eventos públicos vigentes (aún no terminaron), ordenados por fecha.
export default function useEvents() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .get("/events")
      .then(({ data }) => {
        if (!cancelled) setEvents(data.filter(isUpcoming).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt)));
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar los eventos. Intenta de nuevo en un momento.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { events, loading, error };
}
