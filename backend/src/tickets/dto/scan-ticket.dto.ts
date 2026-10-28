import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';

export class ScanTicketDto {
  @IsUUID()
  ticketId!: string;

  @IsString()
  @MinLength(1)
  deviceId!: string;

  // Evento en el que el dispositivo está trabajando (la app de puerta lo manda siempre)
  @IsOptional()
  @IsUUID()
  eventId?: string;

  // true cuando el staff admite buscando por nombre en lugar de leer el QR
  @IsOptional()
  @IsBoolean()
  manual?: boolean;
}

export class SyncScanItemDto {
  @IsUUID()
  ticketId!: string;

  // Hora real en que se escaneó, sin conexión (ISO 8601)
  @IsDateString()
  scannedAt!: string;
}

export class SyncScansDto {
  @IsString()
  @MinLength(1)
  deviceId!: string;

  @IsUUID()
  eventId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SyncScanItemDto)
  items!: SyncScanItemDto[];
}
