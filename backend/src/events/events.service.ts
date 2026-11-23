import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import {
  courtesy,
  event,
  eventTable,
  tablePackage,
  organizer,
  seat,
  sector,
  sectorTable,
  ticket,
  tier,
  user,
  venue,
  venueElement,
  venueLevel,
  venuePhoto,
} from '../db/index.js';
import { LAYOUT_CANVAS } from '../venues/layout.constants.js';
import { canManageOrganizer, type AuthUser } from '../auth/access.js';
import type { CreateEventDto } from './dto/create-event.dto.js';
import type { CreateTierDto } from './dto/create-tier.dto.js';
import type { UpdateTierDto } from './dto/update-tier.dto.js';
import type { UpdateEventDto } from './dto/update-event.dto.js';
import type { IssueCourtesyDto } from './dto/issue-courtesy.dto.js';
import type { SeatingModeDto } from './dto/seating-mode.dto.js';
import type { AssignSeatsDto } from './dto/assign-seats.dto.js';
import type { TablePackageDto, AssignTablePackageDto } from './dto/table-package.dto.js';
import { flexAvailability, listFlexTables, setTableBlocks } from './mesas-flex.js';
import { MAX_TABLES_PER_ORDER, assignPackageToTables, createPackage, deletePackage, listPackages, setTableValidUntil, updatePackage } from './mesas.js';
import { AuditLogService } from '../audit/audit-log.service.js';
import {
  assignSeatsToTier,
  assignTicketsToTier,
  generateTicketsForEvent,
  MAX_SEATS_PER_ORDER,
  setSeatingMode,
  issueCourtesy,
  ticketCountsByTier,
} from './inventory.js';

@Injectable()
export class EventsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditLog: AuditLogService,
  ) {}

  // --- Lectura pública ---

  async listActiveEvents() {
    const events = await this.db
      .select()
      .from(event)
      .where(eq(event.status, 'ACTIVO'))
      .orderBy(event.startsAt);

    return Promise.all(events.map((e) => this.buildPublicEvent(e)));
  }

  async getEvent(eventId: string) {
    const [found] = await this.db.select().from(event).where(eq(event.id, eventId)).limit(1);
    if (!found) throw new NotFoundException('Evento no encontrado');
    return this.buildPublicEvent(found);
  }

  // Mapa público de asientos de un evento con butacas: el plano (niveles, sectores, elementos)
  // y cada asiento con su estado y precio. Nunca se dice QUIÉN ocupa un asiento.
  //   LIBRE    → se puede elegir
  //   OCUPADO  → reservado por otra compra en curso o ya vendido
  //   NO_VENTA → sin precio asignado, pausado, fuera de ventana o reservado por el organizador
  async getSeatMap(eventId: string) {
    const [ev] = await this.db.select().from(event).where(eq(event.id, eventId)).limit(1);
    if (!ev) throw new NotFoundException('Evento no encontrado');
    if (ev.seatingMode !== 'BUTACAS' && ev.seatingMode !== 'MESAS_FIJAS') {
      throw new BadRequestException('Este evento no vende por asiento ni por mesa');
    }

    const levels = await this.db
      .select()
      .from(venueLevel)
      .where(eq(venueLevel.venueId, ev.venueId))
      .orderBy(asc(venueLevel.position));
    const sectors = await this.db
      .select()
      .from(sector)
      .where(and(eq(sector.venueId, ev.venueId), eq(sector.sellable, true)));
    const levelIds = levels.map((l) => l.id);
    const elements = levelIds.length
      ? await this.db.select().from(venueElement).where(inArray(venueElement.levelId, levelIds))
      : [];
    const tiers = await this.db.select().from(tier).where(and(eq(tier.eventId, ev.id), eq(tier.kind, 'VENTA')));
    const tierById = new Map(tiers.map((t) => [t.id, t]));

    const sectorIds = sectors.map((s) => s.id);
    const rows = sectorIds.length
      ? await this.db
          .select({
            seatId: seat.id,
            sectorId: seat.sectorId,
            rowLabel: seat.rowLabel,
            label: seat.label,
            x: seat.x,
            y: seat.y,
            tableId: seat.tableId,
            tableLabel: sectorTable.label,
            ticketStatus: ticket.status,
            tierId: ticket.tierId,
          })
          .from(seat)
          .leftJoin(sectorTable, eq(sectorTable.id, seat.tableId))
          .leftJoin(ticket, and(eq(ticket.seatId, seat.id), eq(ticket.eventId, ev.id)))
          .where(and(inArray(seat.sectorId, sectorIds), eq(seat.active, true)))
      : [];

    const now = new Date();
    const seats = rows.map((r) => {
      const t = r.tierId ? tierById.get(r.tierId) : undefined;
      let status: 'LIBRE' | 'OCUPADO' | 'NO_VENTA';
      if (r.ticketStatus === 'RESERVADO' || r.ticketStatus === 'VALIDO' || r.ticketStatus === 'UTILIZADO') {
        status = 'OCUPADO';
      } else if (
        r.ticketStatus === 'DISPONIBLE' &&
        t &&
        !t.isPaused &&
        (!t.startsAt || now >= t.startsAt) &&
        (!t.endsAt || now < t.endsAt)
      ) {
        status = 'LIBRE';
      } else {
        status = 'NO_VENTA';
      }
      return {
        id: r.seatId,
        sectorId: r.sectorId,
        tableId: r.tableId,
        tableLabel: r.tableLabel,
        rowLabel: r.rowLabel,
        label: r.label,
        x: r.x,
        y: r.y,
        status,
        tierId: t?.id ?? null,
        price: t?.price ?? null,
      };
    });

    const tables = sectorIds.length
      ? await this.db.select().from(sectorTable).where(inArray(sectorTable.sectorId, sectorIds))
      : [];

    return {
      eventId: ev.id,
      seatingMode: ev.seatingMode,
      maxSeatsPerOrder: MAX_SEATS_PER_ORDER,
      canvas: LAYOUT_CANVAS,
      levels: levels.map((l) => ({
        id: l.id,
        name: l.name,
        position: l.position,
        sectors: sectors
          .filter((s) => s.levelId === l.id)
          .map((s) => ({
            id: s.id,
            name: s.name,
            type: s.type,
            view: s.view,
            accessible: s.accessible,
            color: s.color,
            buyerText: s.buyerText,
            x: s.x,
            y: s.y,
            w: s.w,
            h: s.h,
            points: s.points,
          })),
        elements: elements
          .filter((e) => e.levelId === l.id)
          .map((e) => ({ id: e.id, kind: e.kind, name: e.name, x: e.x, y: e.y, w: e.w, h: e.h })),
      })),
      tables: tables.map((t) => ({ id: t.id, sectorId: t.sectorId, label: t.label, x: t.x, y: t.y })),
      // Mesas fijas: cada mesa se vende completa con su paquete (precio total, personas, botellas)
      ...(ev.seatingMode === 'MESAS_FIJAS' ? { validUntil: ev.tableValidUntil, maxTablesPerOrder: MAX_TABLES_PER_ORDER, mesas: await this.buildMesas(ev.id, tables, seats) } : {}),
      tiers: tiers
        .filter((t) => seats.some((s) => s.tierId === t.id))
        .map((t) => ({ id: t.id, name: t.name, sectorId: t.sectorId, price: t.price })),
      seats,
    };
  }

  private async buildMesas(
    eventId: string,
    tables: { id: string; sectorId: string; label: string; x: number; y: number }[],
    seats: { id: string; tableId: string | null; status: 'LIBRE' | 'OCUPADO' | 'NO_VENTA' }[],
  ) {
    const links = await this.db.select().from(eventTable).where(eq(eventTable.eventId, eventId));
    const packages = await this.db.select().from(tablePackage).where(eq(tablePackage.eventId, eventId));
    const pkgById = new Map(packages.map((p) => [p.id, p]));
    const linkByTable = new Map(links.map((l) => [l.tableId, l]));
    return tables
      .map((t) => {
        const mine = seats.filter((s) => s.tableId === t.id);
        const link = linkByTable.get(t.id);
        const pkg = link ? pkgById.get(link.packageId) : undefined;
        let status: 'LIBRE' | 'OCUPADO' | 'NO_VENTA' = 'NO_VENTA';
        if (mine.some((s) => s.status === 'OCUPADO')) status = 'OCUPADO';
        else if (pkg && mine.length === pkg.people && mine.every((s) => s.status === 'LIBRE')) status = 'LIBRE';
        return {
          id: t.id,
          sectorId: t.sectorId,
          label: t.label,
          x: t.x,
          y: t.y,
          status,
          seatIds: mine.map((s) => s.id),
          package: pkg ? { id: pkg.id, name: pkg.name, people: pkg.people, price: pkg.price, bottleOptions: pkg.bottleOptions } : null,
        };
      })
      .filter((m) => m.seatIds.length > 0);
  }

  // Árbol event → sectors → tiers (solo tiers de VENTA: las cortesías no se
  // muestran al público). La disponibilidad se DERIVA contando tickets
  // DISPONIBLE del tier; nunca se almacena.
  private async buildPublicEvent(eventRow: typeof event.$inferSelect) {
    const sectors = await this.db
      .select()
      .from(sector)
      .where(and(eq(sector.venueId, eventRow.venueId), eq(sector.sellable, true)));
    const tiers = await this.db.select().from(tier).where(eq(tier.eventId, eventRow.id));
    const { byTier } = await ticketCountsByTier(this.db, eventRow.id);
    // Tiers cuyos tickets llevan asiento: solo se compran eligiendo asientos en el mapa
    const seatedTierRows =
      eventRow.seatingMode === 'BUTACAS' || eventRow.seatingMode === 'MESAS_FIJAS'
        ? await this.db
            .selectDistinct({ tierId: ticket.tierId })
            .from(ticket)
            .where(and(eq(ticket.eventId, eventRow.id), sql`${ticket.seatId} IS NOT NULL`))
        : [];
    const seatedTiers = new Set(seatedTierRows.map((r) => r.tierId));
    const [venueRow] = await this.db
      .select({ name: venue.name, address: venue.address, mapsUrl: venue.mapsUrl, openingHours: venue.openingHours })
      .from(venue)
      .where(eq(venue.id, eventRow.venueId))
      .limit(1);
    const venuePhotos = await this.db
      .select({ id: venuePhoto.id, path: venuePhoto.path })
      .from(venuePhoto)
      .where(eq(venuePhoto.venueId, eventRow.venueId))
      .orderBy(asc(venuePhoto.position), asc(venuePhoto.createdAt));

    const now = new Date();
    const publicSectors = sectors
      .map((s) => ({
        id: s.id,
        name: s.name,
        capacity: s.capacity,
        tiers: tiers
          .filter((t) => t.sectorId === s.id && t.kind === 'VENTA')
          .map((t) => {
            const available = byTier.get(t.id)?.['DISPONIBLE'] ?? 0;
            const inWindow =
              (!t.startsAt || now >= t.startsAt) && (!t.endsAt || now < t.endsAt);
            return {
              id: t.id,
              name: t.name,
              price: t.price,
              startsAt: t.startsAt,
              endsAt: t.endsAt,
              isPaused: t.isPaused,
              available,
              // true = se compra eligiendo asientos en el mapa (GET /events/:id/seats), no por cantidad
              bySeat: seatedTiers.has(t.id),
              disponibleParaCompra: !t.isPaused && inWindow && available > 0,
            };
          }),
      }))
      .filter((s) => s.tiers.length > 0);

    // La comisión es un dato interno entre Rocktickets y el organizador: nunca sale al público
    const { commissionPct: _internal, ...publicFields } = eventRow;
    return {
      ...publicFields,
      imageUrl: eventRow.imagePath ? `/uploads/${eventRow.imagePath}` : null,
      venueName: venueRow?.name ?? null,
      // Ficha pública del local (sección "El lugar")
      venue: venueRow
        ? {
            name: venueRow.name,
            address: venueRow.address,
            mapsUrl: venueRow.mapsUrl,
            openingHours: venueRow.openingHours ?? [],
            photos: venuePhotos.map((p) => ({ id: p.id, url: `/uploads/${p.path}` })),
          }
        : null,
      sectors: publicSectors,
    };
  }

  // Inventario para el panel: por sector (aforo, generados, libres sin tier) y por tier
  // (precio, estado de venta y conteos). Todo se DERIVA contando tickets; nada se almacena.
  async getInventory(eventId: string, actor: AuthUser) {
    const ev = await this.getManagedEvent(eventId, actor);
    const sectors = await this.db
      .select()
      .from(sector)
      .where(and(eq(sector.venueId, ev.venueId), eq(sector.sellable, true)))
      .orderBy(sector.name);
    const tiers = await this.db.select().from(tier).where(eq(tier.eventId, eventId)).orderBy(tier.createdAt);
    const { byTier, unassigned } = await ticketCountsByTier(this.db, eventId);

    const bySector = await this.db
      .select({
        sectorId: ticket.sectorId,
        total: count(),
        // Sin tier y sin asiento: listos para asignar por cantidad
        libres: sql<number>`count(*) filter (where ${ticket.tierId} is null and ${ticket.status} = 'DISPONIBLE' and ${ticket.seatId} is null)::int`,
        // Asientos numerados del sector, y cuántos aún no tienen zona de precio (no se venden)
        seated: sql<number>`count(*) filter (where ${ticket.seatId} is not null)::int`,
        seatsLibres: sql<number>`count(*) filter (where ${ticket.tierId} is null and ${ticket.status} = 'DISPONIBLE' and ${ticket.seatId} is not null)::int`,
      })
      .from(ticket)
      .where(eq(ticket.eventId, eventId))
      .groupBy(ticket.sectorId);
    const sectorStats = new Map(bySector.map((r) => [r.sectorId, r]));
    const seatedByTier = new Map(
      (
        await this.db
          .select({ tierId: ticket.tierId, n: count() })
          .from(ticket)
          .where(and(eq(ticket.eventId, eventId), sql`${ticket.seatId} is not null`))
          .groupBy(ticket.tierId)
      ).map((r) => [r.tierId, Number(r.n)]),
    );

    // Tiers que maneja un paquete de mesas: su precio y su nombre vienen del paquete
    const packageTierIds = new Set(
      (await this.db.select({ tierId: eventTable.tierId }).from(eventTable).where(eq(eventTable.eventId, eventId))).map((r) => r.tierId),
    );

    const now = new Date();
    const sectorName = new Map(sectors.map((x) => [x.id, x.name]));

    return {
      eventId,
      status: ev.status,
      seatingMode: ev.seatingMode,
      tableValidUntil: ev.tableValidUntil,
      sinTier: unassigned,
      sectors: sectors.map((x) => ({
        id: x.id,
        name: x.name,
        capacity: x.capacity,
        generated: Number(sectorStats.get(x.id)?.total ?? 0),
        libres: Number(sectorStats.get(x.id)?.libres ?? 0), // listos para asignar a un tier
        seated: Number(sectorStats.get(x.id)?.seated ?? 0),
        seatsLibres: Number(sectorStats.get(x.id)?.seatsLibres ?? 0),
      })),
      tiers: tiers.map((t) => {
        const m = byTier.get(t.id) ?? {};
        const disponibles = m['DISPONIBLE'] ?? 0;
        const total = Object.values(m).reduce((a, b) => a + b, 0);
        let estado: 'PAUSADO' | 'SIN_TICKETS' | 'AGOTADO' | 'PROGRAMADO' | 'CERRADO' | 'ABIERTO';
        if (t.isPaused) estado = 'PAUSADO';
        else if (total === 0) estado = 'SIN_TICKETS';
        else if (t.startsAt && now < t.startsAt) estado = 'PROGRAMADO';
        else if (t.endsAt && now >= t.endsAt) estado = 'CERRADO';
        else if (disponibles === 0) estado = 'AGOTADO';
        else estado = 'ABIERTO';
        return {
          id: t.id,
          name: t.name,
          kind: t.kind,
          price: t.price,
          sectorId: t.sectorId,
          sectorName: sectorName.get(t.sectorId) ?? '',
          isPaused: t.isPaused,
          startsAt: t.startsAt,
          endsAt: t.endsAt,
          bySeat: (seatedByTier.get(t.id) ?? 0) > 0, // se reparte eligiendo asientos, no por cantidad
          packageManaged: packageTierIds.has(t.id),
          estado,
          tickets: {
            total,
            disponibles,
            reservados: m['RESERVADO'] ?? 0,
            vendidos: (m['VALIDO'] ?? 0) + (m['UTILIZADO'] ?? 0),
            ingresaron: m['UTILIZADO'] ?? 0,
            anulados: m['ANULADO'] ?? 0,
          },
        };
      }),
    };
  }

  // --- Alcance por organizador ---

  // Carga un evento SOLO si el actor puede administrarlo. Si es de otro organizador
  // responde "no encontrado" (no 403): no confirmamos que el evento existe.
  private async getManagedEvent(eventId: string, actor: AuthUser) {
    const [ev] = await this.db.select().from(event).where(eq(event.id, eventId)).limit(1);
    if (!ev || !canManageOrganizer(actor, ev.organizerId)) {
      throw new NotFoundException('Evento no encontrado');
    }
    return ev;
  }

  // Igual, partiendo de un tier (devuelve el tier y su evento)
  private async getManagedTier(tierId: string, actor: AuthUser) {
    const [row] = await this.db
      .select({ tier, ev: event })
      .from(tier)
      .innerJoin(event, eq(event.id, tier.eventId))
      .where(eq(tier.id, tierId))
      .limit(1);
    if (!row || !canManageOrganizer(actor, row.ev.organizerId)) {
      throw new NotFoundException('Tier no encontrado');
    }
    return row;
  }

  // Conteo de tickets por estado para un conjunto de eventos (una sola consulta).
  // Se separa lo que nació de una cortesía (courtesy_id) de lo que se vendió.
  private async ticketSummaries(eventIds: string[]) {
    const out = new Map<string, Record<string, number>>();
    if (eventIds.length === 0) return out;
    const rows = await this.db
      .select({
        eventId: ticket.eventId,
        status: ticket.status,
        isCourtesy: sql<boolean>`${ticket.courtesyId} is not null`,
        n: count(),
      })
      .from(ticket)
      .where(inArray(ticket.eventId, eventIds))
      .groupBy(ticket.eventId, ticket.status, sql`${ticket.courtesyId} is not null`);
    for (const r of rows) {
      const cur = out.get(r.eventId) ?? {};
      const key = r.isCourtesy ? `C:${r.status}` : r.status;
      cur[key] = Number(r.n);
      out.set(r.eventId, cur);
    }
    return out;
  }

  private adminEventView(
    e: typeof event.$inferSelect,
    venueName: string,
    organizerName: string,
    counts: Record<string, number> | undefined,
    actor: AuthUser,
  ) {
    const c = counts ?? {};
    const n = (k: string) => c[k] ?? 0;
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    return {
      ...e, // incluye commissionPct: acuerdo entre Rocktickets y el organizador, nunca público
      venueName,
      organizerName,
      imageUrl: e.imagePath ? `/uploads/${e.imagePath}` : null,
      tickets: {
        total,
        disponible: n('DISPONIBLE'),
        reservado: n('RESERVADO'),
        vendidos: n('VALIDO') + n('UTILIZADO'), // pagados (hayan entrado o no)
        cortesias: n('C:VALIDO') + n('C:UTILIZADO'),
        ingresaron: n('UTILIZADO') + n('C:UTILIZADO'),
        anulados: n('ANULADO') + n('C:ANULADO'),
      },
      canEditVenue: total === 0,
      scope: actor.role,
    };
  }

  // Listado administrativo: el superadmin ve todos; el organizador, solo los suyos
  async listManagedEvents(actor: AuthUser) {
    const base = this.db
      .select({ e: event, venueName: venue.name, organizerName: organizer.name })
      .from(event)
      .innerJoin(venue, eq(venue.id, event.venueId))
      .innerJoin(organizer, eq(organizer.id, event.organizerId));
    const rows =
      actor.role === 'SUPERADMIN'
        ? await base.orderBy(event.startsAt)
        : await base.where(eq(event.organizerId, actor.organizerId ?? '')).orderBy(event.startsAt);
    const summaries = await this.ticketSummaries(rows.map((r) => r.e.id));
    return rows.map((r) =>
      this.adminEventView(r.e, r.venueName, r.organizerName, summaries.get(r.e.id), actor),
    );
  }

  async getManagedEventDetail(eventId: string, actor: AuthUser) {
    const ev = await this.getManagedEvent(eventId, actor);
    const [v] = await this.db.select().from(venue).where(eq(venue.id, ev.venueId)).limit(1);
    const [o] = await this.db.select().from(organizer).where(eq(organizer.id, ev.organizerId)).limit(1);
    const summaries = await this.ticketSummaries([ev.id]);
    return this.adminEventView(ev, v.name, o.name, summaries.get(ev.id), actor);
  }

  // Locales con sus sectores, para el formulario de evento (los venues son de la plataforma)
  async listVenuesWithSectors() {
    const venues = await this.db.select().from(venue).orderBy(venue.name);
    const sectors = await this.db.select().from(sector).where(eq(sector.sellable, true)).orderBy(sector.name);
    return venues.map((v) => {
      const own = sectors.filter((s) => s.venueId === v.id);
      return {
        id: v.id,
        name: v.name,
        capacity: own.reduce((a, s) => a + s.capacity, 0),
        sectors: own.map((s) => ({ id: s.id, name: s.name, capacity: s.capacity })),
      };
    });
  }

  async listCourtesies(eventId: string, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    const rows = await this.db
      .select({ c: courtesy, issuedByName: user.name })
      .from(courtesy)
      .innerJoin(user, eq(user.id, courtesy.issuedBy))
      .where(eq(courtesy.eventId, eventId))
      .orderBy(desc(courtesy.createdAt));
    if (rows.length === 0) return [];

    // Cuántos tickets salieron de cada cortesía y de qué tier
    const perCourtesy = await this.db
      .select({ courtesyId: ticket.courtesyId, tierName: tier.name, n: count(), used: sql<number>`count(*) filter (where ${ticket.status} = 'UTILIZADO')::int` })
      .from(ticket)
      .innerJoin(tier, eq(tier.id, ticket.tierId))
      .where(inArray(ticket.courtesyId, rows.map((r) => r.c.id)))
      .groupBy(ticket.courtesyId, tier.name);
    const info = new Map(perCourtesy.map((r) => [r.courtesyId, r]));

    return rows.map((r) => ({
      id: r.c.id,
      recipientName: r.c.recipientName,
      recipientEmail: r.c.recipientEmail,
      reason: r.c.reason,
      accessToken: r.c.accessToken,
      createdAt: r.c.createdAt,
      issuedByName: r.issuedByName,
      quantity: Number(info.get(r.c.id)?.n ?? 0),
      used: Number(info.get(r.c.id)?.used ?? 0),
      tierName: info.get(r.c.id)?.tierName ?? null,
    }));
  }

  // --- Escritura administrativa ---

  async createEvent(dto: CreateEventDto, actor: AuthUser) {
    // Un organizador solo crea eventos para sí mismo; el superadmin elige para quién.
    let organizerId: string;
    if (actor.role === 'ORGANIZADOR') {
      if (dto.organizerId && dto.organizerId !== actor.organizerId) {
        throw new ForbiddenException('No puedes crear eventos para otro organizador');
      }
      organizerId = actor.organizerId!;
    } else {
      if (!dto.organizerId) throw new BadRequestException('Indica el organizador (organizerId)');
      organizerId = dto.organizerId;
    }

    const [org] = await this.db.select().from(organizer).where(eq(organizer.id, organizerId)).limit(1);
    if (!org) throw new NotFoundException('Organizador no encontrado');
    if (!org.isActive) throw new BadRequestException('El organizador está desactivado');

    const [venueRow] = await this.db.select().from(venue).where(eq(venue.id, dto.venueId)).limit(1);
    if (!venueRow) throw new NotFoundException('Venue no encontrado');

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('El fin debe ser posterior al inicio');

    const [created] = await this.db
      .insert(event)
      .values({
        venueId: dto.venueId,
        organizerId,
        // Copia de la comisión por defecto del organizador (puede ser NULL = sin definir)
        commissionPct: org.defaultCommissionPct,
        name: dto.name,
        description: dto.description,
        category: dto.category ?? 'CONCIERTO',
        startsAt,
        endsAt,
      })
      .returning();

    await this.auditLog.log(actor.sub, 'EVENT_CREATED', 'Event', created.id, {
      name: created.name,
      venueId: created.venueId,
      organizerId,
    });

    // Aviso (no bloqueo): otro evento activo en el mismo local con horario cruzado.
    // Al organizador solo se le dice cuántos; los nombres son de otros organizadores.
    const overlapping = await this.db
      .select({ id: event.id, name: event.name })
      .from(event)
      .where(
        and(
          eq(event.venueId, dto.venueId),
          eq(event.status, 'ACTIVO'),
          lt(event.startsAt, endsAt),
          gt(event.endsAt, startsAt),
        ),
      );
    const others = overlapping.filter((e) => e.id !== created.id);
    const warnings =
      others.length > 0
        ? [
            {
              type: 'SOLAPAMIENTO_VENUE',
              message: `Hay ${others.length} evento(s) activo(s) en este local con horario que se cruza.`,
              events: actor.role === 'SUPERADMIN' ? others : undefined,
            },
          ]
        : [];

    return { ...created, warnings };
  }

  async updateEvent(eventId: string, dto: UpdateEventDto, actor: AuthUser) {
    const current = await this.getManagedEvent(eventId, actor);
    if (current.status === 'CANCELADO') throw new BadRequestException('Un evento cancelado no se puede editar');

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : current.endsAt;
    if (endsAt <= startsAt) throw new BadRequestException('El fin debe ser posterior al inicio');

    if (dto.venueId && dto.venueId !== current.venueId) {
      // Los sectores, el aforo y los tickets dependen del local: con tickets generados no se puede mover
      const [{ n }] = await this.db.select({ n: count() }).from(ticket).where(eq(ticket.eventId, eventId));
      if (Number(n) > 0) {
        throw new ConflictException('El evento ya tiene tickets generados: no se puede cambiar de local');
      }
      const [venueRow] = await this.db.select().from(venue).where(eq(venue.id, dto.venueId)).limit(1);
      if (!venueRow) throw new NotFoundException('Venue no encontrado');
    }

    const changes: Partial<typeof event.$inferInsert> = { startsAt, endsAt };
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.description !== undefined) changes.description = dto.description;
    if (dto.category !== undefined) changes.category = dto.category;
    if (dto.venueId !== undefined) changes.venueId = dto.venueId;

    const [updated] = await this.db.update(event).set(changes).where(eq(event.id, eventId)).returning();
    await this.auditLog.log(actor.sub, 'EVENT_UPDATED', 'Event', eventId, {
      fields: Object.keys(dto),
    });
    return updated;
  }

  async setEventImage(eventId: string, imagePath: string, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    const [updated] = await this.db
      .update(event)
      .set({ imagePath })
      .where(eq(event.id, eventId))
      .returning();
    await this.auditLog.log(actor.sub, 'EVENT_IMAGE_SET', 'Event', eventId, { imagePath });
    return updated;
  }

  async cancelEvent(eventId: string, actor: AuthUser) {
    const eventRow = await this.getManagedEvent(eventId, actor);
    if (eventRow.status === 'CANCELADO') throw new BadRequestException('El evento ya está cancelado');

    const [updated] = await this.db
      .update(event)
      .set({ status: 'CANCELADO' })
      .where(eq(event.id, eventId))
      .returning();

    // Cancelación manual: no toca Orders/Payments/Tickets automáticamente.
    await this.auditLog.log(actor.sub, 'EVENT_CANCELLED', 'Event', eventId, {
      previousStatus: eventRow.status,
    });
    return updated;
  }

  async generateTickets(eventId: string, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    const result = await generateTicketsForEvent(this.db, eventId);
    await this.auditLog.log(actor.sub, 'TICKETS_GENERATED', 'Event', eventId, {
      created: result.created,
      removed: result.removed,
    });
    return result;
  }

  async changeSeatingMode(eventId: string, dto: SeatingModeDto, actor: AuthUser) {
    const ev = await this.getManagedEvent(eventId, actor);
    const result = await setSeatingMode(this.db, eventId, dto.seatingMode);
    await this.auditLog.log(actor.sub, 'EVENT_SEATING_MODE_CHANGED', 'Event', eventId, {
      from: ev.seatingMode,
      to: dto.seatingMode,
      deletedTickets: result.deletedTickets,
    });
    return result;
  }

  async listTablePackages(eventId: string, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    return listPackages(this.db, eventId);
  }

  async createTablePackage(eventId: string, dto: TablePackageDto, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    const row = await createPackage(this.db, eventId, dto);
    await this.auditLog.log(actor.sub, 'TABLE_PACKAGE_CREATED', 'Event', eventId, { packageId: row.id, name: row.name });
    return row;
  }

  private async getManagedPackage(packageId: string, actor: AuthUser) {
    const [p] = await this.db.select().from(tablePackage).where(eq(tablePackage.id, packageId)).limit(1);
    if (!p) throw new NotFoundException('Paquete no encontrado');
    await this.getManagedEvent(p.eventId, actor);
    return p;
  }

  async updateTablePackage(packageId: string, dto: Partial<TablePackageDto>, actor: AuthUser) {
    await this.getManagedPackage(packageId, actor);
    const row = await updatePackage(this.db, packageId, dto);
    await this.auditLog.log(actor.sub, 'TABLE_PACKAGE_UPDATED', 'Event', row!.eventId, { packageId });
    return row;
  }

  async deleteTablePackage(packageId: string, actor: AuthUser) {
    const p = await this.getManagedPackage(packageId, actor);
    const res = await deletePackage(this.db, packageId);
    await this.auditLog.log(actor.sub, 'TABLE_PACKAGE_DELETED', 'Event', p.eventId, { packageId, name: p.name });
    return res;
  }

  async assignTablePackage(eventId: string, dto: AssignTablePackageDto, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    const res = await assignPackageToTables(this.db, eventId, dto.packageId ?? null, dto.tableIds);
    await this.auditLog.log(actor.sub, 'TABLE_PACKAGE_ASSIGNED', 'Event', eventId, {
      packageId: dto.packageId ?? null,
      tables: dto.tableIds.length,
    });
    return res;
  }

  // Público: ¿hay mesa para N personas en este sector? (no dice cuál)
  tableAvailability(eventId: string, sectorId: string, people: number) {
    return flexAvailability(this.db, eventId, sectorId, people);
  }

  async flexTables(eventId: string, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    return listFlexTables(this.db, eventId);
  }

  async blockFlexTables(eventId: string, tableIds: string[], blocked: boolean, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    const res = await setTableBlocks(this.db, eventId, tableIds, blocked);
    await this.auditLog.log(actor.sub, 'FLEX_TABLES_BLOCKED', 'Event', eventId, { tables: tableIds.length, blocked });
    return res;
  }

  async changeTableValidUntil(eventId: string, value: string, actor: AuthUser) {
    await this.getManagedEvent(eventId, actor);
    return setTableValidUntil(this.db, eventId, value);
  }

  async assignSeats(tierId: string, dto: AssignSeatsDto, actor: AuthUser) {
    await this.getManagedTier(tierId, actor);
    const result = await assignSeatsToTier(this.db, tierId, dto.seatIds, dto.release ?? false);
    await this.auditLog.log(actor.sub, 'TIER_SEATS_ASSIGNED', 'Tier', tierId, {
      seats: dto.seatIds.length,
      release: dto.release ?? false,
    });
    return result;
  }

  async createTier(eventId: string, dto: CreateTierDto, actor: AuthUser) {
    const eventRow = await this.getManagedEvent(eventId, actor);

    const [sectorRow] = await this.db.select().from(sector).where(eq(sector.id, dto.sectorId)).limit(1);
    if (!sectorRow) throw new NotFoundException('Sector no encontrado');
    // El sector debe ser del venue del evento (no se puede vender un sector ajeno)
    if (sectorRow.venueId !== eventRow.venueId) {
      throw new BadRequestException('El sector no pertenece al venue de este evento');
    }
    if (!sectorRow.sellable) {
      throw new BadRequestException('Este sector no es vendible: no admite tiers');
    }

    const kind = dto.kind ?? 'VENTA';
    const [created] = await this.db
      .insert(tier)
      .values({
        eventId,
        sectorId: dto.sectorId,
        name: dto.name,
        kind,
        price: (kind === 'CORTESIA' ? 0 : dto.price).toString(),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      })
      .returning();

    await this.auditLog.log(actor.sub, 'TIER_CREATED', 'Tier', created.id, {
      eventId,
      sectorId: dto.sectorId,
      name: created.name,
      kind,
      price: created.price,
    });
    return created;
  }

  async assignTickets(tierId: string, quantity: number, actor: AuthUser) {
    await this.getManagedTier(tierId, actor);
    const result = await assignTicketsToTier(this.db, tierId, quantity);
    await this.auditLog.log(actor.sub, 'TIER_TICKETS_ASSIGNED', 'Tier', tierId, { quantity });
    return result;
  }

  async issueCourtesy(tierId: string, dto: IssueCourtesyDto, actor: AuthUser) {
    await this.getManagedTier(tierId, actor);
    const result = await issueCourtesy(this.db, tierId, dto, actor.sub);
    await this.auditLog.log(actor.sub, 'COURTESY_ISSUED', 'Courtesy', result.courtesyId, {
      tierId,
      quantity: dto.quantity,
      recipientEmail: dto.recipientEmail,
    });
    return result;
  }

  // Edita lo comercial del tier (nombre, precio, ventana). Los pedidos ya creados
  // conservan el precio al que se reservaron (order_item.unit_price es un snapshot).
  async updateTier(tierId: string, dto: UpdateTierDto, actor: AuthUser) {
    const { tier: current, ev } = await this.getManagedTier(tierId, actor);
    if (ev.status === 'CANCELADO') throw new BadRequestException('Un evento cancelado no se puede editar');
    if (dto.name !== undefined || dto.price !== undefined) {
      const [managed] = await this.db.select({ t: eventTable.tierId }).from(eventTable).where(eq(eventTable.tierId, tierId)).limit(1);
      if (managed) {
        throw new ConflictException('Este tier lo maneja un paquete de mesas: cambia su nombre o precio desde el paquete');
      }
    }

    const changes: Partial<typeof tier.$inferInsert> = {};
    if (dto.name !== undefined) changes.name = dto.name.trim();
    if (dto.price !== undefined) {
      if (current.kind === 'CORTESIA' && dto.price !== 0) {
        throw new BadRequestException('Una cortesía es gratis: no tiene precio');
      }
      changes.price = dto.price.toFixed(2);
    }
    if (dto.startsAt !== undefined) changes.startsAt = dto.startsAt === null ? null : new Date(dto.startsAt);
    if (dto.endsAt !== undefined) changes.endsAt = dto.endsAt === null ? null : new Date(dto.endsAt);

    const from = 'startsAt' in changes ? changes.startsAt : current.startsAt;
    const to = 'endsAt' in changes ? changes.endsAt : current.endsAt;
    if (from && to && from >= to) {
      throw new BadRequestException('El cierre de la venta debe ser posterior al inicio');
    }
    if (Object.keys(changes).length === 0) return current;

    try {
      const [updated] = await this.db.update(tier).set(changes).where(eq(tier.id, tierId)).returning();
      await this.auditLog.log(actor.sub, 'TIER_UPDATED', 'Tier', tierId, {
        before: { name: current.name, price: current.price, startsAt: current.startsAt, endsAt: current.endsAt },
        after: { name: updated.name, price: updated.price, startsAt: updated.startsAt, endsAt: updated.endsAt },
      });
      return updated;
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e?.code === '23505' || e?.cause?.code === '23505') {
        throw new ConflictException('Ya hay un tier con ese nombre en este sector');
      }
      throw err;
    }
  }

  async setTierPaused(tierId: string, isPaused: boolean, actor: AuthUser) {
    await this.getManagedTier(tierId, actor);
    const [updated] = await this.db
      .update(tier)
      .set({ isPaused })
      .where(eq(tier.id, tierId))
      .returning();
    await this.auditLog.log(actor.sub, isPaused ? 'TIER_PAUSED' : 'TIER_RESUMED', 'Tier', tierId);
    return updated;
  }
}
