import { IsIn, IsNumber, IsString, IsUUID, Min, MinLength } from 'class-validator';

// Aviso de pago de PagosYa (contrato propio mientras no tengamos su documentación):
//   transactionId  id único de la transacción en el banco/pasarela (idempotencia)
//   reference      id de nuestra orden (order_id)
//   checkoutId     id del checkout que generamos (providerPaymentId)
//   amount         monto realmente pagado, en Bs
export class PagosYaWebhookDto {
  @IsString()
  @MinLength(1)
  transactionId!: string;

  @IsUUID()
  reference!: string;

  @IsString()
  @MinLength(1)
  checkoutId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsIn(['PAID'])
  status!: 'PAID';
}
