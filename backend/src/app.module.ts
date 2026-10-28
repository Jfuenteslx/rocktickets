import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { OrderAwareThrottlerGuard } from './common/order-aware-throttler.guard.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './db/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { EventsModule } from './events/events.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { TicketsModule } from './tickets/tickets.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { AuditModule } from './audit/audit.module.js';
import { OrganizersModule } from './organizers/organizers.module.js';
import { VenuesModule } from './venues/venues.module.js';
import { StaffModule } from './staff/staff.module.js';
import { DoorModule } from './door/door.module.js';
import { SalesModule } from './sales/sales.module.js';

@Module({
  imports: [
    // Límite general moderado (120/min por cliente); los endpoints sensibles
    // lo endurecen con @Throttle. Con varias instancias, el contador pasa a Redis.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    QueueModule,
    RealtimeModule,
    AuditModule,
    AuthModule,
    EventsModule,
    OrdersModule,
    PaymentsModule,
    TicketsModule,
    OrganizersModule,
    VenuesModule,
    StaffModule,
    DoorModule,
    SalesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: OrderAwareThrottlerGuard }],
})
export class AppModule {}
