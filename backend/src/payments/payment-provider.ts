// Contrato con la pasarela de pago. Hoy lo implementa PagosYaSimProvider (simulado);
// cuando se contrate PagosYa se agrega la implementación real sin tocar el resto.
export interface ChargeRequest {
  orderId: string;
  paymentId: string;
  amount: string; // "123.45"
  currency: string;
  expiresAt: Date;
}

export interface ChargeResult {
  // Id del checkout en la pasarela (lo que ella devuelve en cada aviso)
  providerPaymentId: string;
  // Texto que se dibuja como código QR
  qrPayload: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCharge(request: ChargeRequest): Promise<ChargeResult>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
