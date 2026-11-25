import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { OrdersService } from './orders.service.js';

@Processor('order-expiration')
export class OrderExpirationProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderExpirationProcessor.name);

  constructor(private readonly ordersService: OrdersService) {
    super();
  }

  async process(job: Job<{ orderId: string; force?: boolean }>): Promise<void> {
    const { orderId, force } = job.data;
    const result = await this.ordersService.expireOrderIfStillPending(orderId, { force });

    if (result.expired) {
      this.logger.log(`Order ${orderId} expiró — stock liberado`);
    } else {
      this.logger.log(`Order ${orderId} no se liberó (ya estaba resuelta o su pago está en revisión)`);
    }
  }
}
