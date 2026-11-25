import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsService } from './payments.service.js';
import { ManualPaymentService } from './manual-payment.service.js';
import { ManualPaymentController } from './manual-payment.controller.js';
import { AuthModule } from '../auth/auth.module.js';

// Pagos con verificación manual: el comprador paga con el QR del negocio y avisa; el superadmin
// aprueba o rechaza desde su bandeja. No hay pasarela ni pagos simulados.
//
// Los archivos pagosya-webhook.* y pagosya-signature.* quedan SIN registrar a propósito: son el
// borrador del aviso automático de pago para cuando el banco entregue su documentación.
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: 'order-expiration' })],
  controllers: [ManualPaymentController],
  providers: [PaymentsService, ManualPaymentService],
  exports: [PaymentsService, ManualPaymentService],
})
export class PaymentsModule {}
