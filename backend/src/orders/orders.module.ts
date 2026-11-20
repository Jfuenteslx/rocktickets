import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { TicketDeliveryModule } from './ticket-delivery.module.js';
import { CourtesiesPublicController } from './courtesies-public.controller.js';
import { OrderExpirationProcessor } from './order-expiration.processor.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { BuyersModule } from '../buyers/buyers.module.js';

@Module({
  imports: [BullModule.registerQueue({ name: 'order-expiration' }), PaymentsModule, TicketDeliveryModule, BuyersModule],
  controllers: [OrdersController, CourtesiesPublicController],
  providers: [OrdersService, OrderExpirationProcessor],
})
export class OrdersModule {}
