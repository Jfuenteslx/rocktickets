import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { event, order, payment } from '../db/index.js';
import { TERMS_VERSION } from '../orders/terms.js';
import { expireOrderTx } from '../orders/expire-order.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import { MailService } from '../mail/mail.service.js';
import { paymentRejectedMail, paymentToReviewMail } from '../mail/mail.templates.js';
import { PaymentsService } from './payments.service.js';
import { loadQrPng, reviewHoldHours } from './manual-payment.js';
import type { DeclarePaymentDto } from './dto/manual-payment.dto.js';

export const MANUAL_STATUSES = ['EN_REVISION', 'CONFIRMADO', 'RECHAZADO', 'CONFIRMADO_SIN_ORDEN', 'EXPIRADO'] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

const money = (v: string | number | null | undefined) => Number(v ?? 0).toFixed(2);
const ref = (id: string) => id.slice(0, 8).toUpperCase();

// Pago manual con verificación del superadmin:
//   comprador: ve el QR, llena sus datos y avisa "ya pagué"  → pago EN_REVISION (stock reservado)
//   superadmin: verifica el depósito y aprueba (→ tickets por correo) o rechaza (→ libera stock)
@Injectable()
export class ManualPaymentService {
  private readonly logger = new Logger(ManualPaymentService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue('order-expiration') private readonly expirationQueue: Queue,
    private readonly payments: PaymentsService,
    private readonly mail: MailService,
    private readonly audit: AuditLogService,
  ) {}

  // ---------- Comprador ----------

  // PNG del QR de cobro. Solo mientras la orden sigue esperando el pago.
  async qrPng(accessToken: string): Promise<Buffer> {
    const [ord] = await this.db.select().from(order).where(eq(order.accessToken, accessToken)).limit(1);
    if (!ord) throw new NotFoundException('Orden no encontrada');
    if (ord.status !== 'PENDIENTE_PAGO') throw new NotFoundException('Esta compra ya no espera un pago');
    const png = await loadQrPng();
    if (!png) throw new NotFoundException('El QR de pago no está disponible por ahora');
    return png;
  }

  // "Ya pagué": guarda los datos del comprador, pasa el pago a EN_REVISION y amplía la reserva
  // para dar tiempo a verificarlo. Repetir la llamada no hace nada (idempotente).
  async declare(accessToken: string, dto: DeclarePaymentDto, buyerId: string | null = null): Promise<void> {
    const hold = reviewHoldHours();
    const done = await this.db.transaction(async (tx) => {
      const [ord] = await tx.select().from(order).where(eq(order.accessToken, accessToken)).for('update').limit(1);
      if (!ord) throw new NotFoundException('Orden no encontrada');
      if (ord.status === 'PAGADA') throw new ConflictException('Esta compra ya está pagada.');
      if (ord.status !== 'PENDIENTE_PAGO' || ord.expiresAt <= new Date()) {
        throw new ConflictException('La reserva de esta compra ya terminó. Empieza una compra nueva.');
      }

      const [latest] = await tx.select().from(payment).where(eq(payment.orderId, ord.id)).orderBy(desc(payment.createdAt)).limit(1);
      if (!latest) throw new NotFoundException('Esta orden no tiene un cobro');
      if (latest.status === 'EN_REVISION') return null; // doble clic: ya está avisado
      if (latest.status !== 'PENDIENTE') throw new ConflictException('Este cobro ya no admite avisar un pago.');

      const now = new Date();
      const email = dto.buyerEmail.trim().toLowerCase();
      await tx
        .update(order)
        .set({
          buyerName: dto.buyerName.trim(),
          buyerEmail: email,
          buyerPhone: dto.buyerPhone.trim(),
          termsAcceptedAt: now,
          termsVersion: TERMS_VERSION,
          ...(buyerId && !ord.buyerId ? { buyerId } : {}),
          // La reserva se amplía mientras el superadmin verifica; el plazo se lee en la bandeja
          expiresAt: new Date(now.getTime() + hold * 3_600_000),
        })
        .where(eq(order.id, ord.id));
      await tx
        .update(payment)
        .set({
          status: 'EN_REVISION',
          provider: 'MANUAL',
          payerName: dto.buyerName.trim(),
          payerEmail: email,
          payerPhone: dto.buyerPhone.trim(),
          declaredAt: now,
        })
        .where(eq(payment.id, latest.id));
      return { orderId: ord.id, amount: latest.amount, name: dto.buyerName.trim() };
    });
    if (!done) return;

    // Al terminar el plazo máximo de revisión, si nadie lo resolvió, se libera el stock
    try {
      await this.expirationQueue.add(
        'expire-order',
        { orderId: done.orderId, force: true },
        { delay: hold * 3_600_000, jobId: `${done.orderId}-review` },
      );
    } catch (err) {
      this.logger.error(`No se pudo programar el fin de revisión de la orden ${done.orderId}: ${err}`);
    }

    // Aviso opcional al correo de quien revisa los pagos (best-effort)
    const to = process.env.REVIEW_NOTIFY_EMAIL?.trim();
    if (to) {
      const site = (process.env.ADMIN_URL ?? '').replace(/\/+$/, '');
      void this.mail
        .send(paymentToReviewMail(to, { name: done.name, amount: money(done.amount), ref: ref(done.orderId), adminLink: site ? `${site}/pagos` : null }))
        .catch(() => undefined);
    }
  }

  // ---------- Superadmin ----------

  async count(): Promise<{ pending: number }> {
    const [r] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(payment)
      .where(eq(payment.status, 'EN_REVISION'));
    return { pending: r?.n ?? 0 };
  }

  async list(status: ManualStatus) {
    const rows = await this.db
      .select({
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        payerName: payment.payerName,
        payerEmail: payment.payerEmail,
        payerPhone: payment.payerPhone,
        declaredAt: payment.declaredAt,
        reviewedAt: payment.reviewedAt,
        reviewNote: payment.reviewNote,
        orderId: order.id,
        orderStatus: order.status,
        holdUntil: order.expiresAt,
        eventId: event.id,
        eventName: event.name,
        eventStartsAt: event.startsAt,
        tickets: sql<number>`(select coalesce(sum(oi.quantity), 0) from order_item oi where oi.order_id = ${order.id})::int`,
        detail: sql<string | null>`(select string_agg(oi.quantity || ' × ' || t.name, '; ' order by t.name) from order_item oi join tier t on t.id = oi.tier_id where oi.order_id = ${order.id})`,
        tables: sql<number>`(select count(*) from order_table ot where ot.order_id = ${order.id})::int`,
      })
      .from(payment)
      .innerJoin(order, eq(order.id, payment.orderId))
      .innerJoin(event, eq(event.id, order.eventId))
      .where(eq(payment.status, status))
      // Pendientes: los más antiguos primero (los que vencen antes); el resto, lo más reciente primero
      .orderBy(status === 'EN_REVISION' ? asc(payment.declaredAt) : desc(sql`coalesce(${payment.reviewedAt}, ${payment.declaredAt}, ${payment.createdAt})`))
      .limit(200);
    return rows.map((r) => ({ ...r, ref: ref(r.orderId), amount: money(r.amount) }));
  }

  // Aprueba: confirma el pago, valida los tickets y manda el correo con las entradas
  async approve(paymentId: string, actorId: string) {
    const result = await this.payments.confirmPayment(paymentId, { from: ['EN_REVISION'], reviewedBy: actorId });
    await this.audit.log(actorId, 'PAYMENT_APPROVED', 'payment', paymentId, { outcome: result.outcome });
    return result;
  }

  // Rechaza: el pago queda RECHAZADO, la orden se libera (tickets y mesa vuelven al stock)
  // y el comprador recibe un correo con el motivo.
  async reject(paymentId: string, actorId: string, reason?: string) {
    const note = reason?.trim() || null;
    const info = await this.db.transaction(async (tx) => {
      const [pay] = await tx.select().from(payment).where(eq(payment.id, paymentId)).for('update').limit(1);
      if (!pay) throw new NotFoundException('Pago no encontrado');
      if (pay.status !== 'EN_REVISION') throw new ConflictException(`Este pago ya está en estado ${pay.status}`);

      await tx
        .update(payment)
        .set({ status: 'RECHAZADO', reviewedBy: actorId, reviewedAt: new Date(), reviewNote: note })
        .where(eq(payment.id, paymentId));
      await expireOrderTx(tx, pay.orderId, { force: true });
      const [ord] = await tx.select().from(order).where(eq(order.id, pay.orderId)).limit(1);
      const [ev] = await tx.select({ name: event.name }).from(event).where(eq(event.id, ord.eventId)).limit(1);
      return { to: pay.payerEmail ?? ord.buyerEmail, name: pay.payerName ?? ord.buyerName, eventName: ev?.name ?? '', ref: ref(ord.id) };
    });
    await this.audit.log(actorId, 'PAYMENT_REJECTED', 'payment', paymentId, { reason: note });

    if (info.to) {
      const site = (process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
      void this.mail.send(paymentRejectedMail(info.to, { name: info.name, eventName: info.eventName, ref: info.ref, reason: note, helpLink: `${site}/ayuda` })).catch(() => undefined);
    }
    return { outcome: 'RECHAZADO' as const };
  }
}
