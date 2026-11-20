import { Link } from "react-router-dom";
import { LEGAL_UPDATED } from "../lib/legal";
import { SITE } from "../lib/site";

// Plantilla de páginas legales. `sections`: [{ title, paragraphs?: string[], items?: string[] }]
export default function LegalPage({ title, intro, sections, other }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase text-white">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">Última actualización: {LEGAL_UPDATED}</p>
      <p className="mt-6 leading-relaxed text-zinc-300">{intro}</p>

      <div className="mt-8 space-y-8">
        {sections.map((s, i) => (
          <section key={s.title}>
            <h2 className="text-lg font-semibold text-white">
              {i + 1}. {s.title}
            </h2>
            {s.paragraphs?.map((p) => (
              <p key={p} className="mt-2 leading-relaxed text-zinc-400">
                {p}
              </p>
            ))}
            {s.items && (
              <ul className="mt-2 list-disc space-y-1 pl-6 text-zinc-400">
                {s.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="card mt-10 p-5 text-sm text-zinc-400">
        <p>
          Para consultas sobre este documento escríbenos
          {SITE.email ? (
            <>
              {" "}
              a <a className="text-white underline" href={`mailto:${SITE.email}`}>{SITE.email}</a>
            </>
          ) : (
            " por los canales indicados en la página de Ayuda"
          )}
          . También puedes revisar la{" "}
          <Link to="/ayuda" className="text-white underline">
            página de Ayuda
          </Link>{" "}
          y {other}.
        </p>
      </div>
    </div>
  );
}
