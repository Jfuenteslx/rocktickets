import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { event, order, orderItem } from '../db/index.js';

@Injectable()
export class BuyersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Compras hechas con la sesión de esta cuenta (las de invitado anteriores no se incluyen)
  async myOrders(buyerId: string) {
    const rows = await this.db
      .select({
        id: order.id,
        accessToken: order.accessToken,
        status: order.status,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        eventName: event.name,
        startsAt: event.startsAt,
        imagePath: event.imagePath,
        tickets: sql<number>`coalesce(sum(${orderItem.quantity}), 0)::int`,
        total: sql<string>`coalesce(sum(${orderItem.quantity} * ${orderItem.unitPrice}), 0)::numeric(10,2)::text`,
      })
      .from(order)
      .innerJoin(event, eq(event.id, order.eventId))
      .leftJoin(orderItem, eq(orderItem.orderId, order.id))
      .where(eq(order.buyerId, buyerId))
      .groupBy(order.id, event.id)
      .orderBy(desc(order.createdAt))
      .limit(100);

    return rows.map(({ imagePath, ...r }) => ({ ...r, imageUrl: imagePath ? `/uploads/${imagePath}` : null }));
  }
}
