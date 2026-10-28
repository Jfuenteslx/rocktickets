import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import TicketCard from "../components/TicketCard";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Página pública de una cortesía: el invitado abre su enlace y descarga sus entradas.
export default function CourtesyTickets() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`/courtesies/token/${token}`)
      .then(({ data }) => setData(data))
      .catch(() => setError("No encontramos estas entradas. Revisa que el enlace esté completo."));
  }, [token]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!data) return <p className="p-6 text-zinc-500">Cargando...</p>;

  const { event, tickets } = data;
  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Tus entradas de cortesía</h1>
      <p className="text-zinc-500 mb-6">Para {data.recipientName}</p>

      <p className="text-sm text-zinc-600 mb-4">
        {event.name}
        {event.venueName ? ` · ${event.venueName}` : ""} ·{" "}
        {new Date(event.startsAt).toLocaleString("es-BO", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Entradas ({tickets.length})</h2>
        <a
          href={`${API_URL}/courtesies/token/${token}/tickets.pdf`}
          className="text-sm bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-md"
        >
          Descargar PDF
        </a>
      </div>

      <div className="grid gap-3">
        {tickets.map((t) => (
          <TicketCard key={t.id} token={token} ticket={t} event={event} basePath="/courtesies/token" />
        ))}
      </div>
      <p className="text-xs text-zinc-400 mt-6">
        Presenta el QR en la puerta. Cada entrada se puede usar una sola vez.
      </p>
    </div>
  );
}
