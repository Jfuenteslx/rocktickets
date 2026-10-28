// Cliente mínimo de la API de Rocktickets. Sin dependencias: fetch + token.
let base = '';
let token = null;
let onUnauthorized = () => {};

export const setBase = (url) => { base = (url || '').trim().replace(/\/+$/, ''); };
export const getBase = () => base;
export const setToken = (t) => { token = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status; // 0 = sin conexión
  }
}

async function request(method, path, body, opts) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts?.timeout ?? 10000);
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError('No hay conexión con el servidor', 0);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (res.status === 401 && path !== '/auth/login') onUnauthorized();
  if (!res.ok) {
    const m = data?.message;
    throw new ApiError(Array.isArray(m) ? m.join('. ') : m || 'Algo salió mal', res.status);
  }
  return data;
}

export const api = {
  get token() { return token; },
  get: (p, opts) => request('GET', p, undefined, opts),
  post: (p, b, opts) => request('POST', p, b ?? {}, opts),
};
