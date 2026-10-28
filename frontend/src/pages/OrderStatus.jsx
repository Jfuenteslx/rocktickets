import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../lib/api";
import TicketCard from "../components/TicketCard";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function OrderStatus() {
  const { token } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [simulating, setSimulating] = useState(false);
  const intervalRef = useRef(null);

  function load() {
    return api
      .get(`/orders/token/${token}`)
      .then(({ data }) => setOrder(data))
      .catch(() => setError("Orden no encontrada"));
  }

  useEffect(() => {
    load();
  }, [token]);

  // Polling mientras esté pendiente de pago — cada 3s. Se detiene solo
  // cuando el estado deja de ser PENDIENTE_PAGO.
  useEffect(() => {
    if (order?.status === "PENDIENTE_PAGO") {
      intervalRef.current = setInterval(load, 3000);
      return () => clearInterval(intervalRef.current);
    }
  }, [order?.status]);

  async function handleSimulate() {
    const pendingPayment = order.payments.find((p) => p.status === "PENDIENTE");
    if (!pendingPayment) return;
    setSimulating(true);
    try {
      await api.post(`/demo/payments/${pendingPayment.id}/simulate-bank-confirmation`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo simular el pago");
    } finally {
      setSimulating(false);
    }
  }

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!order) return <p className="p-6 text-zinc-500">Cargando...</p>;

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Tu compra</h1>
      <p className="text-zinc-500 mb-6">Orden #{order.id.slice(0, 8)}</p>

      {order.status === "PENDIENTE_PAGO" && (
        <div className="border border-amber-200 bg-amber-50 rounded-xl p-5">
          <p className="font-medium text-amber-800">Esperando confirmación del pago...</p>
          <p className="text-sm text-amber-700 mt-1">
            Total: Bs {order.payments[0]?.amount} · Expira{" "}
            {new Date(order.expiresAt).toLocaleTimeString("es-BO")}
          </p>
          <p className="text-xs text-amber-600 mt-3">
            Esta pantalla se actualiza sola cuando se confirme el pago.
          </p>

          {/* Botón de DEMO — simula la confirmación del banco. Solo funciona
              si el backend corre con NODE_ENV != production. */}
          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="mt-4 text-sm bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-300 text-white px-4 py-2 rounded-md"
          >
            {simulating ? "Simulando..." : "🧪 Simular pago (demo)"}
          </button>
        </div>
      )}

      {order.status === "EXPIRADA" && (
        <div className="border border-zinc-200 bg-zinc-50 rounded-xl p-5">
          <p className="font-medium text-zinc-700">Esta orden expiró sin confirmarse el pago.</p>
        </div>
      )}

      {order.status === "PAGADA" && (
        <div>
          <div className="border border-green-200 bg-green-50 rounded-xl p-4 mb-4">
            <p className="font-medium text-green-800">¡Pago confirmado!</p>
          </div>

          {order.event && (
            <p className="text-sm text-zinc-600 mb-4">
              {order.event.name} ·{" "}
              {new Date(order.event.startsAt).toLocaleString("es-BO", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Tus tickets ({order.tickets.length})</h2>
            <a
              href={`${API_URL}/orders/token/${token}/tickets.pdf`}
              className="text-sm bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-md"
            >
              Descargar PDF
            </a>
          </div>

          <div className="grid gap-3">
            {order.tickets.map((t) => (
              <TicketCard key={t.id} token={token} ticket={t} event={order.event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
