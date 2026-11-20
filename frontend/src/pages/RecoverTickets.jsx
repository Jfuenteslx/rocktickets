import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../lib/api";

// "Recuperar mis tickets": el comprador escribe su correo y recibe los enlaces de sus compras pagadas.
// La respuesta es la misma haya o no compras, así que el mensaje de éxito es deliberadamente genérico.
export default function RecoverTickets() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setState("sending");
    try {
      await api.post("/orders/recover", { email: email.trim() });
      setState("sent");
    } catch (err) {
      setState("idle");
      setError(
        err.response?.status === 429
          ? "Hiciste demasiados intentos. Espera un rato e inténtalo de nuevo."
          : "No pudimos procesar tu solicitud. Revisa el correo e inténtalo otra vez.",
      );
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase text-white">Recuperar mis tickets</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Escribe el correo que usaste al comprar y te enviaremos el enlace de tus compras pagadas.
      </p>

      {state === "sent" ? (
        <div className="mt-6 rounded-xl border border-emerald-700/60 bg-emerald-950/30 p-5">
          <p className="font-semibold text-emerald-300">Revisa tu correo</p>
          <p className="mt-1 text-sm text-emerald-100/80">
            Si hay compras pagadas con <span className="font-mono">{email.trim()}</span>, te enviamos un correo con los enlaces.
            Si no llega en unos minutos, mira en spam. Puedes pedirlo de nuevo pasados 10 minutos.
          </p>
          <Link to="/ayuda" className="mt-4 inline-block text-sm text-zinc-300 underline hover:text-white">
            ¿No llegó? Escríbenos desde Ayuda
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="card mt-6 space-y-4 p-5">
          <label className="block text-sm text-zinc-300">
            Correo de la compra
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input mt-1"
              placeholder="tucorreo@ejemplo.com"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <button type="submit" disabled={state === "sending"} className="btn btn-primary w-full">
            {state === "sending" ? "Enviando…" : "Enviarme mis enlaces"}
          </button>
        </form>
      )}
    </div>
  );
}
