import axios from "axios";
import { getBuyerToken } from "./buyerToken";

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const api = axios.create({ baseURL: API_URL });

// Si el comprador inició sesión, cada petición lleva su token (las compras de invitado no lo necesitan)
api.interceptors.request.use((config) => {
  const token = getBuyerToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
