import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Quién cuenta como "el mismo cliente" para el límite de peticiones:
//  - rutas de orden (/orders/token/:accessToken/...): por TOKEN, así un
//    comprador detrás de una IP compartida (red del bar, datos móviles con
//    NAT) no consume el cupo de otros compradores;
//  - todo lo demás: por IP.
@Injectable()
export class OrderAwareThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const token = req.params?.accessToken;
    return token ? `order:${token}` : (req.ip ?? 'unknown');
  }
}
