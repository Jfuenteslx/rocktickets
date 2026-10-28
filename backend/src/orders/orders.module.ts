import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { TicketDeliveryService } from './ticket-delivery.service.js';
import { CourtesiesPublicController } from './courtesies-public.controller.js';
import { OrderExpirationProcessor } from './order-expiration.processor.js';

@Module({
  imports: [BullModule.registerQueue({ name: 'order-expiration' })],
  controllers: [OrdersController, CourtesiesPublicController],
  providers: [OrdersService, TicketDeliveryService, OrderExpirationProcessor],
})
export class OrdersModule {}
