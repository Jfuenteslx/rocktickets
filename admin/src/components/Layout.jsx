import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useMatch } from "react-router-dom";
import api from "../lib/api.js";
import Logo from "./Logo.jsx";
import { useAuth } from "../lib/auth.jsx";

export default function Layout() {
  const { user, logout } = useAuth();
  const isSuper = user.role === "SUPERADMIN";

  // Pagos que los compradores avisaron y esperan verificación (solo superadmin)
  const [pending, setPending] = useState(0);
  const refreshPending = useCallback(() => {
    if (!isSuper) return;
    api.get("/payments/manual/count").then((r) => setPending(r.data.pending)).catch(() => {});
  }, [isSuper]);
  useEffect(() => {
    refreshPending();
    const t = setInterval(refreshPending, 60000);
    window.addEventListener("payments-changed", refreshPending);
    return () => {
      clearInterval(t);
      window.removeEventListener("payments-changed", refreshPending);
    };
  }, [refreshPending]);

  const links = isSuper
    ? [["/eventos", "Eventos"], ["/ventas", "Ventas"], ["/pagos", "Pagos"], ["/organizadores", "Organizadores"], ["/personal", "Personal"], ["/locales", "Locales"]]
    : [["/eventos", "Eventos"], ["/ventas", "Ventas"], ["/personal", "Personal"]];
  const org = user.role === "SUPERADMIN" ? "Rocktickets" : user.organizerName;
  // El editor del plano necesita todo el ancho de la ventana; el resto del panel va en columna centrada
  const wide = useMatch("/locales/:id/plano") !== null;
  const container = wide ? "max-w-none px-4 sm:px-6" : "max-w-5xl px-4";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className={`mx-auto flex ${container} flex-wrap items-center gap-x-6`}>
          <div className="flex h-14 items-center">
            <Logo />
          </div>
          <nav className="order-last -mx-2.5 flex h-11 w-full items-stretch gap-0.5 overflow-x-auto sm:order-none sm:mx-0 sm:h-14 sm:w-auto" aria-label="Principal">
            {links.map(([to, label]) => (
              <NavLink
                key={to} to={to}
                className={({ isActive }) =>
                  `flex items-center border-b-2 px-2.5 text-[14px] sm:px-3 sm:text-[15px] font-medium transition-colors ${
                    isActive ? "border-lamp text-ink" : "border-transparent text-muted hover:text-ink"
                  }`
                }
              >
                {label}
                {to === "/pagos" && pending > 0 && (
                  <span className="ml-1.5 rounded-full bg-lamp px-1.5 text-[12px] font-semibold leading-5 text-lamp-ink" aria-label={`${pending} por verificar`}>
                    {pending}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex h-14 items-center gap-4">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-[13px] text-muted">
                {user.role === "SUPERADMIN" ? "Superadministrador" : "Organizador"} de {org}
              </div>
            </div>
            <button type="button" onClick={logout} className="btn-ghost text-sm font-medium">
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className={`mx-auto ${container} ${wide ? "py-6" : "py-8 sm:py-10"}`}>
        <Outlet />
      </main>
    </div>
  );
}
