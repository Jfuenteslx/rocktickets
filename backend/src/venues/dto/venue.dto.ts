import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateVenueDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Un día de la semana: 0 = domingo … 6 = sábado. Si cierra después de medianoche
// (ej. 20:00 a 03:00) basta con poner un cierre menor que la apertura.
export class OpeningDayDto {
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;

  @IsBoolean()
  closed!: boolean;

  @ValidateIf((o: OpeningDayDto) => !o.closed)
  @Matches(HHMM, { message: 'La hora de apertura debe tener formato HH:MM' })
  open?: string;

  @ValidateIf((o: OpeningDayDto) => !o.closed)
  @Matches(HHMM, { message: 'La hora de cierre debe tener formato HH:MM' })
  close?: string;
}

export class UpdateVenueDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  // Cadena vacía = borrar el dato
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  mapsUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OpeningDayDto)
  openingHours?: OpeningDayDto[];
}

export class ReorderPhotosDto {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  photoIds!: string[];
}

export class CreateSectorDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  capacity!: number;
}

export class UpdateSectorDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  capacity?: number;
}
