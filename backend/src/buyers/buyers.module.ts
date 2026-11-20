import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BuyersController } from './buyers.controller.js';
import { BuyersService } from './buyers.service.js';
import { BuyerAuthService } from './buyer-auth.service.js';
import { BuyerAuthGuard } from './buyer-auth.guard.js';

@Module({
  // Sin secreto por defecto: cada firma/verificación indica el secreto de comprador
  imports: [JwtModule.register({})],
  controllers: [BuyersController],
  providers: [BuyersService, BuyerAuthService, BuyerAuthGuard],
  exports: [BuyerAuthService],
})
export class BuyersModule {}
