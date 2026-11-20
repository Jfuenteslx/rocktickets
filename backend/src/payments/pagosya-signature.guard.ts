import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { isValidSignature } from './pagosya-signature.js';

// Corre ANTES de validar el cuerpo: un aviso sin firma válida se rechaza sin procesarse.
@Injectable()
export class PagosYaSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const signature = req.headers['x-pagosya-signature'];
    if (!isValidSignature(req.rawBody, typeof signature === 'string' ? signature : undefined)) {
      throw new UnauthorizedException('Firma inválida');
    }
    return true;
  }
}
