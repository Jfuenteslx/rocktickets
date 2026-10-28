import { IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateTierDto {
  @IsUUID()
  sectorId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsIn(['VENTA', 'CORTESIA'])
  kind?: 'VENTA' | 'CORTESIA';

  // Ignorado (se fuerza a 0) cuando kind = CORTESIA
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
