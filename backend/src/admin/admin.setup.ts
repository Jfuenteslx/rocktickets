import type { INestApplication } from '@nestjs/common';
import AdminJS, { ValidationError } from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import { Database, Resource } from '@adminjs/sql';
import Adapter from '@adminjs/sql';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { generateTicketsForEvent, assignTicketsToTier, issueCourtesy } from '../events/inventory.js';
import { db } from '../db/client.js';
import { user, event, tier, sector, organizer } from '../db/index.js';
import { AuditLogService } from '../audit/audit-log.service.js';

AdminJS.registerAdapter({ Database, Resource });

// Instanciado a mano (no vía DI de Nest): admin.setup.ts ya opera fuera del
// árbol de inyección de Nest (accede a `db` directo), así que seguimos el
// mismo patrón acá en vez de mezclar dos formas de resolver dependencias.
const auditLogService = new AuditLogService(db);

// Audita ediciones hechas DESDE EL PANEL. Solo 'edit' — 'new' queda fuera
// a propósito: @adminjs/sql no re-consulta la fila después del INSERT, así
// que el id generado (gen_random_uuid()) nunca llega en la respuesta ni en
// el context del hook. Confirmado empíricamente, no es un olvido: intentar
// adivinar el id recién creado buscando por campos "parecidos" sería más
// frágil que simplemente no auditar ese caso puntual. Las creaciones desde
// el panel quedan sin AuditLog; las ediciones posteriores sí.
function auditPanelEdit(entityType: string, action: string) {
  return async (response: any, request: any, context: any) => {
    const performedBy = context.currentAdmin?.id;
    const entityId = request?.params?.recordId;
    if (performedBy && entityId) {
      await auditLogService.log(performedBy, action, entityType, entityId, { source: 'adminjs' });
    }
    return response;
  };
}


const HIDDEN_TIMESTAMP = {
  isVisible: { list: false, filter: false, show: true, edit: false, new: false },
};

// "No se elimina físicamente información importante": se cierran delete Y
// bulkDelete (antes quedaba abierto bulkDelete) en todo lo que sea historial.
const NO_DELETE = {
  delete: { isAccessible: false },
  bulkDelete: { isAccessible: false },
};

const CLOSED_TABLE = {
  new: { isAccessible: false },
  edit: { isAccessible: false },
  ...NO_DELETE,
};

function adminId(context: any): string {
  return context.currentAdmin?.id;
}

// Convierte un error de dominio en un aviso del panel (en vez de una página rota)
function errorNotice(err: unknown) {
  const message = (err as any)?.response?.message ?? (err as Error)?.message ?? 'Error inesperado';
  return { message: Array.isArray(message) ? message.join(', ') : String(message), type: 'error' as const };
}

// --- Evento: acciones de un click ---

const eventActions = {
  new: { before: [fillCommissionSnapshot] },
  edit: { after: auditPanelEdit('Event', 'EVENT_UPDATED_VIA_ADMIN') },
  ...NO_DELETE,
  // Botón "Generar tickets": crea los tickets que faltan según la capacidad
  // de los sectores del venue, y lleva al listado de tickets de ESTE evento.
  generar_tickets: {
    actionType: 'record',
    icon: 'Ticket',
    label: 'Generar tickets',
    component: false,
    guard: 'Se crearán los tickets que falten según la capacidad de cada sector. ¿Continuar?',
    handler: async (_request: any, _response: any, context: any) => {
      const { record, currentAdmin } = context;
      try {
        const result = await generateTicketsForEvent(db, record.id());
        await auditLogService.log(adminId(context), 'TICKETS_GENERATED', 'Event', record.id(), {
          created: result.created,
          source: 'adminjs',
        });
        return {
          record: record.toJSON(currentAdmin),
          notice: {
            message:
              result.created > 0
                ? `Se crearon ${result.created} tickets nuevos (aforo del venue: ${result.venueCapacity}).`
                : `No faltaba ninguno: ya existen todos los tickets (aforo ${result.venueCapacity}).`,
            type: 'success',
          },
          redirectUrl: `/admin/resources/ticket?filters.event_id=${record.id()}`,
        };
      } catch (err) {
        return { record: record.toJSON(currentAdmin), notice: errorNotice(err) };
      }
    },
  },
  cancelar_evento: {
    actionType: 'record',
    icon: 'Close',
    label: 'Cancelar evento',
    component: false,
    guard: 'El evento queda CANCELADO y deja de venderse. Órdenes, pagos y tickets se conservan. ¿Continuar?',
    handler: async (_request: any, _response: any, context: any) => {
      const { record, currentAdmin } = context;
      const [row] = await db.select().from(event).where(eq(event.id, record.id())).limit(1);
      if (row?.status === 'CANCELADO') {
        return { record: record.toJSON(currentAdmin), notice: { message: 'Ya estaba cancelado', type: 'error' } };
      }
      await db.update(event).set({ status: 'CANCELADO' }).where(eq(event.id, record.id()));
      await auditLogService.log(adminId(context), 'EVENT_CANCELLED', 'Event', record.id(), {
        source: 'adminjs',
      });
      return {
        record: record.toJSON(currentAdmin),
        notice: { message: 'Evento cancelado', type: 'success' },
        redirectUrl: '/admin/resources/event',
      };
    },
  },
};

// --- Tier: validaciones al crear + asignación de tickets desde la edición ---

async function validateTierPayload(request: any) {
  if (request.method !== 'post') return request;
  // assign_quantity es una propiedad virtual (no es columna): nunca debe llegar al INSERT
  const { assign_quantity: _virtual, ...p } = request.payload ?? {};
  request.payload = p;
  if (p.event_id && p.sector_id) {
    const [ev] = await db.select().from(event).where(eq(event.id, p.event_id)).limit(1);
    const [sec] = await db.select().from(sector).where(eq(sector.id, p.sector_id)).limit(1);
    if (ev && sec && ev.venueId !== sec.venueId) {
      throw new ValidationError({
        sector_id: { message: 'Ese sector no pertenece al venue de este evento' },
      });
    }
  }
  // Una cortesía es gratis por definición
  if (p.kind === 'CORTESIA') request.payload = { ...p, price: '0' };
  return request;
}

async function applyAssignQuantity(request: any, context: any) {
  if (request.method !== 'post') return request;
  const raw = request.payload?.assign_quantity;
  if (request.payload && 'assign_quantity' in request.payload) {
    const { assign_quantity: _drop, ...rest } = request.payload; // no es columna: no debe llegar al UPDATE
    request.payload = rest;
  }
  const qty = raw === undefined || raw === '' || raw === null ? 0 : Number(raw);
  if (qty !== 0) {
    try {
      await assignTicketsToTier(db, request.params.recordId, qty);
      await auditLogService.log(adminId(context), 'TIER_TICKETS_ASSIGNED', 'Tier', request.params.recordId, {
        quantity: qty,
        source: 'adminjs',
      });
    } catch (err) {
      throw new ValidationError({ assign_quantity: { message: errorNotice(err).message } });
    }
  }
  return request;
}

// --- Cortesía: se emite desde el panel (no es un alta común) ---

const courtesyActions = {
  edit: { isAccessible: false },
  ...NO_DELETE,
  new: {
    label: 'Emitir cortesía',
    handler: async (request: any, _response: any, context: any) => {
      const { resource, currentAdmin } = context;
      if (request.method !== 'post') {
        const blank = resource.build({});
        return { record: blank.toJSON(currentAdmin) };
      }
      const p = request.payload ?? {};
      const record = resource.build(p);
      try {
        const errors: Record<string, { message: string }> = {};
        if (!p.tier_id) errors.tier_id = { message: 'Elige un tier de tipo CORTESIA' };
        if (!p.recipient_name) errors.recipient_name = { message: 'Requerido' };
        if (!p.recipient_email) errors.recipient_email = { message: 'Requerido' };
        const quantity = Number(p.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) errors.quantity = { message: 'Entero ≥ 1' };
        if (Object.keys(errors).length) throw new ValidationError(errors);

        const result = await issueCourtesy(
          db,
          p.tier_id,
          {
            recipientName: p.recipient_name,
            recipientEmail: p.recipient_email,
            reason: p.reason || undefined,
            quantity,
          },
          adminId(context),
        );
        await auditLogService.log(adminId(context), 'COURTESY_ISSUED', 'Courtesy', result.courtesyId, {
          tierId: p.tier_id,
          quantity,
          source: 'adminjs',
        });
        return {
          record: record.toJSON(currentAdmin),
          redirectUrl: `/admin/resources/courtesy/records/${result.courtesyId}/show`,
          notice: {
            message: `Cortesía emitida: ${result.tickets.map((t) => t.shortCode).join(', ')}`,
            type: 'success',
          },
        };
      } catch (err) {
        if (err instanceof ValidationError) {
          return { record: { ...record.toJSON(currentAdmin), errors: err.propertyErrors }, notice: { message: 'Revisa el formulario', type: 'error' } };
        }
        return { record: record.toJSON(currentAdmin), notice: errorNotice(err) };
      }
    },
  },
};

// --- Evento: al crear desde el panel, copiar la comisión por defecto del organizador ---
// (misma regla que la API: cambiar el valor por defecto después no altera eventos ya creados)
async function fillCommissionSnapshot(request: any) {
  if (request.method !== 'post' || !request.payload) return request;
  const p = request.payload;
  const empty = p.commission_pct === undefined || p.commission_pct === null || p.commission_pct === '';
  if (empty && p.organizer_id) {
    const [org] = await db.select().from(organizer).where(eq(organizer.id, p.organizer_id)).limit(1);
    if (org?.defaultCommissionPct != null) {
      request.payload = { ...p, commission_pct: org.defaultCommissionPct };
    }
  }
  return request;
}

// --- Usuario: coherencia rol ↔ organizador (la base también lo exige; esto da un mensaje claro) ---
async function validateUserRole(request: any, context: any) {
  if (request.method !== 'post' || !request.payload) return request;
  const p = request.payload;
  const role = p.role ?? context?.record?.params?.role;
  const orgId = p.organizer_id ?? (p.organizer_id === undefined ? context?.record?.params?.organizer_id : null);
  if (role === 'ORGANIZADOR' && !orgId) {
    throw new ValidationError({ organizer_id: { message: 'Un ORGANIZADOR debe pertenecer a un organizador' } });
  }
  if (role === 'SUPERADMIN' && orgId) {
    throw new ValidationError({ organizer_id: { message: 'El SUPERADMIN no pertenece a ningún organizador' } });
  }
  return request;
}

// --- Usuario: alta de staff con contraseña (se hashea acá, nunca se guarda en claro) ---

async function hashPasswordInPayload(request: any) {
  if (request.method !== 'post' || !request.payload) return request;
  const { password, ...rest } = request.payload;
  if (password) rest.password_hash = await bcrypt.hash(String(password), 10);
  request.payload = rest;
  return request;
}

export async function setupAdmin(app: INestApplication) {
  const sqlDb = await new Adapter('postgresql', {
    connectionString: process.env.DATABASE_URL!,
    database: 'rocktickets',
  }).init();

  const admin = new AdminJS({
    resources: [
      {
        // Quién produce eventos. La comisión es el valor POR DEFECTO para sus eventos nuevos.
        resource: sqlDb.table('organizer'),
        options: {
          titleProperty: 'name',
          properties: {
            created_at: HIDDEN_TIMESTAMP,
            default_commission_pct: {
              description: 'Comisión (%) que Rocktickets descuenta al organizador. Vacío = sin definir. Solo afecta a eventos NUEVOS.',
            },
          },
          actions: { edit: { after: auditPanelEdit('Organizer', 'ORGANIZER_UPDATED_VIA_ADMIN') }, ...NO_DELETE },
        },
      },
      {
        resource: sqlDb.table('venue'),
        options: {
          titleProperty: 'name',
          properties: { created_at: HIDDEN_TIMESTAMP },
          actions: { bulkDelete: { isAccessible: false } },
        },
      },
      {
        resource: sqlDb.table('sector'),
        options: {
          titleProperty: 'name',
          properties: { created_at: HIDDEN_TIMESTAMP },
          actions: {
            edit: { after: auditPanelEdit('Sector', 'SECTOR_UPDATED_VIA_ADMIN') },
            bulkDelete: { isAccessible: false },
          },
        },
      },
      {
        resource: sqlDb.table('event'),
        options: {
          titleProperty: 'name',
          properties: {
            created_at: HIDDEN_TIMESTAMP,
            // El estado se maneja con la acción "Cancelar evento", no a mano
            status: { isVisible: { list: true, filter: true, show: true, edit: false, new: false } },
            commission_pct: {
              description: 'Comisión (%) de ESTE evento. Se copia del organizador al crear; vacío = sin definir.',
            },
            image_path: { description: 'Ruta de la imagen, p. ej. events/mi-foto.jpg (carpeta uploads del backend). También se sube por POST /events/:id/image.' },
          },
          actions: eventActions,
        },
      },
      {
        resource: sqlDb.table('tier'),
        options: {
          titleProperty: 'name',
          properties: {
            created_at: HIDDEN_TIMESTAMP,
            kind: {
              // El enum de Postgres no se detecta solo: sin esto el panel muestra texto libre
              availableValues: [
                { value: 'VENTA', label: 'VENTA (se vende al público)' },
                { value: 'CORTESIA', label: 'CORTESIA (gratis, solo se emite desde el panel)' },
              ],
            },
            assign_quantity: {
              type: 'number',
              description: 'Tickets a asignar a este tier (+) o devolver al pool sin tier (−). Se toman del mismo sector.',
              isVisible: { list: false, filter: false, show: false, edit: true, new: false },
            },
          },
          actions: {
            new: { before: [validateTierPayload] },
            edit: {
              before: [applyAssignQuantity],
              after: auditPanelEdit('Tier', 'TIER_UPDATED_VIA_ADMIN'),
            },
            ...NO_DELETE,
          },
        },
      },
      {
        resource: sqlDb.table('courtesy'),
        options: {
          titleProperty: 'recipient_name',
          properties: {
            created_at: HIDDEN_TIMESTAMP,
            event_id: { isVisible: { list: true, filter: true, show: true, edit: false, new: false } },
            issued_by: { isVisible: { list: true, filter: true, show: true, edit: false, new: false } },
            tier_id: {
              type: 'reference',
              reference: 'tier',
              description: 'Solo tiers de tipo CORTESIA',
              isVisible: { list: false, filter: false, show: false, edit: false, new: true },
            },
            quantity: {
              type: 'number',
              isVisible: { list: false, filter: false, show: false, edit: false, new: true },
            },
          },
          actions: courtesyActions,
        },
      },
      {
        resource: sqlDb.table('user'),
        options: {
          titleProperty: 'name',
          properties: {
            password_hash: { isVisible: false },
            created_at: HIDDEN_TIMESTAMP,
            role: {
              availableValues: [
                { value: 'SUPERADMIN', label: 'SUPERADMIN (Rocktickets, control total)' },
                { value: 'ORGANIZADOR', label: 'ORGANIZADOR (administra su organización)' },
                { value: 'STAFF_PUERTA', label: 'STAFF_PUERTA (verifica entradas)' },
              ],
            },
            organizer_id: {
              description: 'Vacío = personal/administración de Rocktickets. Obligatorio para ORGANIZADOR.',
            },
            approval_status: {
              availableValues: [
                { value: 'PENDIENTE', label: 'PENDIENTE (no puede entrar)' },
                { value: 'APROBADO', label: 'APROBADO' },
                { value: 'RECHAZADO', label: 'RECHAZADO' },
              ],
            },
            password: {
              type: 'password',
              description: 'Contraseña inicial (se guarda cifrada). En edición, déjalo vacío para no cambiarla.',
              isVisible: { list: false, filter: false, show: false, edit: true, new: true },
            },
          },
          // Staff no se elimina físicamente — se desactiva con is_active.
          actions: {
            new: { before: [validateUserRole, hashPasswordInPayload] },
            edit: {
              before: [hashPasswordInPayload],
              after: auditPanelEdit('User', 'USER_UPDATED_VIA_ADMIN'),
            },
            ...NO_DELETE,
          },
        },
      },
      {
        resource: sqlDb.table('order'),
        options: { properties: { created_at: HIDDEN_TIMESTAMP }, actions: CLOSED_TABLE },
      },
      { resource: sqlDb.table('order_item'), options: { actions: CLOSED_TABLE } },
      { resource: sqlDb.table('payment'), options: { actions: { ...NO_DELETE } } },
      {
        // Los tickets se crean con "Generar tickets" y se mueven con las
        // acciones de tier/orden/pago — no se editan a mano (rompería las
        // reglas de estado). Solo consulta.
        resource: sqlDb.table('ticket'),
        options: { titleProperty: 'short_code', actions: CLOSED_TABLE },
      },
      { resource: sqlDb.table('access'), options: { actions: CLOSED_TABLE } },
      {
        resource: sqlDb.table('audit_log'),
        options: {
          // Decisión ya cerrada: el AuditLog no se edita ni se borra desde el panel.
          actions: CLOSED_TABLE,
        },
      },
    ],
    rootPath: '/admin',
    branding: { companyName: 'Rocktickets' },
  });

  // Auth REAL contra nuestra tabla User — no un admin hardcodeado. Reusa el
  // mismo password_hash que ya usa AuthModule para el login de la API.
  // Nota: esto es una sesión de AdminJS separada de nuestro JWT — dos
  // sistemas de auth conviviendo, cada uno con su propio propósito
  // (JWT para la API/apps, sesión de cookie para este panel humano).
  const router = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      cookiePassword: process.env.JWT_SECRET!, // reusamos el secreto existente, no inventamos uno nuevo
      cookieName: 'rocktickets-admin',
      authenticate: async (email: string, password: string) => {
        const [foundUser] = await db.select().from(user).where(eq(user.email, email)).limit(1);
        if (!foundUser || !foundUser.isActive || foundUser.role !== 'SUPERADMIN' || foundUser.approvalStatus !== 'APROBADO') return null;
        const matches = await bcrypt.compare(password, foundUser.passwordHash);
        return matches ? foundUser : null;
      },
    },
    null,
    { resave: false, saveUninitialized: false, secret: process.env.JWT_SECRET! },
  );

  const httpAdapter = app.getHttpAdapter().getInstance();
  httpAdapter.use(admin.options.rootPath, router);
}
