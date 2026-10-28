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

  async process(job: Job<{ orderId: string }>): Promise<void> {
    const { orderId } = job.data;
    const result = await this.ordersService.expireOrderIfStillPending(orderId);

    if (result.expired) {
      this.logger.log(`Order ${orderId} expiró — stock liberado`);
    } else {
      this.logger.log(`Order ${orderId} ya no estaba pendiente, no se tocó nada`);
    }
  }
}
