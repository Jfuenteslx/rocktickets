import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { IsBoolean, ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class TablePackageDto {
  @IsString()
  @MaxLength(60)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(30)
  people!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price!: number;

  // Botellas entre las que elige el comprador (puede ir vacío)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  bottleOptions?: string[];
}

export class UpdateTablePackageDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(30) people?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) price?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(40, { each: true }) bottleOptions?: string[];
}

// packageId null/ausente = quitar el paquete de esas mesas
export class AssignTablePackageDto {
  @IsOptional()
  @IsUUID()
  packageId?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  tableIds!: string[];
}

export class TableValidUntilDto {
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora debe ser HH:MM (ej. 23:00)' })
  tableValidUntil!: string;
}

export class TableBlocksDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  tableIds!: string[];

  @IsBoolean()
  blocked!: boolean;
}

export class SetupSectorDto {
  @IsUUID()
  sectorId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;
}

export class SetupTablePriceDto {
  @IsInt()
  @Min(1)
  @Max(30)
  people!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price!: number;
}

export class SetupDto {
  @IsString()
  @Matches(/^(NINGUNO|BUTACAS|MESAS_FIJAS|MESAS_FLEXIBLES)$/)
  seatingMode!: 'NINGUNO' | 'BUTACAS' | 'MESAS_FIJAS' | 'MESAS_FLEXIBLES';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SetupSectorDto)
  sectors?: SetupSectorDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SetupTablePriceDto)
  tablePrices?: SetupTablePriceDto[];

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  tableValidUntil?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  blockedTableIds?: string[];
}
