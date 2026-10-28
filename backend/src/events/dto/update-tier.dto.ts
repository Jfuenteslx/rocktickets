import { IsDateString, IsNumber, IsOptional, IsString, Min, MinLength, ValidateIf } from 'class-validator';

// Solo lo comercial. El tipo (venta/cortesía) y el sector NO cambian: los tickets
// ya asignados dependen de ellos. Para eso se crea otro tier.
export class UpdateTierDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  // null = quitar el límite
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  endsAt?: string | null;
}
