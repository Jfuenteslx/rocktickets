import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { ticket, access, event, tier, sector, order, orderItem, courtesy } from '../db/index.js';
import { canScanEvent, type AuthUser } from '../auth/access.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';

export type AccessMethod = 'QR' | 'MANUAL' | 'OFFLINE';

export type ScanReason = 'YA_USADO' | 'ANULADO' | 'NO_PAGADO' | 'OTRO_EVENTO' | 'NO_EXISTE';

export interface ScanResult {
  result: 'ADMITIDO' | 'RECHAZADO_YA_USADO' | 'RECHAZADO_INVALIDO';
  // Por qué se rechazó (null si se admitió). El staff necesita saberlo para actuar.
  reason: ScanReason | null;
  message: string;
  ticket: { id: string; shortCode: string; status: string } | null;
  // Para mostrar en pantalla (nombre, tier, sector). null cuando el ticket no es de este evento/alcance.
  detail: {
    eventName: string;
    tierName: string | null;
    sectorName: string;
    kind: 'VENTA' | 'CORTESIA' | null;
    holder: string | null;
    firstScannedAt: string | null;
    // Cuántas entradas tiene esta misma compra/cortesía y cuántas ya ingresaron (grupos)
    party: { total: number; entered: number };
  } | null;
}

const REJECT_MESSAGES: Record<ScanReason, string> = {
  YA_USADO: 'Esta entrada ya fue usada',
  ANULADO: 'Entrada anulada',
  NO_PAGADO: 'Entrada sin pago confirmado',
  OTRO_EVENTO: 'Esta entrada no es de este evento',
  NO_EXISTE: 'Código no reconocido',
};

function foreign(reason: 'OTRO_EVENTO' | 'NO_EXISTE'): ScanResult {
  return { result: 'RECHAZADO_INVALIDO', reason, message: REJECT_MESSAGES[reason], ticket: null, detail: null };
}

export interface SyncItemResult {
  ticketId: string;
  outcome: 'ADMITIDO' | 'SINCRONIZADO' | 'CONFLICTO' | 'RECHAZADO';
  reason: ScanReason | null;
  shortCode: string | null;
  holder: string | null;
  tierName: string | null;
  firstScannedAt: string | null;
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async scanTicket(
    ticketId: string,
    actor: AuthUser,
    deviceId: string,
    workingEventId?: string,
    method: AccessMethod = 'QR',
    scannedAt?: Date, // solo para sincronizaciones sin conexión: la hora real en que se escaneó
  ): Promise<ScanResult> {
    const performedBy = actor.sub;

    // Datos del ticket y de su evento (una sola lectura)
    let info:
      | {
          eventId: string;
          organizerId: string;
          eventName: string;
          tierName: string | null;
          tierKind: 'VENTA' | 'CORTESIA' | null;
          sectorName: string;
          buyerName: string | null;
          recipientName: string | null;
          orderId: string | null;
          courtesyId: string | null;
        }
      | undefined;
    try {
      [info] = await this.db
        .select({
          eventId: ticket.eventId,
          organizerId: event.organizerId,
          eventName: event.name,
          tierName: tier.name,
          tierKind: tier.kind,
          sectorName: sector.name,
          buyerName: order.buyerName,
          recipientName: courtesy.recipientName,
          orderId: order.id,
          courtesyId: ticket.courtesyId,
        })
        .from(ticket)
        .innerJoin(event, eq(event.id, ticket.eventId))
        .innerJoin(sector, eq(sector.id, ticket.sectorId))
        .leftJoin(tier, eq(tier.id, ticket.tierId))
        .leftJoin(orderItem, eq(orderItem.id, ticket.orderItemId))
        .leftJoin(order, eq(order.id, orderItem.orderId))
        .leftJoin(courtesy, eq(courtesy.id, ticket.courtesyId))
        .where(eq(ticket.id, ticketId))
        .limit(1);
    } catch {
      return foreign('NO_EXISTE'); // id con formato inválido
    }
    if (!info) return foreign('NO_EXISTE');

    // Alcance: el personal solo escanea eventos a los que está asignado (y de su organizador).
    // Un ticket ajeno se responde sin detalles y NO se registra Access: ensuciaría el
    // historial de puerta de un evento que no es suyo.
    if (!(await canScanEvent(this.db, actor, { id: info.eventId, organizerId: info.organizerId }))) {
      return foreign('OTRO_EVENTO');
    }
    // La app declara en qué evento está trabajando: un ticket de otro evento no entra por error
    if (workingEventId && workingEventId !== info.eventId) return foreign('OTRO_EVENTO');

    const holder = info.recipientName ?? info.buyerName ?? null;

    return this.db.transaction(async (tx) => {
      // El UPDATE condicionado es el invariante en sí: si dos escaneos del
      // mismo ticket llegan casi al mismo tiempo, solo uno puede encontrar
      // la fila en estado VALIDO — el otro ve 0 filas afectadas y sabe,
      // sin ambigüedad, que llegó tarde.
      const [admitted] = await tx
        .update(ticket)
        .set({ status: 'UTILIZADO' })
        .where(and(eq(ticket.id, ticketId), eq(ticket.status, 'VALIDO')))
        .returning();

      let result: ScanResult['result'];
      let reason: ScanReason | null = null;
      let ticketRow: typeof ticket.$inferSelect | undefined = admitted;
      let firstScannedAt: string | null = null;

      if (admitted) {
        result = 'ADMITIDO';
      } else {
        // No se admitió — se distingue POR QUÉ para mostrar el mensaje adecuado.
        const [current] = await tx.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1);
        ticketRow = current;
        if (current?.status === 'UTILIZADO') {
          result = 'RECHAZADO_YA_USADO';
          reason = 'YA_USADO';
          const [first] = await tx
            .select({ at: access.scannedAt })
            .from(access)
            .where(and(eq(access.ticketId, ticketId), eq(access.result, 'ADMITIDO')))
            .orderBy(access.scannedAt)
            .limit(1);
          firstScannedAt = first?.at.toISOString() ?? null;
        } else {
          result = 'RECHAZADO_INVALIDO';
          reason = current?.status === 'ANULADO' ? 'ANULADO' : 'NO_PAGADO';
        }
      }

      // Se registra SIEMPRE, admitido o rechazado (visibilidad de intentos de reingreso).
      if (ticketRow) {
        await tx.insert(access).values({ ticketId, performedBy, result, deviceId, method, ...(scannedAt ? { scannedAt } : {}) });
      }

      // Grupo: otras entradas de la misma compra (o de la misma cortesía)
      const owner = info!.orderId
        ? eq(orderItem.orderId, info!.orderId)
        : info!.courtesyId
          ? eq(ticket.courtesyId, info!.courtesyId)
          : undefined;
      let party = { total: 1, entered: result === 'ADMITIDO' || ticketRow?.status === 'UTILIZADO' ? 1 : 0 };
      if (owner) {
        const [g] = await tx
          .select({
            total: sql<number>`count(*)::int`,
            entered: sql<number>`count(*) filter (where ${ticket.status} = 'UTILIZADO')::int`,
          })
          .from(ticket)
          .leftJoin(orderItem, eq(orderItem.id, ticket.orderItemId))
          .where(and(owner, inArray(ticket.status, ['VALIDO', 'UTILIZADO'])));
        if (g) party = g;
      }

      return {
        result,
        reason,
        message: reason ? REJECT_MESSAGES[reason] : 'Entrada válida',
        ticket: ticketRow ? { id: ticketRow.id, shortCode: ticketRow.shortCode, status: ticketRow.status } : null,
        detail: {
          eventName: info!.eventName,
          tierName: info!.tierName,
          sectorName: info!.sectorName,
          kind: info!.tierKind,
          holder,
          firstScannedAt,
          party,
        },
      };
    });
  }

  // Notifica al dashboard en vivo del evento correspondiente. Se hace fuera
  // de la transacción y con su propio try/catch: un problema con Socket.io
  // NUNCA debe hacer fallar un escaneo real en la puerta — es una
  // notificación best-effort, no parte de la operación crítica.
  async scanTicketAndNotify(
    ticketId: string,
    actor: AuthUser,
    deviceId: string,
    workingEventId?: string,
    method: AccessMethod = 'QR',
    scannedAt?: Date,
  ): Promise<ScanResult> {
    const result = await this.scanTicket(ticketId, actor, deviceId, workingEventId, method, scannedAt);

    if (result.result === 'ADMITIDO' && result.ticket) {
      try {
        const [row] = await this.db
          .select({ eventId: ticket.eventId })
          .from(ticket)
          .where(eq(ticket.id, ticketId))
          .limit(1);

        if (row) {
          this.realtimeGateway.emitTicketValidated(row.eventId, {
            ticketId: result.ticket.id,
            shortCode: result.ticket.shortCode,
            scannedAt: (scannedAt ?? new Date()).toISOString(),
          });
        }
      } catch (err) {
        this.logger.warn(`No se pudo emitir ticket:validated para ${ticketId}: ${err}`);
      }
    }

    return result;
  }

  // Sincroniza admisiones hechas SIN conexión. Cada ítem trae la hora real del escaneo.
  // - Idempotente: si la respuesta anterior se perdió y la app reintenta, lo ya sincronizado por
  //   este mismo dispositivo no se cuenta como doble ingreso.
  // - Doble ingreso: si otro celular ya había admitido esa entrada, se devuelve CONFLICTO
  //   (queda un Access RECHAZADO_YA_USADO con método OFFLINE, para auditoría).
  async syncOfflineScans(
    actor: AuthUser,
    deviceId: string,
    eventId: string,
    items: { ticketId: string; scannedAt: string }[],
  ): Promise<SyncItemResult[]> {
    const now = Date.now();
    const parsed = items
      .map((i) => {
        const t = new Date(i.scannedAt).getTime();
        // Una hora absurda (reloj mal puesto) no debe falsear el registro: se usa la de ahora
        const ok = Number.isFinite(t) && t <= now + 10 * 60_000 && t >= now - 72 * 3600_000;
        return { ticketId: i.ticketId, at: new Date(ok ? t : now) };
      })
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    const out: SyncItemResult[] = [];
    for (const it of parsed) {
      const [already] = await this.db
        .select({ id: access.id })
        .from(access)
        .where(and(eq(access.ticketId, it.ticketId), eq(access.deviceId, deviceId), eq(access.result, 'ADMITIDO')))
        .limit(1);
      if (already) {
        out.push({ ticketId: it.ticketId, outcome: 'SINCRONIZADO', reason: null, shortCode: null, holder: null, tierName: null, firstScannedAt: null });
        continue;
      }
      const r = await this.scanTicketAndNotify(it.ticketId, actor, deviceId, eventId, 'OFFLINE', it.at);
      out.push({
        ticketId: it.ticketId,
        outcome: r.result === 'ADMITIDO' ? 'ADMITIDO' : r.reason === 'YA_USADO' ? 'CONFLICTO' : 'RECHAZADO',
        reason: r.reason,
        shortCode: r.ticket?.shortCode ?? null,
        holder: r.detail?.holder ?? null,
        tierName: r.detail?.tierName ?? null,
        firstScannedAt: r.detail?.firstScannedAt ?? null,
      });
    }
    return out;
  }
}
