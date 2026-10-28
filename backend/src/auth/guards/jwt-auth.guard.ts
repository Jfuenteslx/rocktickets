import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DRIZZLE } from '../../db/database.module.js';
import type { Database } from '../../db/client.js';
import type { JwtPayload } from '../auth.service.js';
import { loadAuthUser } from '../access.js';

// Sube por todos los endpoints protegidos: valida el Bearer token y adjunta
// req.user. Los datos de req.user (rol, organizador) se leen de la BASE en cada
// request, no del token: si desactivan o rechazan a alguien, deja de poder
// operar al instante en vez de al vencer su token. Es una consulta por PK.
// No sabe nada de permisos — eso es de PermissionGuard, que corre después.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token no proporcionado');
    }

    const token = authHeader.slice('Bearer '.length);

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const current = await loadAuthUser(this.db, payload.sub);
    if (!current) throw new UnauthorizedException('Cuenta no habilitada');

    request.user = current;
    return true;
  }
}
