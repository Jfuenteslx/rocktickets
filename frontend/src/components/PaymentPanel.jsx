import { useState } from "react";
import api, { API_URL } from "../lib/api";
import useCountdown, { formatCountdown } from "../lib/useCountdown";
import { formatMoney } from "../lib/events";

const BANK_ACTIONS = [
  { scenario: "EXACTO", label: "Pagar monto exacto" },
  { scenario: "MONTO_DISTINTO", label: "Pagar monto distinto" },
  { scenario: "DOBLE", label: "Pagar dos veces" },
  { scenario: "REINTENTO_WEBHOOK", label: "Reintento del aviso" },
];

// Pago con QR (PagosYa embebido): el QR se muestra aquí mismo. Cuando el banco confirma,
// la pantalla de la orden (que consulta cada 3 s) pasa sola a "Pago confirmado".
export default function PaymentPanel({ token, order, onOrder }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const active = order.payments.find((p) => p.status === "PENDIENTE");
  const unreconciled = order.payments.find((p) => p.status === "NO_CONCILIADO");
  const secondsLeft = useCountdown(active?.checkoutExpiresAt ?? null);
  const hasQr = Boolean(active?.checkoutExpiresAt);
  const qrExpired = hasQr && secondsLeft <= 0;
  const amount = formatMoney(order.payments[0]?.amount ?? 0);

  async function regenerate() {
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.post(`/orders/token/${token}/payment/regenerate`);
      onOrder(data);
    } catch (err) {
      setMessage(err.response?.data?.message || "No se pudo generar el QR. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function simulate(scenario) {
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.post(`/demo/pagosya/${active.providerPaymentId}/pay`, { scenario });
      setMessage(`Banco simulado: ${data.results.map((r) => r.body?.outcome ?? r.status).join(" → ")}`);
    } catch (err) {
      setMessage(err.response?.data?.message || "No se pudo simular el pago");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="font-semibold text-white">Paga con QR desde tu app bancaria</p>
      <p className="mt-1 text-sm text-zinc-400">Total a pagar: {amount}</p>

      {unreconciled && (
        <div className="mt-4 rounded-lg border border-red-800/60 bg-red-950/30 p-3 text-sm text-red-200">
          Recibimos un pago por un monto distinto al de tu compra, así que no pudimos confirmarlo automáticamente.
          Escríbenos desde la página de ayuda con tu número de orden y lo resolvemos.
        </div>
      )}

      {hasQr && !qrExpired && (
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <img
            src={`${API_URL}/orders/token/${token}/payment/qr.png?cb=${active.id}`}
            alt="Código QR de pago"
            width={220}
            height={220}
            className="rounded-lg bg-white p-2"
          />
          <div className="text-sm text-zinc-300">
            <ol className="list-decimal space-y-1 pl-5">
              <li>Abre la app de tu banco.</li>
              <li>Elige pagar con QR y escanea este código.</li>
              <li>Confirma el pago. Esta pantalla se actualiza sola.</li>
            </ol>
            <p className="mt-3 text-zinc-400">
              El QR vence en <span className="font-mono font-bold text-white">{formatCountdown(secondsLeft)}</span>
            </p>
          </div>
        </div>
      )}

      {(!hasQr || qrExpired) && (
        <div className="mt-4">
          <p className="text-sm text-zinc-400">
            {qrExpired ? "El QR venció, pero tu reserva sigue activa." : "Todavía no tenemos un QR para esta compra."}
          </p>
          <button onClick={regenerate} disabled={busy} className="btn btn-primary mt-3">
            {busy ? "Generando…" : "Generar nuevo QR"}
          </button>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-amber-300">{message}</p>}

      {/* Solo en desarrollo (npm run dev): las compilaciones de producción no lo incluyen. */}
      {import.meta.env.DEV && hasQr && !qrExpired && (
        <div className="mt-5 border-t border-zinc-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">🧪 Banco simulado (demo)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {BANK_ACTIONS.map((a) => (
              <button
                key={a.scenario}
                onClick={() => simulate(a.scenario)}
                disabled={busy}
                className="btn bg-amber-600 text-white hover:bg-amber-500"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
