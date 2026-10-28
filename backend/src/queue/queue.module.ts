import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

// @Global(): cualquier módulo que registre una cola con BullModule.registerQueue
// reusa esta misma conexión a Redis, sin tener que configurarla de nuevo.
@Global()
@Module({
  imports: [
    BullModule.forRoot({
      connection: { url: process.env.REDIS_URL! },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
