// Sesión del comprador: se guarda en el navegador (localStorage) y dura 30 días (la fija el backend).
const KEY = "rt-buyer-token";

export function getBuyerToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setBuyerToken(token) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento disponible (modo privado estricto): la sesión dura lo que dure la página */
  }
}
