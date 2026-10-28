import { IsInt } from 'class-validator';

export class AssignTicketsDto {
  // > 0 asigna tickets sin tier a este tier; < 0 los devuelve al pool.
  @IsInt()
  quantity!: number;
}
