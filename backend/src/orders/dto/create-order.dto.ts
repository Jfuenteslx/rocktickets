import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  Equals,
  IsEmail,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderItemDto } from './order-item.dto.js';

// Mesa fija elegida en el plano (se compra completa, con su paquete)
export class OrderTableDto {
  @IsUUID()
  tableId!: string;
}

// Reserva de mesa por grupo (mesas flexibles): el sistema elige la mesa dentro del sector
export class TableRequestDto {
  @IsUUID()
  sectorId!: string;

  @IsInt()
  @Min(1)
  @Max(30)
  people!: number;
}

export class CreateOrderDto {
  @IsUUID()
  eventId!: string;

  // Los datos del comprador y la aceptación de términos se piden ahora en la pantalla de pago
  // (POST orders/token/:token/payment/declare). Aquí son opcionales por compatibilidad.
  @IsOptional()
  @IsString()
  @MinLength(2)
  buyerName?: string;

  @IsOptional()
  @IsEmail()
  buyerEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  buyerPhone?: string;

  @IsOptional()
  @Equals(true, { message: 'Debes aceptar los términos y la política de privacidad' })
  acceptTerms?: true;

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

  // Mesas completas (eventos con mesas fijas). Se compran con su paquete: todos los asientos juntos.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => OrderTableDto)
  tables?: OrderTableDto[];

  // Mesas flexibles: pide mesa para N personas del grupo en el sector de las entradas elegidas
  @IsOptional()
  @ValidateNested()
  @Type(() => TableRequestDto)
  tableRequest?: TableRequestDto;
}
