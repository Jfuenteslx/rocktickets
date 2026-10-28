import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaymentsDemoController } from './payments-demo.controller.js';

@Module({
  controllers: [PaymentsDemoController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
