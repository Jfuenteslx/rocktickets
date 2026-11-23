import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  Equals,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemDto } from './order-item.dto.js';

export class CreateOrderDto {
  @IsUUID()
  eventId!: string;

  @IsString()
  @MinLength(2)
  buyerName!: string;

  @IsEmail()
  buyerEmail!: string;

  @IsString()
  @MinLength(6)
  buyerPhone!: string;

  // Casilla obligatoria de términos y privacidad: solo vale `true`
  @Equals(true, { message: 'Debes aceptar los términos y la política de privacidad' })
  acceptTerms!: true;

  // Entradas por cantidad (sin asiento). Puede ir vacío si la compra es solo de asientos.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  // Asientos concretos del plano (eventos con butacas). El servicio exige al menos
  // una entrada, sea por cantidad o por asiento.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  seatIds?: string[];
}
