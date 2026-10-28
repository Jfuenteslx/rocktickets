import { Link } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="bg-zinc-900 text-white px-6 py-4">
      <Link to="/" className="text-xl font-bold tracking-tight">
        🎟️ Rocktickets
      </Link>
    </nav>
  );
}
