const TONES = {
  ok: "border-ok/40 bg-ok/10 text-ok",
  warn: "border-warn/40 bg-warn/10 text-warn",
  bad: "border-bad/40 bg-bad/10 text-bad",
  info: "border-[#6F93BD]/40 bg-[#6F93BD]/10 text-[#8FB0D6]",
  quiet: "border-line bg-raised text-muted",
};

export default function Badge({ tone = "quiet", children }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
