import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { sectorTypeEnum, sectorViewEnum, venueElementKindEnum } from '../../db/schema/enums.js';
import { LAYOUT_CANVAS, MAX_LEVELS, MAX_POINTS } from '../layout.constants.js';

// Posición y tamaño de un bloque, en unidades del lienzo. Que quepa en el lienzo y
// que no tenga un tamaño mínimo ridículo lo comprueba layout.validation.ts.
export class RectDto {
  @IsInt()
  @Min(0)
  @Max(LAYOUT_CANVAS.width)
  x!: number;

  @IsInt()
  @Min(0)
  @Max(LAYOUT_CANVAS.height)
  y!: number;

  @IsInt()
  @Min(1)
  @Max(LAYOUT_CANVAS.width)
  w!: number;

  @IsInt()
  @Min(1)
  @Max(LAYOUT_CANVAS.height)
  h!: number;
}

// Vértice de un sector irregular, en unidades del lienzo
export class PointDto {
  @IsInt()
  @Min(0)
  @Max(LAYOUT_CANVAS.width)
  x!: number;

  @IsInt()
  @Min(0)
  @Max(LAYOUT_CANVAS.height)
  y!: number;
}

export class LayoutSectorDto {
  // Sin id = sector nuevo
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(100000)
  capacity!: number;

  @IsIn(sectorTypeEnum.enumValues)
  type!: (typeof sectorTypeEnum.enumValues)[number];

  @IsIn(sectorViewEnum.enumValues)
  view!: (typeof sectorViewEnum.enumValues)[number];

  @IsBoolean()
  accessible!: boolean;

  @IsBoolean()
  sellable!: boolean;

  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color debe ser un hexadecimal como #F28C0F' })
  color!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  buyerText?: string | null;

  // null o ausente = sector todavía sin ubicar en el plano (si hay `points`, el rectángulo se ignora)
  @IsOptional()
  @ValidateNested()
  @Type(() => RectDto)
  rect?: RectDto | null;

  // Forma irregular (para recortar pasillos). Sin `points` el sector es el rectángulo `rect`.
  // Que el polígono sea simple, quepa y no pise a otro lo comprueba layout.validation.ts.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(MAX_POINTS)
  @ValidateNested({ each: true })
  @Type(() => PointDto)
  points?: PointDto[] | null;
}

export class LayoutElementDto {
  // Sin id = elemento nuevo
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsIn(venueElementKindEnum.enumValues)
  kind!: (typeof venueElementKindEnum.enumValues)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ValidateNested()
  @Type(() => RectDto)
  rect!: RectDto;
}

export class LayoutLevelDto {
  // Sin id = nivel nuevo
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LayoutSectorDto)
  sectors!: LayoutSectorDto[];

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LayoutElementDto)
  elements!: LayoutElementDto[];
}

// Guardar el plano es "estado completo": la lista de niveles (en orden de pestañas) y,
// dentro de cada uno, sus sectores y elementos. Lo que no aparezca entre los elementos
// se borra; lo que no aparezca entre los niveles se borra si ya no tiene sectores.
// Los sectores, en cambio, NUNCA se borran por omisión: solo los de deleteSectorIds.
export class SaveLayoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LEVELS)
  @ValidateNested({ each: true })
  @Type(() => LayoutLevelDto)
  levels!: LayoutLevelDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  deleteSectorIds?: string[];
}
