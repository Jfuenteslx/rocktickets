// Aviso de éxito (con botón de cerrar) o de error
export default function Banner({ tone = "ok", children, onClose }) {
  const bad = tone === "bad";
  return (
    <div
      role={bad ? "alert" : "status"}
      className={`flex items-start justify-between gap-4 rounded-md border px-4 py-3 text-[15px] ${
        bad ? "border-bad/40 bg-bad/10 text-bad" : "border-ok/40 bg-ok/10 text-ok"
      }`}
    >
      <p className="font-medium">{children}</p>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 text-sm text-muted hover:text-ink">Cerrar</button>
      )}
    </div>
  );
}
