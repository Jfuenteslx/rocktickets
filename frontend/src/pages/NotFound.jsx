import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="font-display text-7xl font-extrabold text-brand">404</p>
      <h1 className="mt-2 text-xl font-semibold text-white">No encontramos esta página</h1>
      <Link to="/" className="btn btn-primary mt-6">
        Volver al inicio
      </Link>
    </div>
  );
}
