import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LAYOUT_CANVAS } from '../layout.constants.js';
import { MAX_LABEL_LENGTH, MAX_SEATS_PER_SECTOR, MAX_SEATS_PER_TABLE, MAX_TABLES_PER_SECTOR } from '../seating.constants.js';

// Asiento de una mesa (sin fila: la mesa ya lo agrupa)
export class TableSeatDto {
  // Sin id = asiento nuevo
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_LABEL_LENGTH)
  label!: string;

  @IsInt()
  @Min(0)
  @Max(LAYOUT_CANVAS.width)
  x!: number;

  @IsInt()
  @Min(0)
  @Max(LAYOUT_CANVAS.height)
  y!: number;

  @IsBoolean()
  active!: boolean;
}

// Asiento de una fila de butacas (no pertenece a ninguna mesa)
export class RowSeatDto extends TableSeatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_LABEL_LENGTH)
  rowLabel!: string;
}

export class SeatingTableDto {
  // Sin id = mesa nueva
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(MAX_LABEL_LENGTH)
  label!: string;

  @IsInt()
  @Min(0)
  @Max(LAYOUT_CANVAS.width)
  x!: number;

  @IsInt()
  @Min(0)
  @Max(LAYOUT_CANVAS.height)
  y!: number;

  @IsArray()
  @ArrayMaxSize(MAX_SEATS_PER_TABLE)
  @ValidateNested({ each: true })
  @Type(() => TableSeatDto)
  seats!: TableSeatDto[];
}

// Guardar mesas y asientos es "estado completo" del sector: lo que no llegue se borra.
export class SaveSeatingDto {
  @IsArray()
  @ArrayMaxSize(MAX_TABLES_PER_SECTOR)
  @ValidateNested({ each: true })
  @Type(() => SeatingTableDto)
  tables!: SeatingTableDto[];

  @IsArray()
  @ArrayMaxSize(MAX_SEATS_PER_SECTOR)
  @ValidateNested({ each: true })
  @Type(() => RowSeatDto)
  rows!: RowSeatDto[];
}
