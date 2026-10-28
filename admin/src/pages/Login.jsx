import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import Logo from "../components/Logo.jsx";
import { useAuth } from "../lib/auth.jsx";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/eventos" replace />;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate("/eventos", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="relative w-full max-w-sm rounded-xl border border-line bg-surface">
        <div className="px-7 pb-7 pt-8">
          <Logo size="lg" />
          <h1 className="mt-6 font-display text-3xl font-semibold leading-tight">Entra a tu panel</h1>
          <p className="mt-2 text-[15px] leading-snug text-muted">
            Administra eventos, tickets y personal de puerta.
          </p>
        </div>

        {/* Línea perforada con muescas: el panel de acceso es un ticket */}
        <div className="relative border-t border-dashed border-line" aria-hidden="true">
          <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full border border-line bg-bg" style={{ clipPath: "inset(0 0 0 50%)" }} />
          <span className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full border border-line bg-bg" style={{ clipPath: "inset(0 50% 0 0)" }} />
        </div>

        <form onSubmit={submit} className="space-y-4 px-7 pb-8 pt-6" noValidate>
          <div>
            <label htmlFor="email" className="field-label">Correo</label>
            <input
              id="email" type="email" autoComplete="username" required className="input"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="field-label">Contraseña</label>
            <input
              id="password" type="password" autoComplete="current-password" required className="input"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={busy || !email || !password}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
