import { NavLink, Outlet } from "react-router-dom";
import Logo from "./Logo.jsx";
import { useAuth } from "../lib/auth.jsx";

export default function Layout() {
  const { user, logout } = useAuth();
  const isSuper = user.role === "SUPERADMIN";
  const links = isSuper
    ? [["/eventos", "Eventos"], ["/ventas", "Ventas"], ["/organizadores", "Organizadores"], ["/personal", "Personal"], ["/locales", "Locales"]]
    : [["/eventos", "Eventos"], ["/ventas", "Ventas"], ["/personal", "Personal"]];
  const org = user.role === "SUPERADMIN" ? "Rocktickets" : user.organizerName;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 px-4">
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
      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
