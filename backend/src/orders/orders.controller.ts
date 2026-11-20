import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OrdersService } from './orders.service.js';
import { TicketDeliveryService } from './ticket-delivery.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { RecoverOrdersDto } from './dto/recover-orders.dto.js';
import { OrderMailService } from '../mail/order-mail.service.js';
import { BuyerAuthService } from '../buyers/buyer-auth.service.js';
import { CheckoutService } from '../payments/checkout.service.js';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly deliveryService: TicketDeliveryService,
    private readonly checkout: CheckoutService,
    private readonly orderMail: OrderMailService,
    private readonly buyerAuth: BuyerAuthService,
  ) {}

  // Público — guest checkout, sin auth. Límite estricto por IP: crear una
  // orden reserva stock, así que es el endpoint más atractivo para abusar.
  // (El límite NO reemplaza el control de stock: eso lo decide PostgreSQL.)
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createOrder(@Body() dto: CreateOrderDto, @Headers('authorization') authorization?: string) {
    // La sesión de comprador es opcional: sin ella (o con una inválida) es compra de invitado
    const buyer = await this.buyerAuth.fromAuthHeader(authorization);
    return this.ordersService.createOrder(dto, buyer?.id ?? null);
  }

  // Público — "recuperar mis tickets": envía por correo los enlaces de las compras pagadas con ese
  // email. Responde SIEMPRE igual (haya o no compras) para no revelar qué correos compraron.
  // Límite estricto por IP; además cada correo tiene una pausa entre pedidos (ver OrderMailService).
  @Post('recover')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  async recover(@Body() dto: RecoverOrdersDto) {
    await this.orderMail.sendRecovery(dto.email);
    return { ok: true };
  }

  // Público — el token en sí es la autorización. Límite por TOKEN (ver
  // OrderAwareThrottlerGuard): la pantalla consulta cada 3 s (~20/min).
  @Get('token/:accessToken')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getOrderByToken(@Param('accessToken', ParseUUIDPipe) accessToken: string) {
    return this.ordersService.getOrderByToken(accessToken);
  }

  // QR de pago vigente de la orden (PNG). Solo existe mientras haya un cobro PENDIENTE.
  @Get('token/:accessToken/payment/qr.png')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  async paymentQr(@Param('accessToken', ParseUUIDPipe) accessToken: string) {
    const png = await this.checkout.qrPng(accessToken);
    return new StreamableFile(png, { type: 'image/png', disposition: 'inline' });
  }

  // Cobro nuevo para la misma orden cuando el QR venció (o no se pudo generar).
  // Devuelve la orden actualizada, igual que GET token/:accessToken.
  @Post('token/:accessToken/payment/regenerate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async regeneratePayment(@Param('accessToken', ParseUUIDPipe) accessToken: string) {
    await this.checkout.regenerate(accessToken);
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
