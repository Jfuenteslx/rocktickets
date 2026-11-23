import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class AssignSeatsDto {
  // Asientos del plano (seat.id) que se asignan al tier, o se sacan de él si release = true
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  seatIds!: string[];

  @IsOptional()
  @IsBoolean()
  release?: boolean;
}
