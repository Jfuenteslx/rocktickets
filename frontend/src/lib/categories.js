// Debe coincidir con EVENT_CATEGORIES del backend (events/event-categories.ts).
export const CATEGORIES = [
  { value: "CONCIERTO", label: "Conciertos", accent: "bg-sky-500" },
  { value: "FESTIVAL", label: "Festivales", accent: "bg-amber-500" },
  { value: "FIESTA", label: "Fiestas", accent: "bg-fuchsia-500" },
  { value: "TEATRO_ARTE", label: "Teatro y arte", accent: "bg-emerald-500" },
  { value: "OTRO", label: "Otros eventos", accent: "bg-zinc-500" },
];

export const categoryLabel = (value) => CATEGORIES.find((c) => c.value === value)?.label ?? "Evento";
