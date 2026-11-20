import { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID, GOOGLE_ENABLED, useBuyer } from "../lib/buyerAuth";

let scriptPromise = null;
function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("No se pudo cargar Google"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// Botón oficial "Continuar con Google". No se muestra si el sitio no tiene configurado el ID de cliente.
export default function GoogleButton({ onDone }) {
  const { loginWithGoogle } = useBuyer();
  const holder = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [error, setError] = useState("");

  useEffect(() => {
    if (!GOOGLE_ENABLED) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !holder.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async ({ credential }) => {
            setError("");
            try {
              const buyer = await loginWithGoogle(credential);
              onDoneRef.current?.(buyer);
            } catch (err) {
              setError(err.response?.data?.message || "No pudimos iniciar sesión. Inténtalo de nuevo.");
            }
          },
        });
        window.google.accounts.id.renderButton(holder.current, {
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          locale: "es",
        });
      })
      .catch(() => setError("No pudimos cargar el inicio de sesión de Google. Revisa tu conexión."));
    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle]);

  if (!GOOGLE_ENABLED) return null;
  return (
    <div>
      <div ref={holder} />
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
