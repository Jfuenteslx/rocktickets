import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { payment, order, orderItem, ticket } from '../db/index.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

export type ConfirmPaymentResult =
  | { outcome: 'CONFIRMADO'; ticketsCreated: number }
  | { outcome: 'CONFIRMADO_SIN_ORDEN'; reason: string };

// Resultado interno de la transacción — incluye datos que solo sirven para
// la notificación de tiempo real posterior (eventId, orderId, amount),
// que no forman parte del ConfirmPaymentResult público que ve el caller.
type TransactionResult =
  | { outcome: 'CONFIRMADO'; ticketsCreated: number; eventId: string; orderId: string; amount: string }
  | { outcome: 'CONFIRMADO_SIN_ORDEN'; reason: string };

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  // Invariante #7 del diseño: Payment→CONFIRMADO + Order→PAGADA + generación
  // de Tickets, todo en una única transacción. Nunca uno sin el otro.
  //
  // Quién la va a llamar en el futuro: el worker de polling a BNB, cuando
  // getQRStatusAsync devuelva "USADO". Hoy no hay caller real todavía.
  async confirmPayment(paymentId: string): Promise<ConfirmPaymentResult> {
    const result = await this.db.transaction<TransactionResult>(async (tx) => {
      const [paymentRow] = await tx
        .select()
        .from(payment)
        .where(eq(payment.id, paymentId))
        .for('update')
        .limit(1);

      if (!paymentRow) throw new NotFoundException('Payment no encontrado');
      if (paymentRow.status !== 'PENDIENTE') {
        throw new ConflictException(`Payment ya está en estado ${paymentRow.status}`);
      }

      const [orderRow] = await tx
        .select()
        .from(order)
        .where(eq(order.id, paymentRow.orderId))
        .for('update')
        .limit(1);

      if (!orderRow) throw new NotFoundException('Order no encontrada');

      // Condición de carrera resuelta como Opción B (turno anterior): si la
      // Order ya no es PENDIENTE_PAGO (expiró, o algún otro Payment ya la
      // pagó), este pago NO reabre nada — va a revisión administrativa.
      const orderStillEligible = orderRow.status === 'PENDIENTE_PAGO' && orderRow.expiresAt > new Date();

      if (!orderStillEligible) {
        await tx
          .update(payment)
          .set({ status: 'CONFIRMADO_SIN_ORDEN' })
          .where(eq(payment.id, paymentId));

        return {
          outcome: 'CONFIRMADO_SIN_ORDEN',
          reason: `Order en estado ${orderRow.status}, expiresAt=${orderRow.expiresAt.toISOString()}`,
        };
      }

      await tx.update(payment).set({ status: 'CONFIRMADO' }).where(eq(payment.id, paymentId));
      await tx.update(order).set({ status: 'PAGADA' }).where(eq(order.id, orderRow.id));

      const items = await tx.select().from(orderItem).where(eq(orderItem.orderId, orderRow.id));

      // Los tickets ya existen (RESERVADO desde la compra): confirmar el pago
      // los pasa a VALIDO. Si no coincide la cantidad, algo violó el
      // invariante de reserva → se aborta TODA la transacción.
      const expected = items.reduce((sum, i) => sum + i.quantity, 0);
      const validated = await tx
        .update(ticket)
        .set({ status: 'VALIDO' })
        .where(
          and(
            inArray(ticket.orderItemId, items.map((i) => i.id)),
            eq(ticket.status, 'RESERVADO'),
          ),
        )
        .returning({ id: ticket.id });

      if (validated.length !== expected) {
        throw new Error(
          `Orden ${orderRow.id}: se esperaban ${expected} tickets reservados y se validaron ${validated.length}`,
        );
      }

      return {
        outcome: 'CONFIRMADO',
        ticketsCreated: validated.length,
        eventId: orderRow.eventId,
        orderId: orderRow.id,
        amount: paymentRow.amount,
      };
    });

    // Notificación best-effort, DESPUÉS del COMMIT — un problema con
    // Socket.io nunca debe revertir ni afectar una confirmación de pago ya
    // asentada en la base.
    if (result.outcome === 'CONFIRMADO') {
      try {
        this.realtimeGateway.emitOrderPaid(result.eventId, {
          orderId: result.orderId,
          ticketsCount: result.ticketsCreated,
          amount: result.amount,
        });
      } catch (err) {
        this.logger.warn(`No se pudo emitir order:paid: ${err}`);
      }
      return { outcome: 'CONFIRMADO', ticketsCreated: result.ticketsCreated };
    }

    return result;
  }
}
