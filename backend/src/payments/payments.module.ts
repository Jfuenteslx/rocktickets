import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { CheckoutService } from './checkout.service.js';
import { PagosYaWebhookService } from './pagosya-webhook.service.js';
import { PagosYaWebhookController } from './pagosya-webhook.controller.js';
import { PagosYaSimController } from './pagosya-sim.controller.js';
import { PagosYaSimProvider } from './pagosya-sim.provider.js';
import { PAYMENT_PROVIDER } from './payment-provider.js';
import { getWebhookSecret } from './pagosya-signature.js';

// Elige la pasarela según PAYMENTS_PROVIDER. Por ahora solo existe el simulador de PagosYa.
function createProvider() {
  const name = process.env.PAYMENTS_PROVIDER ?? 'pagosya-sim';
  if (name === 'pagosya-sim') {
    getWebhookSecret(); // falla al arrancar en producción si falta el secreto
    return new PagosYaSimProvider();
  }
  throw new Error(`PAYMENTS_PROVIDER="${name}" no está soportado todavía`);
}

@Module({
  controllers: [PagosYaWebhookController, PagosYaSimController],
  providers: [
    PaymentsService,
    CheckoutService,
    PagosYaWebhookService,
    { provide: PAYMENT_PROVIDER, useFactory: createProvider },
  ],
  exports: [PaymentsService, CheckoutService],
})
export class PaymentsModule {}
