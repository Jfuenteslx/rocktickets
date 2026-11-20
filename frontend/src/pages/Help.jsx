import { Link } from "react-router-dom";
import { SITE, RESERVATION_MINUTES } from "../lib/site";

const FAQ = [
  {
    q: "¿Cómo compro mis entradas?",
    a: "Entra al evento, elige el sector y la cantidad, completa tus datos y sigue las instrucciones de pago. No necesitas crear una cuenta.",
  },
  {
    q: "¿Cuánto tiempo tengo para pagar?",
    a: `Al continuar con el pago reservamos tus entradas durante ${RESERVATION_MINUTES} minutos. Si no se confirma el pago en ese tiempo, la reserva se libera y tendrás que empezar de nuevo.`,
  },
  {
    q: "¿Dónde veo mis entradas?",
    a: "Cuando el pago se confirma, tu página de compra muestra los tickets con su código QR. Puedes descargarlos en PNG (uno por uno) o en un solo PDF. Guarda el enlace de esa página: es tu acceso a la compra.",
  },
  {
    q: "Perdí el enlace de mi compra",
    a: (
      <>
        Entra a{" "}
        <Link to="/recuperar" className="text-white underline">
          Recuperar mis tickets
        </Link>{" "}
        y escribe el correo de tu compra: te enviamos los enlaces. Si no te llega, escríbenos con el nombre y el correo o teléfono que usaste y te ayudamos.
      </>
    ),
  },
  {
    q: "¿Cómo entro al evento?",
    a: "Presenta el código QR de cada entrada en la puerta, desde tu celular o impreso. Cada QR se puede usar una sola vez, así que no lo compartas.",
  },
  {
    q: "¿Qué pasa si el evento se cancela?",
    a: "Si un evento se cancela, nos comunicaremos con quienes compraron para coordinar el reembolso.",
  },
];

export default function Help() {
  const contacts = [
    SITE.whatsapp && { href: SITE.whatsapp, label: "WhatsApp" },
    SITE.instagram && { href: SITE.instagram, label: "Instagram" },
    SITE.facebook && { href: SITE.facebook, label: "Facebook" },
    SITE.email && { href: `mailto:${SITE.email}`, label: SITE.email },
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase text-white">Ayuda</h1>
      <p className="mt-3 text-zinc-400">Respuestas rápidas sobre tu compra y tus entradas.</p>

      <div className="mt-8 space-y-3">
        {FAQ.map((item) => (
          <details key={item.q} className="card group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-white">
              {item.q}
              <span className="text-brand transition-transform group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">{item.a}</p>
          </details>
        ))}
      </div>

      <div className="card mt-10 p-6">
        <h2 className="font-semibold text-white">¿Sigues con dudas?</h2>
        {contacts.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-3">
            {contacts.map((c) => (
              <a key={c.label} href={c.href} target="_blank" rel="noreferrer" className="btn btn-ghost">
                {c.label}
              </a>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">Pronto publicaremos nuestros canales de contacto.</p>
        )}
      </div>
    </div>
  );
}
