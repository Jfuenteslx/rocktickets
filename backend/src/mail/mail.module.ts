import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { OrderMailService } from './order-mail.service.js';
import { TicketDeliveryModule } from '../orders/ticket-delivery.module.js';

@Global()
@Module({
  imports: [TicketDeliveryModule],
  providers: [MailService, OrderMailService],
  exports: [MailService, OrderMailService],
})
export class MailModule {}
