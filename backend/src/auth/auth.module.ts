import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { PermissionGuard } from './guards/permission.guard.js';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: { expiresIn: '8h' }, // turno de trabajo típico de un operador
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, PermissionGuard],
  // Exportamos JwtModule también: cualquier módulo futuro (EventsModule,
  // TicketsModule...) que importe AuthModule para usar @UseGuards(JwtAuthGuard)
  // necesita JwtService disponible en su propio árbol de inyección.
  exports: [AuthService, JwtAuthGuard, PermissionGuard, JwtModule],
})
export class AuthModule {}
