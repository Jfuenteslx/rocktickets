import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateEventDto {
  @IsUUID()
  venueId!: string;

  // Obligatorio para el SUPERADMIN; un ORGANIZADOR siempre crea para sí mismo
  @IsOptional()
  @IsUUID()
  organizerId?: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}
