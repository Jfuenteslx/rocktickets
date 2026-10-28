import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { AuthModule } from '../auth/auth.module.js';

// @Global(): TicketsService y PaymentsService necesitan emitir eventos sin
// que cada módulo tenga que importar RealtimeModule explícitamente.
@Global()
@Module({
  imports: [AuthModule], // el Gateway necesita JwtService para verificar el handshake
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
