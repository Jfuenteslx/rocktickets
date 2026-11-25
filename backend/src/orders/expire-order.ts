import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { order, orderItem, payment, tableHold, ticket } from '../db/index.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

// Libera una orden: pasa a EXPIRADA, suelta la mesa apartada y devuelve los tickets al stock.
// Idempotente: si la orden ya no está PENDIENTE_PAGO no toca nada.
//
// `force: false` (vencimiento normal de 15 min): si el comprador ya avisó su pago (hay un pago
// EN_REVISION) NO se libera: el superadmin lo está verificando. `force: true` se usa al rechazar
// el pago o cuando termina el plazo máximo de revisión.
export async function expireOrderTx(tx: Tx, orderId: string, opts: { force?: boolean } = {}): Promise<{ expired: boolean }> {
  // Se bloquea la orden primero: así "avisar pago" y "vencer" nunca se cruzan
  const [locked] = await tx.select().from(order).where(eq(order.id, orderId)).for('update').limit(1);
  if (!locked || locked.status !== 'PENDIENTE_PAGO') return { expired: false };

  if (!opts.force) {
    const [inReview] = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(and(eq(payment.orderId, orderId), eq(payment.status, 'EN_REVISION')))
      .limit(1);
    if (inReview) return { expired: false };
  }

  await tx.update(order).set({ status: 'EXPIRADA' }).where(eq(order.id, orderId));
  // Un pago que seguía esperando (o en revisión sin resolver) queda cerrado
  await tx
    .update(payment)
    .set({ status: 'EXPIRADO' })
    .where(and(eq(payment.orderId, orderId), inArray(payment.status, ['PENDIENTE', 'EN_REVISION'])));

  // La mesa apartada por esta orden vuelve a estar libre
  await tx.delete(tableHold).where(eq(tableHold.orderId, orderId));

  // Libera los tickets reservados: vuelven al pool DISPONIBLE del mismo tier.
  const items = await tx.select().from(orderItem).where(eq(orderItem.orderId, orderId));
  if (items.length > 0) {
    await tx
      .update(ticket)
      .set({ status: 'DISPONIBLE', orderItemId: null })
      .where(and(inArray(ticket.orderItemId, items.map((i) => i.id)), eq(ticket.status, 'RESERVADO')));
  }
  return { expired: true };
}

export function expireOrder(db: Database, orderId: string, opts: { force?: boolean } = {}) {
  return db.transaction((tx) => expireOrderTx(tx, orderId, opts));
}
