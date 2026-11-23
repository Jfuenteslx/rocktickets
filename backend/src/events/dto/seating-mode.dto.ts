import { IsIn } from 'class-validator';

// MESAS_FIJAS y MESAS_FLEXIBLES se habilitan en entregas siguientes; hoy el servicio las rechaza.
export const SEATING_MODES = ['NINGUNO', 'BUTACAS', 'MESAS_FIJAS', 'MESAS_FLEXIBLES'] as const;

export class SeatingModeDto {
  @IsIn(SEATING_MODES as unknown as string[])
  seatingMode!: (typeof SEATING_MODES)[number];
}
