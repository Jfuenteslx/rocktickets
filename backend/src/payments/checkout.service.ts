import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import QRCode from 'qrcode';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { order, payment } from '../db/index.js';
import { CHECKOUT_MINUTES } from './payments.constants.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';

// Cobro con QR de una orden: crear el cobro en la pasarela, regenerarlo cuando vence
// y dibujar el QR. Toda la lógica de pasarela pasa por PaymentProvider.
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  // Pide a la pasarela el QR de un Payment ya creado. La vigencia es CHECKOUT_MINUTES,
  // sin pasar nunca del vencimiento de la reserva de la orden.
  async createCharge(paymentId: string) {
    const [pay] = await this.db.select().from(payment).where(eq(payment.id, paymentId)).limit(1);
    if (!pay) throw new NotFoundException('Payment no encontrado');
    const [ord] = await this.db.select().from(order).where(eq(order.id, pay.orderId)).limit(1);
    if (!ord) throw new NotFoundException('Order no encontrada');

    const expiresAt = new Date(Math.min(Date.now() + CHECKOUT_MINUTES * 60_000, ord.expiresAt.getTime()));
    const charge = await this.provider.createCharge({
      orderId: ord.id,
      paymentId: pay.id,
      amount: pay.amount,
      currency: pay.currency,
      expiresAt,
    });

    const [updated] = await this.db
      .update(payment)
      .set({
        provider: this.provider.name,
        providerPaymentId: charge.providerPaymentId,
        qrPayload: charge.qrPayload,
        checkoutExpiresAt: expiresAt,
      })
      .where(eq(payment.id, paymentId))
      .returning();
    return updated;
  }

  // Igual que createCharge pero sin romper la compra si la pasarela falla: la orden queda
  // con su Payment sin QR y el comprador puede pedirlo de nuevo (regenerate).
  async tryCreateCharge(paymentId: string) {
    try {
      return await this.createCharge(paymentId);
    } catch (err) {
      this.logger.error(`No se pudo generar el QR del pago ${paymentId}: ${err}`);
      return null;
    }
  }

  // Cobro nuevo para la MISMA orden mientras su reserva siga viva. El cobro vencido queda
  // EXPIRADO (historial de intentos). Si ya hay un cobro vigente, lo devuelve sin crear otro.
  async regenerate(accessToken: string) {
    const result = await this.db.transaction(async (tx) => {
      const [ord] = await tx
        .select()
        .from(order)
        .where(eq(order.accessToken, accessToken))
        .for('update')
        .limit(1);
      if (!ord) throw new NotFoundException('Orden no encontrada');
      if (ord.status !== 'PENDIENTE_PAGO' || ord.expiresAt <= new Date()) {
        throw new ConflictException('La reserva de esta compra ya terminó. Empieza una compra nueva.');
      }

      const [latest] = await tx
        .select()
        .from(payment)
        .where(eq(payment.orderId, ord.id))
        .orderBy(desc(payment.createdAt))
        .limit(1);
      if (!latest) throw new NotFoundException('Esta orden no tiene un cobro');

      if (latest.status === 'PENDIENTE') {
        if (!latest.qrPayload) return { paymentId: latest.id, needsCharge: true }; // falló la generación antes
        if (latest.checkoutExpiresAt && latest.checkoutExpiresAt > new Date()) {
          return { paymentId: latest.id, needsCharge: false }; // ya hay un QR vigente
        }
      }

      await tx
        .update(payment)
        .set({ status: 'EXPIRADO' })
        .where(and(eq(payment.orderId, ord.id), eq(payment.status, 'PENDIENTE')));

      const [created] = await tx
        .insert(payment)
        .values({
          orderId: ord.id,
          status: 'PENDIENTE',
          amount: latest.amount,
          reconciliationExpiresAt: latest.reconciliationExpiresAt,
        })
        .returning();
      return { paymentId: created.id, needsCharge: true };
    });

    if (result.needsCharge) return this.createCharge(result.paymentId);
    const [current] = await this.db.select().from(payment).where(eq(payment.id, result.paymentId)).limit(1);
    return current;
  }

  // PNG del QR del cobro activo de la orden
  async qrPng(accessToken: string): Promise<Buffer> {
    const [ord] = await this.db.select().from(order).where(eq(order.accessToken, accessToken)).limit(1);
    if (!ord) throw new NotFoundException('Orden no encontrada');

    const [active] = await this.db
      .select()
      .from(payment)
      .where(and(eq(payment.orderId, ord.id), eq(payment.status, 'PENDIENTE')))
      .orderBy(desc(payment.createdAt))
      .limit(1);
    if (!active?.qrPayload) throw new NotFoundException('No hay un cobro activo para esta orden');

    return QRCode.toBuffer(active.qrPayload, { type: 'png', width: 360, margin: 2 });
  }
}
