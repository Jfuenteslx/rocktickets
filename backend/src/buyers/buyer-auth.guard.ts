import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { BuyerAuthService } from './buyer-auth.service.js';

// Para los endpoints que SÍ exigen sesión de comprador. Adjunta req.buyer.
@Injectable()
export class BuyerAuthGuard implements CanActivate {
  constructor(private readonly auth: BuyerAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const buyer = await this.auth.fromAuthHeader(req.headers.authorization);
    if (!buyer) throw new UnauthorizedException('Inicia sesión para continuar');
    req.buyer = buyer;
    return true;
  }
}
