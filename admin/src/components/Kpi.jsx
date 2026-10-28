// Cifra grande con su rótulo. `tone` solo colorea el valor (p. ej. lo que se recibe).
export default function Kpi({ label, value, hint, tone }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <p className="text-[13px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1.5 font-display text-4xl font-semibold leading-none ${tone === "lamp" ? "text-lamp" : ""}`}>{value}</p>
      {hint && <p className="mt-2 text-[13px] leading-snug text-muted">{hint}</p>}
    </div>
  );
}
