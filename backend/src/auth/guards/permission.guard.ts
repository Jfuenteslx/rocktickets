import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator.js';
import { roleHasPermission, type Permission } from '../permissions.js';
import type { JwtPayload } from '../auth.service.js';

// Corre DESPUÉS de JwtAuthGuard (req.user ya existe). Lee el permiso
// declarado con @RequierePermiso en el handler y lo resuelve contra
// ROLE_PERMISSIONS. El controller nunca sabe qué role tiene el usuario,
// solo que "tiene o no tiene" el permiso pedido.
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.get<Permission | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    // Sin @RequierePermiso en el endpoint: solo requiere estar autenticado
    // (JwtAuthGuard ya lo garantizó), no hace falta chequear nada más acá.
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const jwtUser = request.user as JwtPayload | undefined;

    if (!jwtUser) {
      throw new ForbiddenException('No autenticado');
    }

    if (!roleHasPermission(jwtUser.role, requiredPermission)) {
      throw new ForbiddenException(`Requiere el permiso: ${requiredPermission}`);
    }

    return true;
  }
}
