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
