import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/auth.service.js';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { event } from '../db/index.js';
import { canManageOrganizer, canScanEvent, loadAuthUser } from '../auth/access.js';

// CORS abierto para el MVP — en producción se restringe a los dominios
// reales del frontend/apps, igual que hicimos con app.enableCors() en la API REST.
@Injectable()
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  // Mismo JWT que ya usa la API REST — no se inventa un mecanismo de auth
  // aparte. El cliente lo manda en el handshake: io(url, { auth: { token } }).
  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      this.logger.warn(`Conexión rechazada (sin token): ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      client.data.user = payload;
    } catch {
      this.logger.warn(`Conexión rechazada (token inválido): ${client.id}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  // El dashboard del ADMIN (o el staff de puerta que quiera ver asistencia
  // en vivo) se suscribe a un evento puntual — no recibe todo lo que pasa
  // en la plataforma, solo lo de ese evento.
  @SubscribeMessage('join-event')
  async handleJoinEvent(@ConnectedSocket() client: Socket, @MessageBody() data: { eventId: string }) {
    // Solo se puede escuchar un evento si el usuario tiene alcance sobre su
    // organizador (identidad leída de la base, no del token).
    const tokenUser = client.data.user as JwtPayload | undefined;
    const actor = tokenUser ? await loadAuthUser(this.db, tokenUser.sub) : null;
    let allowed = false;
    if (actor && typeof data?.eventId === 'string') {
      try {
        const [ev] = await this.db
          .select({ id: event.id, organizerId: event.organizerId })
          .from(event)
          .where(eq(event.id, data.eventId))
          .limit(1);
        allowed = !!ev && (canManageOrganizer(actor, ev.organizerId) || (await canScanEvent(this.db, actor, ev)));
      } catch {
        allowed = false;
      }
    }
    if (!allowed) return { error: 'Sin acceso a este evento' };
    client.join(`event:${data.eventId}`);
    return { joined: data.eventId };
  }

  emitTicketValidated(
    eventId: string,
    payload: { ticketId: string; shortCode: string; scannedAt: string },
  ) {
    this.server.to(`event:${eventId}`).emit('ticket:validated', payload);
  }

  emitOrderPaid(eventId: string, payload: { orderId: string; ticketsCount: number; amount: string }) {
    this.server.to(`event:${eventId}`).emit('order:paid', payload);
  }
}
