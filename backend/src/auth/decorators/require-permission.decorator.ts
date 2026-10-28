import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../permissions.js';

export const PERMISSION_KEY = 'permission';

// Uso: @RequierePermiso('events:manage') sobre un método de controller.
// El PermissionGuard lee este metadato y lo resuelve contra el role del
// usuario autenticado — el controller nunca pregunta por "role" directamente.
export const RequierePermiso = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);
