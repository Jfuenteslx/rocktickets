import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service.js';
import { TicketDeliveryService } from './ticket-delivery.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly deliveryService: TicketDeliveryService,
  ) {}

  // Público — guest checkout, sin auth. Límite estricto por IP: crear una
  // orden reserva stock, así que es el endpoint más atractivo para abusar.
  // (El límite NO reemplaza el control de stock: eso lo decide PostgreSQL.)
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createOrder(@Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(dto);
  }

  // Público — el token en sí es la autorización. Límite por TOKEN (ver
  // OrderAwareThrottlerGuard): la pantalla consulta cada 3 s (~20/min).
  @Get('token/:accessToken')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getOrderByToken(@Param('accessToken', ParseUUIDPipe) accessToken: string) {
    return this.ordersService.getOrderByToken(accessToken);
  }

  // QR de un ticket (PNG). Solo si la orden está PAGADA y el ticket es de ella.
  @Get('token/:accessToken/tickets/:ticketId/qr.png')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async ticketQr(
    @Param('accessToken', ParseUUIDPipe) accessToken: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ) {
    const png = await this.deliveryService.ticketQrPng(accessToken, ticketId);
    return new StreamableFile(png, { type: 'image/png', disposition: 'inline' });
  }

  // PDF con todos los tickets de la orden, una página por ticket
  @Get('token/:accessToken/tickets.pdf')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async ordersPdf(@Param('accessToken', ParseUUIDPipe) accessToken: string) {
    const pdf = await this.deliveryService.orderPdf(accessToken);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'attachment; filename="tickets-rocktickets.pdf"',
    });
  }
}
