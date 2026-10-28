import { ArrayMinSize, IsArray, IsEmail, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}
