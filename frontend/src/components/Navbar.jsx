import { Link, NavLink } from "react-router-dom";
import { GOOGLE_ENABLED, useBuyer } from "../lib/buyerAuth";

const linkCls = ({ isActive }) =>
  `px-3 py-2 text-sm font-medium transition-colors ${isActive ? "text-white" : "text-zinc-400 hover:text-white"}`;

export default function Navbar() {
  const { buyer, logout } = useBuyer();
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
        <nav className="flex items-center gap-1">
          <NavLink to="/eventos" className={linkCls}>
            Eventos
          </NavLink>
          <NavLink to="/recuperar" className={linkCls}>
            Mis tickets
          </NavLink>
          <NavLink to="/ayuda" className={linkCls}>
            Ayuda
          </NavLink>
          {GOOGLE_ENABLED &&
            (buyer ? (
              <>
                <NavLink to="/mis-compras" className={linkCls}>
                  Mis compras
                </NavLink>
                <button type="button" onClick={logout} className="px-3 py-2 text-sm font-medium text-zinc-500 hover:text-white" title={buyer.email}>
                  Salir
                </button>
              </>
            ) : (
              <NavLink to="/ingresar" className={linkCls}>
                Ingresar
              </NavLink>
            ))}
        </nav>
      </div>
    </header>
  );
}
