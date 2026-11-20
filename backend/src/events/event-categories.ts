// Categorías de evento para agrupar la web pública. Se guardan como texto (no enum de
// Postgres) para poder agregar una sin migración; la lista válida la impone el DTO.
export const EVENT_CATEGORIES = ['CONCIERTO', 'FESTIVAL', 'FIESTA', 'TEATRO_ARTE', 'OTRO'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
