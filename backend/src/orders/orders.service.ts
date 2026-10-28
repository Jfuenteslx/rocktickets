import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { event, sector, tier, order, orderItem, payment, ticket, venue } from '../db/index.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';

const RESERVATION_MINUTES = 15;
const RECONCILIATION_HOURS = 2;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @InjectQueue('order-expiration') private readonly expirationQueue: Queue,
  ) {}

  private async runCreateOrderTransaction(dto: CreateOrderDto) {
    const [eventRow] = await this.db.select().from(event).where(eq(event.id, dto.eventId)).limit(1);
    if (!eventRow) throw new NotFoundException('Evento no encontrado');
    if (eventRow.status !== 'ACTIVO') {
      throw new BadRequestException('El evento no está activo para venta');
    }

    // Una línea por tier: si el comprador repite un tier se suman las cantidades
    // (OrderItem es UNIQUE(order_id, tier_id)).
    const wanted = new Map<string, number>();
    for (const item of dto.items) {
      wanted.set(item.tierId, (wanted.get(item.tierId) ?? 0) + item.quantity);
    }

    // Toda la reserva es una única transacción: si cualquier línea falla,
    // ninguna queda reservada (invariante: no hay orden parcialmente reservada).
    return this.db.transaction(async (tx) => {
      const reservedItems: {
        tierId: string;
        quantity: number;
        unitPrice: string;
        ticketIds: string[];
      }[] = [];

      for (const [tierId, quantity] of wanted) {
        // FOR UPDATE sobre el tier: serializa a los compradores del mismo
        // tier (y también a "asignar" y "emitir cortesía"), de modo que dos
        // compras simultáneas nunca elijan los mismos tickets.
        const [t] = await tx.select().from(tier).where(eq(tier.id, tierId)).for('update').limit(1);

        if (!t) throw new BadRequestException(`Tier ${tierId} no encontrado`);

        // Invariante: todos los tiers de la Order pertenecen al mismo Event.
        if (t.eventId !== dto.eventId) {
          throw new BadRequestException(`El tier ${tierId} no pertenece al evento ${dto.eventId}`);
        }
        if (t.kind !== 'VENTA') {
          throw new BadRequestException(`El tier "${t.name}" no está a la venta`);
        }

        const now = new Date();
        if (
          t.isPaused ||
          (t.startsAt !== null && now < t.startsAt) ||
          (t.endsAt !== null && now >= t.endsAt)
        ) {
          throw new BadRequestException(`El tier "${t.name}" no está disponible para compra`);
        }

        // El stock ES el conjunto de tickets DISPONIBLE del tier.
        const available = await tx
          .select({ id: ticket.id })
          .from(ticket)
          .where(and(eq(ticket.tierId, tierId), eq(ticket.status, 'DISPONIBLE')))
          .orderBy(ticket.shortCode)
          .limit(quantity)
          .for('update');

        if (available.length < quantity) {
          const [{ n }] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(ticket)
            .where(and(eq(ticket.tierId, tierId), eq(ticket.status, 'DISPONIBLE')));
          throw new BadRequestException(
            `Stock insuficiente para "${t.name}": quedan ${n}, se pidieron ${quantity}`,
          );
        }

        reservedItems.push({
          tierId,
          quantity,
          unitPrice: t.price, // precio congelado al momento de la reserva
          ticketIds: available.map((a) => a.id),
        });
      }

      const totalAmount = reservedItems
        .reduce((sum, i) => sum + Number(i.unitPrice) * i.quantity, 0)
        .toFixed(2);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60_000);
      const reconciliationExpiresAt = new Date(now.getTime() + RECONCILIATION_HOURS * 3_600_000);

      const [createdOrder] = await tx
        .insert(order)
        .values({
          eventId: dto.eventId,
          buyerName: dto.buyerName,
          buyerEmail: dto.buyerEmail,
          buyerPhone: dto.buyerPhone,
          status: 'PENDIENTE_PAGO',
          expiresAt,
        })
        .returning();

      const createdItems = await tx
        .insert(orderItem)
        .values(
          reservedItems.map((i) => ({
            orderId: createdOrder.id,
            tierId: i.tierId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        )
        .returning();

      // Reserva concreta: cada ticket elegido pasa a RESERVADO y queda
      // enlazado a su línea de la orden.
      for (const item of createdItems) {
        const picked = reservedItems.find((r) => r.tierId === item.tierId)!;
        await tx
          .update(ticket)
          .set({ status: 'RESERVADO', orderItemId: item.id })
          .where(inArray(ticket.id, picked.ticketIds));
      }

      // Payment PENDIENTE, sin providerPaymentId todavía — la llamada real a
      // la API de BNB para generar el QR es responsabilidad de PaymentsModule
      // (no existe aún). Acá solo se deja el registro listo para que ese
      // módulo lo tome y complete providerPaymentId cuando el banco responda.
      const [createdPayment] = await tx
        .insert(payment)
        .values({
          orderId: createdOrder.id,
          status: 'PENDIENTE',
          amount: totalAmount,
          reconciliationExpiresAt,
        })
        .returning();

      return {
        order: createdOrder,
        items: reservedItems.map(({ tierId, quantity, unitPrice }) => ({ tierId, quantity, unitPrice })),
        payment: createdPayment,
      };
    });
  }

  async createOrder(dto: CreateOrderDto) {
    const result = await this.runCreateOrderTransaction(dto);

    // jobId = order.id: si por algún motivo este método se llamara dos
    // veces para la misma orden, BullMQ deduplica y no crea un segundo job.
    await this.expirationQueue.add(
      'expire-order',
      { orderId: result.order.id },
      { delay: RESERVATION_MINUTES * 60_000, jobId: result.order.id },
    );

    return result;
  }

  async getOrderByToken(accessToken: string) {
    const [foundOrder] = await this.db
      .select()
      .from(order)
      .where(eq(order.accessToken, accessToken))
      .limit(1);

    if (!foundOrder) throw new NotFoundException('Orden no encontrada');

    const items = await this.db
      .select()
      .from(orderItem)
      .where(eq(orderItem.orderId, foundOrder.id));

    const payments = await this.db
      .select()
      .from(payment)
      .where(eq(payment.orderId, foundOrder.id));

    // Tickets generados (si la Order ya está PAGADA). Se traen con el
    // nombre del Tier para que el frontend no tenga que hacer otro request.
    const itemIds = items.map((i) => i.id);
    const tickets =
      itemIds.length > 0
        ? await this.db
            .select({
              id: ticket.id,
              shortCode: ticket.shortCode,
              status: ticket.status,
              orderItemId: ticket.orderItemId,
              tierId: ticket.tierId,
              tierName: tier.name,
              sectorName: sector.name,
            })
            .from(ticket)
            .innerJoin(tier, eq(ticket.tierId, tier.id))
            .innerJoin(sector, eq(ticket.sectorId, sector.id))
            .where(inArray(ticket.orderItemId, itemIds))
        : [];

    // Datos del evento para dibujar el ticket en el frontend
    const [ev] = await this.db.select().from(event).where(eq(event.id, foundOrder.eventId)).limit(1);
    const [ven] = ev
      ? await this.db.select().from(venue).where(eq(venue.id, ev.venueId)).limit(1)
      : [];

    return {
      ...foundOrder,
      items,
      payments,
      tickets,
      event: ev ? { name: ev.name, startsAt: ev.startsAt, endsAt: ev.endsAt, venueName: ven?.name ?? null } : null,
    };
  }

  // Llamado por el worker de BullMQ (OrderExpirationProcessor) cuando se
  // cumplen los 15 min de la reserva. Idempotente: si la Order ya no está
  // PENDIENTE_PAGO (se pagó o ya expiró antes), no hace nada — el UPDATE
  // condicionado devuelve 0 filas y listo, sin lanzar error.
  async expireOrderIfStillPending(orderId: string): Promise<{ expired: boolean }> {
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(order)
        .set({ status: 'EXPIRADA' })
        .where(and(eq(order.id, orderId), eq(order.status, 'PENDIENTE_PAGO')))
        .returning();

      if (!updated) {
        return { expired: false }; // ya estaba PAGADA, o ya había expirado antes
      }

      // Libera los tickets reservados: vuelven al pool DISPONIBLE del mismo tier.
      const items = await tx.select().from(orderItem).where(eq(orderItem.orderId, orderId));
      if (items.length > 0) {
        await tx
          .update(ticket)
          .set({ status: 'DISPONIBLE', orderItemId: null })
          .where(
            and(
              inArray(ticket.orderItemId, items.map((i) => i.id)),
              eq(ticket.status, 'RESERVADO'),
            ),
          );
      }

      return { expired: true };
    });
  }
}
