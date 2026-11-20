import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";
import { useBuyer } from "../lib/buyerAuth";
import { formatDayLong, formatMoney, formatTime } from "../lib/events";
import { ErrorBox, Loading } from "../components/StateMessage";

const STATUS = {
  PAGADA: { text: "Pagada", cls: "bg-emerald-900/50 text-emerald-300" },
  PENDIENTE_PAGO: { text: "Pendiente de pago", cls: "bg-amber-900/50 text-amber-300" },
  EXPIRADA: { text: "Expirada", cls: "bg-zinc-800 text-zinc-400" },
};

export default function MyOrders() {
  const { buyer, ready } = useBuyer();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!buyer) return;
    api
      .get("/buyers/me/orders")
      .then(({ data }) => setOrders(data))
      .catch(() => setError("No pudimos cargar tus compras. Inténtalo de nuevo."));
  }, [buyer]);

  if (!ready) return <Loading />;
  if (!buyer) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <h1 className="font-display text-5xl font-extrabold uppercase text-white">Mis compras</h1>
        <p className="mt-3 text-zinc-400">Inicia sesión con Google para ver tus compras.</p>
        <Link to="/ingresar?next=/mis-compras" className="btn btn-primary mt-5 inline-flex">
          Ingresar
        </Link>
      </div>
    );
  }
  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!orders) return <Loading />;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase text-white">Mis compras</h1>
      <p className="mt-2 text-sm text-zinc-500">{buyer.email}</p>

      {orders.length === 0 ? (
        <div className="card mt-6 p-6 text-sm text-zinc-400">
          <p>Todavía no tienes compras hechas con esta cuenta.</p>
          <p className="mt-2">
            Las compras que hiciste antes sin iniciar sesión no aparecen aquí: recupéralas desde{" "}
            <Link to="/recuperar" className="text-white underline">
              Recuperar mis tickets
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((o) => {
            const st = STATUS[o.status] ?? { text: o.status, cls: "bg-zinc-800 text-zinc-400" };
            return (
              <li key={o.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{o.eventName}</p>
                  <p className="text-sm text-zinc-400">
                    {formatDayLong(o.startsAt)} · {formatTime(o.startsAt)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {o.tickets} entrada(s) · {formatMoney(o.total)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.text}</span>
                  <Link to={`/orden/${o.accessToken}`} className="btn btn-primary">
                    Ver
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
