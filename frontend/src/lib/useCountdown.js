import { useEffect, useState } from "react";

// Segundos que faltan hasta `iso` (mínimo 0). Se actualiza cada segundo.
export default function useCountdown(iso) {
  const compute = () => (iso ? Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(compute);

  useEffect(() => {
    setLeft(compute());
    if (!iso) return;
    const t = setInterval(() => setLeft(compute()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);

  return left;
}

export function formatCountdown(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
