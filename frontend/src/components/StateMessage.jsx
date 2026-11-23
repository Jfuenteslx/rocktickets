export function Loading({ text = "Cargando…" }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-zinc-500" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-brand" aria-hidden="true" />
      {text}
    </div>
  );
}

export function ErrorBox({ children }) {
  return (
    <p role="alert" className="mx-auto my-16 max-w-md rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-center text-sm text-red-300">
      {children}
    </p>
  );
}

// ¿El servidor respondió que el recurso no existe (o que el enlace es inválido)?
// Todo lo demás (sin conexión, 5xx, límite de peticiones) es un fallo temporal.
export function isNotFound(err) {
  const status = err?.response?.status;
  return Boolean(status) && status < 500 && status !== 429 && status !== 408;
}

// Mensaje de error de carga: distingue "no existe" de "no pudimos conectar".
export function LoadError({ error, notFoundText, onRetry }) {
  if (isNotFound(error)) return <ErrorBox>{notFoundText}</ErrorBox>;
  return (
    <div role="alert" className="mx-auto my-16 max-w-md rounded-lg border border-red-900 bg-red-950/40 px-4 py-4 text-center text-sm text-red-300">
      <p>No pudimos conectar con el servidor. Si ya hiciste una compra, no se pierde: vuelve a intentarlo en un momento.</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-primary mt-4">
          Reintentar
        </button>
      )}
    </div>
  );
}
