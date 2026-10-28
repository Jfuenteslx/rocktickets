import type { UserRole } from '../db/schema/enums.js';

export type Permission =
  | 'events:manage'
  | 'tiers:manage'
  | 'staff:manage'
  | 'staff:approve'
  | 'organizers:manage'
  | 'venues:manage'
  | 'orders:read'
  | 'payments:read'
  | 'tickets:read'
  | 'access:scan'
  | 'access:read'
  | 'courtesies:issue';

// Único lugar del código que traduce "role" a "qué puede hacer".
// OJO: el permiso dice QUÉ tipo de acción; el ALCANCE (solo lo de mi organizador)
// lo aplica cada servicio con canManageOrganizer/canScanOrganizer. Un permiso
// sin filtro de alcance sería una puerta abierta entre organizadores.
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPERADMIN: [
    'events:manage',
    'tiers:manage',
    'staff:manage',
    'staff:approve',
    'organizers:manage',
    'venues:manage',
    'orders:read',
    'payments:read',
    'tickets:read',
    'access:scan',
    'access:read',
    'courtesies:issue',
  ],
  // orders:read: sus ventas y órdenes (el servicio filtra por organizador). payments:read sigue
  // siendo solo del superadmin: la conciliación con el banco no es asunto del organizador.
  ORGANIZADOR: ['events:manage', 'tiers:manage', 'staff:manage', 'courtesies:issue', 'orders:read'],
  STAFF_PUERTA: ['access:scan', 'access:read'],
};

export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
