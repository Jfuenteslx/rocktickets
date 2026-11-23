import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api, { API_URL } from "../lib/api";
import { formatDayLong, formatTime } from "../lib/events";
import TicketCard from "../components/TicketCard";
import { LoadError, Loading } from "../components/StateMessage";

// Página pública de una cortesía: el invitado abre su enlace y descarga sus entradas.
export default function CourtesyTickets() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api
      .get(`/courtesies/token/${token}`)
      .then(({ data }) => setData(data))
      .catch((err) => setError(err));
  }, [token, attempt]);

  if (error)
    return (
      <LoadError
        error={error}
        notFoundText="No encontramos estas entradas. Revisa que el enlace esté completo."
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  if (!data) return <Loading />;

  const { event, tickets } = data;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase text-white">Tus entradas de cortesía</h1>
      <p className="mt-1 text-sm text-zinc-500">Para {data.recipientName}</p>

      <div className="card mt-6 p-4">
        <p className="font-semibold text-white">{event.name}</p>
        <p className="mt-0.5 text-sm text-zinc-400">
          {formatDayLong(event.startsAt)} · {formatTime(event.startsAt)}
          {event.venueName ? ` · ${event.venueName}` : ""}
        </p>
      </div>

      <div className="mb-4 mt-8 flex items-center justify-between gap-3">
        <h2 className="section-title">Entradas ({tickets.length})</h2>
        <a href={`${API_URL}/courtesies/token/${token}/tickets.pdf`} className="btn btn-primary">
          Descargar PDF
        </a>
      </div>

      <div className="grid gap-3">
        {tickets.map((t) => (
          <TicketCard key={t.id} token={token} ticket={t} event={event} basePath="/courtesies/token" />
        ))}
      </div>
      <p className="mt-6 text-xs text-zinc-500">Presenta el QR en la puerta. Cada entrada se puede usar una sola vez.</p>
    </div>
  );
}
