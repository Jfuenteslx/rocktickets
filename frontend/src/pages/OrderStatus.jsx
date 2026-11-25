import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { API_URL } from "../lib/api";
import useCountdown, { formatCountdown } from "../lib/useCountdown";
import { formatDayLong, formatMoney, formatTime } from "../lib/events";
import TicketCard from "../components/TicketCard";
import TableVoucher from "../components/TableVoucher";
import PaymentPanel from "../components/PaymentPanel";
import { LoadError, Loading } from "../components/StateMessage";

export default function OrderStatus() {
  const { token } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const loaded = useRef(false);

  const load = useCallback(
    () =>
      api
        .get(`/orders/token/${token}`)
        .then(({ data }) => {
          loaded.current = true;
          setError(null);
          setOrder(data);
        })
        .catch((err) => {
          // Un fallo pasajero mientras se consulta el pago no debe tapar la compra ya cargada.
          if (!loaded.current) setError(err);
        }),
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Mientras espera el pago consulta cada 3 s; con el pago en revisión (puede tardar horas) cada 20 s.
  // Se detiene cuando el estado cambia.
  const pending = order?.status === "PENDIENTE_PAGO";
  const inReview = pending && order.payments.some((p) => p.status === "EN_REVISION");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(load, inReview ? 20000 : 3000);
    return () => clearInterval(t);
  }, [pending, inReview, load]);

  const secondsLeft = useCountdown(pending && !inReview ? order.expiresAt : null);
  const rejected = order?.payments?.find((p) => p.status === "RECHAZADO");

  if (error)
    return (
      <LoadError
        error={error}
        notFoundText="No encontramos esta compra. Revisa que el enlace esté completo."
        onRetry={() => {
          setError(null);
          load();
        }}
      />
    );
  if (!order) return <Loading />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase text-white">Tu compra</h1>
      <p className="mt-1 text-sm text-zinc-500">Orden #{order.id.slice(0, 8)}</p>

      {order.event && (
        <div className="card mt-6 p-4">
          <p className="font-semibold text-white">{order.event.name}</p>
          <p className="mt-0.5 text-sm text-zinc-400">
            {formatDayLong(order.event.startsAt)} · {formatTime(order.event.startsAt)}
            {order.event.venueName ? ` · ${order.event.venueName}` : ""}
          </p>
        </div>
      )}

      {pending && !inReview && (
        <div className="mt-6 rounded-xl border border-amber-700/60 bg-amber-950/30 p-5">
          <div className="flex items-center justify-between gap-4">
            <p className="font-semibold text-amber-300">Completa tu pago para asegurar tus entradas</p>
            <p className="font-mono text-2xl font-bold text-amber-200" aria-label="Tiempo restante">
              {formatCountdown(secondsLeft)}
            </p>
          </div>
          <p className="mt-2 text-sm text-amber-200/80">
            Total: {formatMoney(order.payments[0]?.amount ?? 0)}. Reservamos tus entradas hasta que se acabe el tiempo: paga y avísanos antes de que llegue a cero.
          </p>
          <p className="mt-3 text-xs text-amber-200/60">Guarda este enlace: es tu acceso a la compra.</p>
        </div>
      )}

      {pending && <TableVoucher order={order} confirmed={false} />}

      {pending && <PaymentPanel token={token} order={order} onOrder={setOrder} />}

      {order.status === "EXPIRADA" && (
        <div className="card mt-6 p-5">
          <p className="font-medium text-white">{rejected ? "Esta compra se canceló." : "Esta compra expiró sin confirmarse el pago."}</p>
          {rejected && (
            <p className="mt-2 text-sm text-red-300">
              No pudimos verificar tu pago{rejected.rejectionReason ? `: ${rejected.rejectionReason}` : "."}
            </p>
          )}
          <p className="mt-1 text-sm text-zinc-400">Las entradas volvieron a estar disponibles. Si ya pagaste, escríbenos desde la página de ayuda con el número de tu orden.</p>
          <div className="mt-4 flex gap-3">
            {order.event?.id && (
              <Link to={`/eventos/${order.event.id}`} className="btn btn-primary">
                Volver a comprar
              </Link>
            )}
            <Link to="/ayuda" className="btn btn-ghost">
              Ayuda
            </Link>
          </div>
        </div>
      )}

      {order.status === "PAGADA" && (
        <div className="mt-6">
          <div className="rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-4">
            <p className="font-semibold text-emerald-300">¡Pago confirmado! Tus entradas están listas.</p>
          </div>

          <TableVoucher order={order} confirmed />

          <div className="mb-4 mt-8 flex items-center justify-between gap-3">
            <h2 className="section-title">Tus tickets ({order.tickets.length})</h2>
            <a href={`${API_URL}/orders/token/${token}/tickets.pdf`} className="btn btn-primary">
              Descargar PDF
            </a>
          </div>

          <div className="grid gap-3">
            {order.tickets.map((t) => (
              <TicketCard key={t.id} token={token} ticket={t} event={order.event} />
            ))}
          </div>
          <p className="mt-6 text-xs text-zinc-500">Presenta el QR en la puerta. Cada entrada se puede usar una sola vez.</p>
        </div>
      )}
    </div>
  );
}
