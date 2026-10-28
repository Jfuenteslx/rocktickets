// Ticket con muesca: el mismo glifo del favicon
export function TicketGlyph({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M4 9h24v5.2a2.8 2.8 0 0 0 0 5.6V25H4v-5.2a2.8 2.8 0 0 0 0-5.6z" fill="#F0B93A" />
      <path d="M21 9v16" stroke="#0E1319" strokeWidth="1.6" strokeDasharray="2 2.4" />
    </svg>
  );
}

export default function Logo({ size = "md" }) {
  const text = size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <span className="inline-flex items-center gap-2.5">
      <TicketGlyph className={size === "lg" ? "h-8 w-8" : "h-6 w-6"} />
      <span className={`font-display font-bold tracking-wide ${text} leading-none`}>Rocktickets</span>
    </span>
  );
}
