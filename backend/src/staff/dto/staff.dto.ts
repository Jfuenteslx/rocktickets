import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Solo lo usa el superadmin: sin valor = personal de Rocktickets (todos los eventos).
  // Un organizador siempre crea para su propia organización (se ignora/rechaza otro valor).
  @IsOptional()
  @IsUUID()
  organizerId?: string;
}

export class SetApprovalDto {
  @IsIn(['APROBADO', 'RECHAZADO'])
  status!: 'APROBADO' | 'RECHAZADO';
}

export class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
