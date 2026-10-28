import axios from "axios";

// La sesión vive en sessionStorage: se borra al cerrar la pestaña. Es un panel de
// administración, no hace falta que la sesión sobreviva días. (El token vence a las 8 h.)
const TOKEN_KEY = "rt-admin-token";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* sin almacenamiento disponible: la sesión dura lo que dure la página */
  }
}

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si el backend dice que la sesión ya no vale (vencida, cuenta desactivada…), se sale
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}
api.interceptors.response.use(
  (r) => r,
  (error) => {
    const url = error.config?.url ?? "";
    if (error.response?.status === 401 && !url.includes("/auth/login")) onUnauthorized();
    return Promise.reject(error);
  }
);

// Mensaje legible a partir de un error de la API (NestJS devuelve string o lista)
export function errorMessage(error, fallback = "Algo salió mal. Inténtalo de nuevo.") {
  if (!error.response) return "No se pudo conectar con el servidor. Revisa que el backend esté en marcha.";
  if (error.response.status === 429) return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
  const m = error.response.data?.message;
  if (Array.isArray(m)) return m.join(". ");
  if (typeof m === "string") return m;
  return fallback;
}

export default api;
