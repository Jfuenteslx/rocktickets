import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { organizer, staffEvent, user } from '../db/index.js';
import type { UserRole } from '../db/schema/enums.js';

// Quién es el usuario autenticado, tal como está AHORA en la base de datos.
// (organizerId viaja en el JWT solo como dato informativo: lo que se usa para
// decidir es esta lectura fresca, así una baja o un rechazo surten efecto al instante.)
export interface AuthUser {
  sub: string; // user.id
  role: UserRole;
  organizerId: string | null;
}

// Devuelve null si la cuenta no puede operar: inexistente, desactivada, sin
// aprobar, o perteneciente a un organizador desactivado.
export async function loadAuthUser(db: Database, userId: string): Promise<AuthUser | null> {
  const [row] = await db
    .select({
      id: user.id,
      role: user.role,
      organizerId: user.organizerId,
      isActive: user.isActive,
      approvalStatus: user.approvalStatus,
      organizerActive: organizer.isActive,
    })
    .from(user)
    .leftJoin(organizer, eq(organizer.id, user.organizerId))
    .where(and(eq(user.id, userId)))
    .limit(1);

  if (!row || !row.isActive || row.approvalStatus !== 'APROBADO') return null;
  if (row.organizerId && row.organizerActive === false) return null;
  return { sub: row.id, role: row.role, organizerId: row.organizerId };
}

// ¿Puede ADMINISTRAR (crear/editar/ver detalle) cosas de este organizador?
export function canManageOrganizer(actor: AuthUser, organizerId: string): boolean {
  return (
    actor.role === 'SUPERADMIN' || (actor.role === 'ORGANIZADOR' && actor.organizerId === organizerId)
  );
}

// ¿Puede ESCANEAR/ver en vivo eventos de este organizador?
// Staff sin organizador = personal de Rocktickets: cualquier evento.
export function canScanOrganizer(actor: AuthUser, organizerId: string): boolean {
  if (actor.role === 'SUPERADMIN') return true;
  if (actor.role === 'STAFF_PUERTA') return actor.organizerId === null || actor.organizerId === organizerId;
  return false;
}

// ¿Puede ESCANEAR este evento concreto? El superadmin siempre. El personal de puerta
// necesita las dos cosas: alcance sobre el organizador Y estar asignado al evento.
export async function canScanEvent(
  db: Database,
  actor: AuthUser,
  ev: { id: string; organizerId: string },
): Promise<boolean> {
  if (actor.role === 'SUPERADMIN') return true;
  if (actor.role !== 'STAFF_PUERTA' || !canScanOrganizer(actor, ev.organizerId)) return false;
  const [row] = await db
    .select({ userId: staffEvent.userId })
    .from(staffEvent)
    .where(and(eq(staffEvent.userId, actor.sub), eq(staffEvent.eventId, ev.id)))
    .limit(1);
  return !!row;
}
