import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SearchBar({ initial = "" }) {
  const [q, setQ] = useState(initial);
  const navigate = useNavigate();

  function submit(e) {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/eventos?q=${encodeURIComponent(term)}` : "/eventos");
  }

  return (
    <form onSubmit={submit} role="search" className="mx-auto flex w-full max-w-2xl overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 focus-within:border-brand">
      <label htmlFor="home-search" className="sr-only">
        Buscar por artista o evento
      </label>
      <input
        id="home-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por artista o evento"
        className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
      />
      <button type="submit" className="bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-hover">
        Buscar
      </button>
    </form>
  );
}
