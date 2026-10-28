import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  // AuthModule: necesario para que JwtAuthGuard/PermissionGuard tengan
  // JwtService/Reflector disponibles en el árbol de inyección de este módulo.
  imports: [AuthModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
