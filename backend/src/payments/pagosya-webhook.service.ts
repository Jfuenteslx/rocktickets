import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { payment, paymentEvent } from '../db/index.js';
import { PaymentsService } from './payments.service.js';
import type { PagosYaWebhookDto } from './pagosya-webhook.dto.js';

export type WebhookOutcome =
  | 'REPETIDO' // mismo transactionId ya procesado: no se hace nada
  | 'CONFIRMADO'
  | 'CONFIRMADO_SIN_ORDEN' // pagó pero la orden ya no estaba vigente
  | 'MONTO_DISTINTO' // el banco cobró otro monto: el pago queda NO_CONCILIADO
  | 'DUPLICADO' // pago adicional sobre un cobro ya resuelto
  | 'REFERENCIA_DESCONOCIDA';

const cents = (n: number | string) => Math.round(Number(n) * 100);

@Injectable()
export class PagosYaWebhookService {
  private readonly logger = new Logger(PagosYaWebhookService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly payments: PaymentsService,
  ) {}

  // Siempre responde con un resultado (no con error) para que el proveedor deje de reintentar;
  // solo una falla nuestra (base de datos caída, etc.) devuelve 500 y provoca el reintento.
  async handle(dto: PagosYaWebhookDto): Promise<{ outcome: WebhookOutcome }> {
    // Idempotencia: reservar el id de transacción. Si ya existe, es un reintento del mismo aviso.
    const [claimed] = await this.db
      .insert(paymentEvent)
      .values({
        reference: dto.reference,
        providerTxId: dto.transactionId,
        kind: 'RECIBIDO',
        amount: dto.amount.toFixed(2),
        raw: dto,
      })
      .onConflictDoNothing({ target: paymentEvent.providerTxId })
      .returning({ id: paymentEvent.id });
    if (!claimed) return { outcome: 'REPETIDO' };

    try {
      const { outcome, paymentId } = await this.process(dto);
      await this.db
        .update(paymentEvent)
        .set({ kind: outcome, paymentId })
        .where(eq(paymentEvent.id, claimed.id));
      if (outcome !== 'CONFIRMADO') this.logger.warn(`Aviso ${dto.transactionId}: ${outcome} (orden ${dto.reference})`);
      return { outcome: outcome as WebhookOutcome };
    } catch (err) {
      // Liberar el id para que el reintento del proveedor pueda procesarse
      await this.db.delete(paymentEvent).where(eq(paymentEvent.id, claimed.id));
      throw err;
    }
  }

  private async process(dto: PagosYaWebhookDto): Promise<{ outcome: string; paymentId: string | null }> {
    const [pay] = await this.db
      .select()
      .from(payment)
      .where(eq(payment.providerPaymentId, dto.checkoutId))
      .limit(1);

    if (!pay || pay.orderId !== dto.reference) {
      return { outcome: 'REFERENCIA_DESCONOCIDA', paymentId: null };
    }

    // Cobro ya resuelto (confirmado, con error, reembolsado…) que recibe otro pago
    if (pay.status !== 'PENDIENTE' && pay.status !== 'EXPIRADO') {
      return { outcome: 'DUPLICADO', paymentId: pay.id };
    }

    if (cents(dto.amount) !== cents(pay.amount)) {
      await this.db.update(payment).set({ status: 'NO_CONCILIADO' }).where(eq(payment.id, pay.id));
      return { outcome: 'MONTO_DISTINTO', paymentId: pay.id };
    }

    try {
      const result = await this.payments.confirmPayment(pay.id);
      return { outcome: result.outcome, paymentId: pay.id };
    } catch (err) {
      // Otro aviso confirmó este mismo cobro en paralelo
      if (err instanceof ConflictException) return { outcome: 'DUPLICADO', paymentId: pay.id };
      throw err;
    }
  }
}
