import { useState } from "react";
import { Link } from "react-router-dom";
import api, { API_URL } from "../lib/api";
import { formatMoney } from "../lib/events";
import GoogleButton from "./GoogleButton";
import { GOOGLE_ENABLED, useBuyer } from "../lib/buyerAuth";

// Pago con verificación manual: el comprador paga con el QR de la cuenta del negocio, deja sus
// datos y avisa "ya pagué". Un administrador verifica el depósito y recién entonces salen las
// entradas por correo. Mientras tanto la compra queda "en revisión" con las entradas reservadas.
export default function PaymentPanel({ token, order, onOrder }) {
  const { buyer: account, logout } = useBuyer();
  const [form, setForm] = useState({
    name: order.buyerName || "",
    email: order.buyerEmail || "",
    phone: order.buyerPhone || "",
  });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrFailed, setQrFailed] = useState(false);

  const payment = order.payments[0];
  const amount = formatMoney(payment?.amount ?? 0);
  const ref = order.id.slice(0, 8).toUpperCase();
  const info = order.paymentInfo ?? {};
  const inReview = order.payments.some((p) => p.status === "EN_REVISION");

  // Con sesión iniciada completa nombre y correo (sin pisar lo que ya escribió)
  const name = form.name || account?.name || "";
  const email = form.email || account?.email || "";
  const phone = form.phone;
  const valid = name.trim().length >= 3 && /^\S+@\S+\.\S+$/.test(email.trim()) && phone.replace(/\D/g, "").length >= 7 && accepted;

  async function declare(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(`/orders/token/${token}/payment/declare`, {
        buyerName: name.trim(),
        buyerEmail: email.trim(),
        buyerPhone: phone.trim(),
        acceptTerms: true,
      });
      onOrder(data);
    } catch (err) {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(" · ") : msg || "No pudimos registrar tu aviso de pago. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (inReview) {
    return (
      <div className="mt-6 rounded-xl border border-sky-700/60 bg-sky-950/30 p-5">
        <p className="font-semibold text-sky-300">Recibimos tu aviso de pago</p>
        <p className="mt-2 text-sm text-sky-100/90">
          Estamos verificando tu pago de {amount}. Cuando lo confirmemos te enviaremos las entradas a{" "}
          <span className="font-semibold text-white">{payment?.payerEmail || order.buyerEmail}</span>, y aparecerán aquí mismo.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-sky-100/80">
          <li>Tus entradas están reservadas mientras lo verificamos.</li>
          <li>Guarda el enlace de esta página: es tu acceso a la compra (orden #{ref}).</li>
          <li>
            Si pasa mucho tiempo, escríbenos desde{" "}
            <Link to="/ayuda" className="underline">
              ayuda
            </Link>{" "}
            con tu número de orden.
          </li>
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={declare} className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <p className="font-semibold text-white">1. Paga con el QR desde tu app bancaria</p>

      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {qrFailed ? (
          <div className="flex h-[220px] w-[220px] items-center justify-center rounded-lg bg-zinc-800 p-4 text-center text-sm text-zinc-400">
            El QR no está disponible por ahora. Escríbenos desde ayuda.
          </div>
        ) : (
          <img
            src={`${API_URL}/orders/token/${token}/payment/qr.png`}
            alt="Código QR de pago"
            width={220}
            height={220}
            onError={() => setQrFailed(true)}
            className="rounded-lg bg-white p-2"
          />
        )}
        <div className="text-sm text-zinc-300">
          <p className="text-zinc-400">Monto a pagar</p>
          <p className="font-mono text-3xl font-bold text-white">{amount}</p>
          <p className="mt-3 text-zinc-400">Código de tu orden</p>
          <p className="font-mono text-xl font-bold text-white">#{ref}</p>
          {(info.bank || info.holder) && (
            <p className="mt-3 text-zinc-400">
              {info.bank}
              {info.bank && info.holder ? " · " : ""}
              {info.holder}
            </p>
          )}
          <ol className="mt-3 list-decimal space-y-1 pl-5">
            <li>Abre la app de tu banco y elige pagar con QR.</li>
            <li>Escanea este código y paga el monto exacto.</li>
            <li>{info.note || "Si tu banco lo permite, escribe el código de tu orden en el detalle del pago."}</li>
          </ol>
        </div>
      </div>

      <p className="mt-6 font-semibold text-white">2. Déjanos tus datos y avísanos que pagaste</p>
      <p className="mt-1 text-sm text-zinc-400">Aquí te enviaremos las entradas cuando verifiquemos el pago.</p>

      {GOOGLE_ENABLED && (
        <div className="mt-3">
          {account ? (
            <p className="text-sm text-zinc-400">
              Comprando como <span className="text-white">{account.email}</span> ·{" "}
              <button type="button" onClick={logout} className="underline hover:text-white">
                Salir
              </button>
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-zinc-400">¿Más rápido? Inicia sesión y completamos tus datos:</p>
              <GoogleButton />
            </>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <div>
          <label htmlFor="pay-name" className="sr-only">
            Nombre completo
          </label>
          <input
            id="pay-name"
            type="text"
            autoComplete="name"
            placeholder="Nombre completo"
            value={name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            minLength={3}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="pay-email" className="sr-only">
            Correo electrónico
          </label>
          <input
            id="pay-email"
            type="email"
            autoComplete="email"
            placeholder="Correo electrónico (aquí llegan tus entradas)"
            value={email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            className="input"
          />
        </div>
        <div>
          <label htmlFor="pay-phone" className="sr-only">
            Número de celular
          </label>
          <input
            id="pay-phone"
            type="tel"
            autoComplete="tel"
            placeholder="Número de celular"
            value={phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            required
            className="input"
          />
        </div>
      </div>

      <label className="mt-4 flex items-start gap-2 text-sm text-zinc-400">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} required className="mt-1" />
        <span>
          Acepto los{" "}
          <Link to="/terminos" target="_blank" className="text-white underline">
            términos y condiciones
          </Link>{" "}
          y la{" "}
          <Link to="/privacidad" target="_blank" className="text-white underline">
            política de privacidad
          </Link>
          .
        </span>
      </label>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <button type="submit" disabled={!valid || busy} className="btn btn-primary mt-4 w-full py-3">
        {busy ? "Enviando…" : "Ya realicé el pago"}
      </button>
      <p className="mt-3 text-xs text-zinc-500">
        Aprieta el botón solo después de haber hecho el pago. Verificamos el depósito en nuestro banco: si no lo encontramos, la compra se
        cancela y las entradas vuelven a la venta.
      </p>
    </form>
  );
}
