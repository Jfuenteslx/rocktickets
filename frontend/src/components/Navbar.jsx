import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { GOOGLE_ENABLED, useBuyer } from "../lib/buyerAuth";

const desktopCls = ({ isActive }) =>
  `px-3 py-2 text-sm font-medium transition-colors ${isActive ? "text-white" : "text-zinc-400 hover:text-white"}`;

const mobileCls = ({ isActive }) =>
  `block px-4 py-3 text-base font-medium transition-colors ${isActive ? "text-white" : "text-zinc-300 hover:text-white"}`;

export default function Navbar() {
  const { buyer, logout } = useBuyer();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Cierra el menú al cambiar de página.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Cierra con Escape y evita que el fondo se desplace mientras está abierto.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const links = (cls) => (
    <>
      <NavLink to="/eventos" className={cls}>
        Eventos
      </NavLink>
      <NavLink to="/recuperar" className={cls}>
        Mis tickets
      </NavLink>
      <NavLink to="/ayuda" className={cls}>
        Ayuda
      </NavLink>
      {GOOGLE_ENABLED &&
        (buyer ? (
          <NavLink to="/mis-compras" className={cls}>
            Mis compras
          </NavLink>
        ) : (
          <NavLink to="/ingresar" className={cls}>
            Ingresar
          </NavLink>
        ))}
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-black/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2" aria-label="Rocktickets, inicio">
          <span className="grid h-8 w-8 place-items-center rounded bg-brand font-display text-lg font-extrabold leading-none text-white">
            RT
          </span>
          <span className="font-display text-2xl font-bold uppercase tracking-wide text-white">
            Rock<span className="text-brand">tickets</span>
          </span>
        </Link>

        {/* Escritorio */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Principal">
          {links(desktopCls)}
          {GOOGLE_ENABLED && buyer && (
            <button type="button" onClick={logout} className="px-3 py-2 text-sm font-medium text-zinc-500 hover:text-white" title={buyer.email}>
              Salir
            </button>
          )}
        </nav>

        {/* Celular: botón hamburguesa */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded text-zinc-300 hover:text-white md:hidden"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          aria-controls="menu-movil"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav id="menu-movil" className="border-t border-line bg-black md:hidden" aria-label="Principal">
          <div className="mx-auto max-w-7xl px-2 py-2">
            {links(mobileCls)}
            {GOOGLE_ENABLED && buyer && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="block w-full px-4 py-3 text-left text-base font-medium text-zinc-500 hover:text-white"
              >
                Salir{buyer.email ? ` (${buyer.email})` : ""}
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
