import { Module } from '@nestjs/common';
import { TicketDeliveryService } from './ticket-delivery.service.js';

// Propio módulo para que lo usen tanto las órdenes (descarga) como el correo (adjunto PDF)
// sin crear una dependencia circular entre ellos.
@Module({
  providers: [TicketDeliveryService],
  exports: [TicketDeliveryService],
})
export class TicketDeliveryModule {}
