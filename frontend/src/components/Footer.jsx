import { Link } from "react-router-dom";
import { SITE } from "../lib/site";

export default function Footer() {
  const contacts = [
    SITE.instagram && { href: SITE.instagram, label: "Instagram" },
    SITE.facebook && { href: SITE.facebook, label: "Facebook" },
    SITE.whatsapp && { href: SITE.whatsapp, label: "WhatsApp" },
    SITE.email && { href: `mailto:${SITE.email}`, label: SITE.email },
  ].filter(Boolean);

  return (
    <footer className="mt-20 border-t border-line bg-black">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} Rocktickets. Todos los derechos reservados.</p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link to="/eventos" className="hover:text-white">
            Eventos
          </Link>
          <Link to="/recuperar" className="hover:text-white">
            Recuperar mis tickets
          </Link>
          <Link to="/ayuda" className="hover:text-white">
            Ayuda
          </Link>
          <Link to="/terminos" className="hover:text-white">
            Términos
          </Link>
          <Link to="/privacidad" className="hover:text-white">
            Privacidad
          </Link>
          {contacts.map((c) => (
            <a key={c.label} href={c.href} target="_blank" rel="noreferrer" className="hover:text-white">
              {c.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
