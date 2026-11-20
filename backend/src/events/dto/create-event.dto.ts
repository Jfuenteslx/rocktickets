import { IsDateString, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { EVENT_CATEGORIES, type EventCategory } from '../event-categories.js';

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

  @IsOptional()
  @IsIn(EVENT_CATEGORIES)
  category?: EventCategory;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}
