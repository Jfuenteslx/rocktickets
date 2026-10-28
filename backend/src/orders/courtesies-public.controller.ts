import { Controller, Get, Param, ParseUUIDPipe, StreamableFile } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TicketDeliveryService } from './ticket-delivery.service.js';

// Público: el invitado de una cortesía entra con el token de su enlace
// (el token es la autorización, igual que en /orders/token/:accessToken).
// El límite se cuenta por token (ver OrderAwareThrottlerGuard).
@Controller('courtesies')
export class CourtesiesPublicController {
  constructor(private readonly delivery: TicketDeliveryService) {}

  @Get('token/:accessToken')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  view(@Param('accessToken', ParseUUIDPipe) accessToken: string) {
    return this.delivery.courtesyView(accessToken);
  }

  @Get('token/:accessToken/tickets/:ticketId/qr.png')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async qr(
    @Param('accessToken', ParseUUIDPipe) accessToken: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    const png = await this.delivery.courtesyQrPng(accessToken, ticketId);
    return new StreamableFile(png, { type: 'image/png', disposition: 'inline' });
  }

  @Get('token/:accessToken/tickets.pdf')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async pdf(@Param('accessToken', ParseUUIDPipe) accessToken: string) {
    const pdf = await this.delivery.courtesyPdf(accessToken);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'attachment; filename="entradas-rocktickets.pdf"',
    });
  }
}
