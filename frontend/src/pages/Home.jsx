import { Link } from "react-router-dom";
import useEvents from "../lib/useEvents";
import { CATEGORIES } from "../lib/categories";
import HeroCarousel from "../components/HeroCarousel";
import SearchBar from "../components/SearchBar";
import EventRow from "../components/EventRow";
import { ErrorBox, Loading } from "../components/StateMessage";

const STEPS = [
  { n: "1", title: "Elige tu evento", text: "Mira la cartelera y escoge el sector y la cantidad de entradas." },
  { n: "2", title: "Paga con QR", text: "Reservamos tus entradas 15 minutos mientras completas el pago." },
  { n: "3", title: "Entra con tu QR", text: "Descarga tus tickets en PNG o PDF y preséntalos en la puerta." },
];

export default function Home() {
  const { events, loading, error } = useEvents();
  const featured = events.slice(0, 5);

  return (
    <div>
      {/* Hero */}
      <section className="border-b border-line bg-[radial-gradient(ellipse_at_top_left,rgba(225,29,46,0.18),transparent_55%)]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:py-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-brand">Música en vivo</p>
            <h1 className="mt-3 font-display text-5xl font-extrabold uppercase leading-[0.95] text-white sm:text-7xl">
              Tu entrada al <span className="text-brand">rock</span> en vivo
            </h1>
            <p className="mt-5 max-w-md text-zinc-400">
              Compra tus entradas para conciertos y noches en vivo, y entra con un QR en tu celular.
            </p>
            <Link to="/eventos" className="btn btn-primary mt-7 px-6 py-3">
              Ver eventos
            </Link>
          </div>
          {featured.length > 0 && <HeroCarousel events={featured} />}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="-mt-6">
          <SearchBar />
        </div>

        {loading && <Loading text="Cargando eventos…" />}
        {error && <ErrorBox>{error}</ErrorBox>}

        {!loading && !error && events.length === 0 && (
          <p className="py-24 text-center text-zinc-500">Aún no hay eventos publicados. Vuelve pronto.</p>
        )}

        {!loading && !error && events.length > 0 && (
          <>
            <EventRow title="Próximos eventos" to="/eventos" events={events} max={8} />
            {CATEGORIES.map((c) => (
              <EventRow
                key={c.value}
                title={c.label}
                accent={c.accent}
                to={`/eventos?categoria=${c.value}`}
                events={events.filter((e) => e.category === c.value)}
              />
            ))}
          </>
        )}

        {/* Cómo funciona */}
        <section className="mt-20">
          <h2 className="section-title">Cómo funciona</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="card p-6">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand font-display text-lg font-bold text-white">{s.n}</span>
                <h3 className="mt-4 font-semibold text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm text-zinc-400">{s.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-zinc-500">
            ¿Dudas? Revisa la{" "}
            <Link to="/ayuda" className="text-zinc-300 underline underline-offset-4 hover:text-white">
              página de ayuda
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
