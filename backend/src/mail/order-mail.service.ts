import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { event, order, orderItem } from '../db/index.js';
import { MailService, type MailMessage } from './mail.service.js';
import { TicketDeliveryService } from '../orders/ticket-delivery.service.js';
import { paymentConfirmedMail, recoverMail, type MailOrder } from './mail.templates.js';

const MAX_ORDERS_IN_RECOVERY = 10;
// Cuántos PDF se adjuntan en la recuperación (los más recientes); el resto va solo como enlace
const MAX_PDFS_IN_RECOVERY = 3;
// Un mismo correo no puede pedir la recuperación más de una vez en este lapso.
// En memoria: sirve con una sola instancia del backend; con varias pasa a Redis.
const RECOVERY_COOLDOWN_MS = 10 * 60_000;

// Correos que dependen de una orden: confirmación de pago y recuperación de tickets.
@Injectable()
export class OrderMailService {
  private readonly logger = new Logger(OrderMailService.name);
  private readonly recentRecoveries = new Map<string, number>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly mail: MailService,
    private readonly delivery: TicketDeliveryService,
  ) {}

  private link(token: string) {
    const base = (process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
    return `${base}/orden/${token}`;
  }

  // Resumen de órdenes PAGADAS (opcionalmente solo una) listo para el correo
  private async paidOrders(where: ReturnType<typeof sql>, limit: number) {
    const rows = await this.db
      .select({
        id: order.id,
        token: order.accessToken,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        eventName: event.name,
        startsAt: event.startsAt,
        tickets: sql<number>`coalesce(sum(${orderItem.quantity}), 0)::int`,
        total: sql<string>`coalesce(sum(${orderItem.quantity} * ${orderItem.unitPrice}), 0)::numeric(10,2)::text`,
      })
      .from(order)
      .innerJoin(event, eq(event.id, order.eventId))
      .leftJoin(orderItem, eq(orderItem.orderId, order.id))
      .where(sql`${order.status} = 'PAGADA' and ${where}`)
      .groupBy(order.id, event.id)
      .orderBy(desc(order.createdAt))
      .limit(limit);
    return rows;
  }

  private toMailOrder(r: { token: string; eventName: string; startsAt: Date; tickets: number; total: string }): MailOrder {
    return { link: this.link(r.token), eventName: r.eventName, startsAt: r.startsAt, tickets: r.tickets, total: r.total };
  }

  // PDF de las entradas de una orden. Si falla, el correo sale igual (con el enlace).
  private async pdfFor(token: string, orderId: string): Promise<{ filename: string; content: Buffer } | null> {
    try {
      return { filename: `entradas-${orderId.slice(0, 8)}.pdf`, content: await this.delivery.orderPdf(token) };
    } catch (err) {
      this.logger.error(`No se pudo generar el PDF de la orden ${orderId}: ${err}`);
      return null;
    }
  }

  // Después de confirmar un pago. Best-effort: nunca lanza.
  async sendPaymentConfirmed(orderId: string): Promise<void> {
    try {
      const [r] = await this.paidOrders(sql`${order.id} = ${orderId}`, 1);
      if (!r) return;
      const pdf = await this.pdfFor(r.token, r.id);
      const msg: MailMessage = paymentConfirmedMail(r.buyerEmail, r.buyerName, this.toMailOrder(r), Boolean(pdf));
      if (pdf) msg.attachments = [pdf];
      await this.mail.send(msg);
    } catch (err) {
      this.logger.error(`No se pudo enviar la confirmación de la orden ${orderId}: ${err}`);
    }
  }

  // "Recuperar mis tickets". El llamador responde siempre lo mismo, haya o no compras,
  // para que nadie pueda averiguar qué correos compraron.
  async sendRecovery(rawEmail: string): Promise<void> {
    try {
      const email = rawEmail.trim().toLowerCase();

      const last = this.recentRecoveries.get(email);
      if (last && Date.now() - last < RECOVERY_COOLDOWN_MS) return;
      this.recentRecoveries.set(email, Date.now());
      for (const [k, t] of this.recentRecoveries) {
        if (Date.now() - t > RECOVERY_COOLDOWN_MS) this.recentRecoveries.delete(k);
      }

      const rows = await this.paidOrders(sql`lower(${order.buyerEmail}) = ${email}`, MAX_ORDERS_IN_RECOVERY);
      if (rows.length === 0) return;
      const pdfs = (
        await Promise.all(rows.slice(0, MAX_PDFS_IN_RECOVERY).map((r) => this.pdfFor(r.token, r.id)))
      ).filter((p): p is { filename: string; content: Buffer } => p !== null);
      const msg: MailMessage = recoverMail(email, rows.map((r) => this.toMailOrder(r)), pdfs.length > 0);
      if (pdfs.length) msg.attachments = pdfs;
      await this.mail.send(msg);
    } catch (err) {
      this.logger.error(`Falló la recuperación de tickets: ${err}`);
    }
  }
}
