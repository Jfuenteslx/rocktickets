import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChargeRequest, ChargeResult, PaymentProvider } from './payment-provider.js';

// ⚠️ SIMULADOR de PagosYa (modalidad Embedded: el QR se muestra en nuestro sitio).
// No habla con ningún banco: genera un checkout falso y el "banco" lo simula
// PagosYaSimController enviando un webhook firmado a nuestro propio endpoint.
// El formato del cobro y del aviso es un contrato propio, a ajustar con la documentación real.
@Injectable()
export class PagosYaSimProvider implements PaymentProvider {
  readonly name = 'PAGOSYA';

  async createCharge(request: ChargeRequest): Promise<ChargeResult> {
    const providerPaymentId = `sim_${randomUUID()}`;
    const qrPayload =
      `pagosya-sim://pay?checkout=${providerPaymentId}` +
      `&ref=${request.orderId}&amount=${request.amount}&exp=${request.expiresAt.toISOString()}`;
    return { providerPaymentId, qrPayload };
  }
}
