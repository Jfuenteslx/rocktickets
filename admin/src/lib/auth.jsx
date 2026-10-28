import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { getToken, setToken, setUnauthorizedHandler, errorMessage } from "./api.js";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// Roles que pueden usar este panel (el personal de puerta usa la app de verificación)
const PANEL_ROLES = ["SUPERADMIN", "ORGANIZADOR"];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
  }, [logout]);

  // Al abrir: si hay token guardado, se valida contra el backend
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api
      .get("/auth/me")
      .then((r) => {
        if (cancelled) return;
        if (PANEL_ROLES.includes(r.data.role)) setUser(r.data);
        else logout();
      })
      .catch(() => !cancelled && logout())
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [logout]);

  const login = useCallback(async (email, password) => {
    let token;
    try {
      ({ data: { token } } = await api.post("/auth/login", { email, password }));
    } catch (e) {
      throw new Error(errorMessage(e, "No se pudo iniciar sesión."));
    }
    setToken(token);
    const { data } = await api.get("/auth/me");
    if (!PANEL_ROLES.includes(data.role)) {
      setToken(null);
      throw new Error("Esta cuenta es de personal de puerta y no tiene acceso al panel.");
    }
    setUser(data);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
