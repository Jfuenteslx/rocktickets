import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "./api";
import { getBuyerToken, setBuyerToken } from "./buyerToken";

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
// Sin ID de cliente de Google no se muestra ninguna opción de iniciar sesión
export const GOOGLE_ENABLED = Boolean(GOOGLE_CLIENT_ID);

const BuyerContext = createContext(null);

export function BuyerProvider({ children }) {
  const [buyer, setBuyer] = useState(null);
  const [ready, setReady] = useState(!getBuyerToken()); // sin token no hay nada que restaurar

  // Al abrir el sitio, valida con el backend la sesión guardada
  useEffect(() => {
    if (!getBuyerToken()) return;
    api
      .get("/buyers/me")
      .then(({ data }) => setBuyer(data))
      .catch((err) => {
        // Solo se descarta si el backend dice que ya no vale; un fallo de red conserva la sesión
        if (err.response?.status === 401) setBuyerToken(null);
      })
      .finally(() => setReady(true));
  }, []);

  // `credential` es el token que entrega Google al navegador
  const loginWithGoogle = useCallback(async (credential) => {
    const { data } = await api.post("/buyers/auth/google", { idToken: credential });
    setBuyerToken(data.token);
    setBuyer(data.buyer);
    return data.buyer;
  }, []);

  const logout = useCallback(() => {
    setBuyerToken(null);
    setBuyer(null);
    window.google?.accounts?.id?.disableAutoSelect?.();
  }, []);

  const value = useMemo(() => ({ buyer, ready, loginWithGoogle, logout }), [buyer, ready, loginWithGoogle, logout]);
  return <BuyerContext.Provider value={value}>{children}</BuyerContext.Provider>;
}

export function useBuyer() {
  const ctx = useContext(BuyerContext);
  if (!ctx) throw new Error("useBuyer debe usarse dentro de BuyerProvider");
  return ctx;
}
