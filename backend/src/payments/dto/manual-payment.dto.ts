import { Equals, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// Lo que el comprador completa en la pantalla de pago antes de avisar que pagó
export class DeclarePaymentDto {
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Escribe tu nombre completo' })
  @MaxLength(120)
  buyerName!: string;

  @Transform(trim)
  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(160)
  buyerEmail!: string;

  // Celular: 7 a 15 dígitos, con o sin +, espacios o guiones
  @Transform(trim)
  @Matches(/^\+?[0-9][0-9 \-]{5,18}[0-9]$/, { message: 'Escribe un número de celular válido' })
  buyerPhone!: string;

  @Equals(true, { message: 'Debes aceptar los términos y la política de privacidad' })
  acceptTerms!: true;
}

export class RejectPaymentDto {
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
