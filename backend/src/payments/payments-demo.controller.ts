import { Controller, ForbiddenException, Param, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

// ⚠️ SOLO PARA DEMO. Esto NO es la integración real con BNB — es un stand-in
// para poder mostrar el flujo completo (compra → pago → ticket) sin tener
// todavía credenciales del sandbox del banco ni el worker de polling.
//
// Cuando el worker real exista (BullMQ + Redis, consultando getQRStatusAsync),
// va a llamar a PaymentsService.confirmPayment directamente — este endpoint
// se elimina en ese momento, no convive con la integración real.
@Controller('demo/payments')
export class PaymentsDemoController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':paymentId/simulate-bank-confirmation')
  simulateConfirmation(@Param('paymentId') paymentId: string) {
    if (process.env.NODE_ENV === 'production') {
      // Nunca debe quedar accesible fuera de un entorno de demo/desarrollo.
      throw new ForbiddenException('Endpoint de demo deshabilitado en producción');
    }
    return this.paymentsService.confirmPayment(paymentId);
  }
}
