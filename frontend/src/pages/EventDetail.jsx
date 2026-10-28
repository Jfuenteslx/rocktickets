import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../lib/api";

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState({}); // { tierId: quantity }
  const [buyer, setBuyer] = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get(`/events/${id}`)
      .then(({ data }) => setEvent(data))
      .catch(() => setError("No se pudo cargar el evento"))
      .finally(() => setLoading(false));
  }, [id]);

  function setQty(tierId, qty) {
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[tierId];
      else next[tierId] = qty;
      return next;
    });
  }

  const allTiers = event?.sectors.flatMap((s) => s.tiers.map((t) => ({ ...t, sectorName: s.name }))) || [];
  const cartItems = Object.entries(cart).map(([tierId, quantity]) => {
    const tier = allTiers.find((t) => t.id === tierId);
    return { tierId, quantity, tier };
  });
  const total = cartItems.reduce((sum, i) => sum + Number(i.tier?.price || 0) * i.quantity, 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (cartItems.length === 0) {
      setError("Elegí al menos un ticket");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const { data } = await api.post("/orders", {
        eventId: id,
        buyerName: buyer.name,
        buyerEmail: buyer.email,
        buyerPhone: buyer.phone,
        items: cartItems.map((i) => ({ tierId: i.tierId, quantity: i.quantity })),
      });
      navigate(`/orden/${data.order.accessToken}`);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo completar la compra");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="p-6 text-zinc-500">Cargando evento...</p>;
  if (!event) return <p className="p-6 text-red-600">Evento no encontrado</p>;

  return (
    <div className="max-w-2xl mx-auto p-6">
      {event.imageUrl && (
        <img
          src={`${import.meta.env.VITE_API_URL || "http://localhost:3000"}${event.imageUrl}`}
          alt={event.name}
          className="w-full h-56 object-cover rounded-xl mb-4"
        />
      )}
      <h1 className="text-2xl font-bold">{event.name}</h1>
      <p className="text-zinc-500 mt-1">
        {new Date(event.startsAt).toLocaleString("es-BO")} —{" "}
        {new Date(event.endsAt).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}
      </p>
      {event.description && <p className="mt-4 text-zinc-700">{event.description}</p>}

      <h2 className="text-lg font-semibold mt-6 mb-3">Elegí tus tickets</h2>
      <div className="grid gap-3">
        {allTiers.map((t) => (
          <div
            key={t.id}
            className="border border-zinc-200 rounded-xl p-4 flex items-center justify-between"
          >
            <div>
              <p className="font-medium">
                {t.sectorName} · {t.name}
              </p>
              <p className="text-sm text-zinc-500">
                Bs {t.price} · {t.available} disponibles
              </p>
            </div>
            <select
              value={cart[t.id] || 0}
              onChange={(e) => setQty(t.id, Number(e.target.value))}
              className="border border-zinc-300 rounded-md px-2 py-1.5 text-sm"
              disabled={!t.disponibleParaCompra}
            >
              {Array.from({ length: Math.min(t.available, 10) + 1 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {cartItems.length > 0 && (
        <form onSubmit={handleSubmit} className="mt-6 border-t border-zinc-200 pt-6">
          <p className="font-semibold mb-3">Total: Bs {total.toFixed(2)}</p>

          <div className="grid gap-3">
            <input
              type="text"
              placeholder="Nombre completo"
              value={buyer.name}
              onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
              required
              className="border border-zinc-300 rounded-md px-3 py-2"
            />
            <input
              type="email"
              placeholder="Email"
              value={buyer.email}
              onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
              required
              className="border border-zinc-300 rounded-md px-3 py-2"
            />
            <input
              type="tel"
              placeholder="Teléfono"
              value={buyer.phone}
              onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
              required
              className="border border-zinc-300 rounded-md px-3 py-2"
            />
          </div>

          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full bg-red-600 hover:bg-red-500 disabled:bg-zinc-300 text-white py-2.5 rounded-md font-medium"
          >
            {submitting ? "Procesando..." : "Continuar con el pago"}
          </button>
        </form>
      )}
    </div>
  );
}
