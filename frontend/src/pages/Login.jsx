import { Link, useNavigate, useSearchParams } from "react-router-dom";
import GoogleButton from "../components/GoogleButton";
import { GOOGLE_ENABLED, useBuyer } from "../lib/buyerAuth";

export default function Login() {
  const { buyer, logout } = useBuyer();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Solo rutas internas del sitio, nunca una dirección externa
  const next = params.get("next")?.startsWith("/") && !params.get("next").startsWith("//") ? params.get("next") : "/mis-compras";

  return (
    <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
      <h1 className="font-display text-5xl font-extrabold uppercase text-white">Ingresar</h1>

      {buyer ? (
        <div className="card mt-6 p-5">
          <p className="text-white">
            Ya iniciaste sesión como <span className="font-semibold">{buyer.email}</span>.
          </p>
          <div className="mt-4 flex gap-3">
            <Link to="/mis-compras" className="btn btn-primary">
              Mis compras
            </Link>
            <button type="button" onClick={logout} className="btn btn-ghost">
              Cerrar sesión
            </button>
          </div>
        </div>
      ) : (
        <div className="card mt-6 p-5">
          <p className="text-sm text-zinc-400">
            Inicia sesión con Google para ver tus compras y comprar más rápido: completamos tu nombre y correo. Comprar sin cuenta sigue siendo posible.
          </p>
          <div className="mt-5">
            {GOOGLE_ENABLED ? (
              <GoogleButton onDone={() => navigate(next, { replace: true })} />
            ) : (
              <p className="text-sm text-zinc-500">El inicio de sesión no está disponible por ahora.</p>
            )}
          </div>
          <p className="mt-5 text-xs text-zinc-500">
            Al continuar aceptas los{" "}
            <Link to="/terminos" className="underline hover:text-white">
              términos
            </Link>{" "}
            y la{" "}
            <Link to="/privacidad" className="underline hover:text-white">
              política de privacidad
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
