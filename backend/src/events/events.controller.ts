import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { EventsService } from './events.service.js';
import { CreateEventDto } from './dto/create-event.dto.js';
import { UpdateEventDto } from './dto/update-event.dto.js';
import { CreateTierDto } from './dto/create-tier.dto.js';
import { UpdateTierDto } from './dto/update-tier.dto.js';
import { SetTierPausedDto } from './dto/set-tier-paused.dto.js';
import { AssignTicketsDto } from './dto/assign-tickets.dto.js';
import { IssueCourtesyDto } from './dto/issue-courtesy.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequierePermiso } from '../auth/decorators/require-permission.decorator.js';
import type { AuthUser } from '../auth/access.js';

type RequestWithUser = Request & { user: AuthUser };

export const UPLOADS_DIR = join(process.cwd(), 'uploads');
const EVENT_IMAGES_DIR = join(UPLOADS_DIR, 'events');
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // --- Público, sin auth ---

  @Get('events')
  listEvents() {
    return this.eventsService.listActiveEvents();
  }

  @Get('events/:id')
  getEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.getEvent(id);
  }

  // --- events:manage ---

  // Listado administrativo (con alcance por organizador). No usa /admin/... porque
  // esa ruta es del panel AdminJS.
  @Get('manage/events')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('events:manage')
  listManagedEvents(@Req() req: RequestWithUser) {
    return this.eventsService.listManagedEvents(req.user);
  }

  @Get('manage/events/:id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('events:manage')
  getManagedEvent(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.eventsService.getManagedEventDetail(id, req.user);
  }

  // Locales (compartidos) con sus sectores, para elegir al crear un evento
  @Get('manage/venues')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('events:manage')
  listVenues() {
    return this.eventsService.listVenuesWithSectors();
  }

  @Get('events/:id/courtesies')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('courtesies:issue')
  listCourtesies(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.eventsService.listCourtesies(id, req.user);
  }

  @Patch('events/:id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('events:manage')
  updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: RequestWithUser,
  ) {
    return this.eventsService.updateEvent(id, dto, req.user);
  }

  @Post('events')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('events:manage')
  createEvent(@Body() dto: CreateEventDto, @Req() req: RequestWithUser) {
    return this.eventsService.createEvent(dto, req.user);
  }

  @Post('events/:id/image')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('events:manage')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          mkdirSync(EVENT_IMAGES_DIR, { recursive: true });
          cb(null, EVENT_IMAGES_DIR);
        },
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
      }),
      fileFilter: (_req, file, cb) =>
        ALLOWED_IMAGE_TYPES.includes(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException('Solo se aceptan imágenes JPG, PNG o WEBP'), false),
    }),
  )
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { filename: string } | undefined,
    @Req() req: RequestWithUser,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo "image"');
    try {
      return await this.eventsService.setEventImage(id, `events/${file.filename}`, req.user);
    } catch (err) {
      // multer ya guardó el archivo antes de verificar permisos: si se rechaza, no dejamos huérfanos
      await rm(join(EVENT_IMAGES_DIR, file.filename), { force: true });
      throw err;
    }
  }

  @Patch('events/:id/cancel')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('events:manage')
  cancelEvent(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.eventsService.cancelEvent(id, req.user);
  }

  @Post('events/:id/generate-tickets')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('events:manage')
  generateTickets(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.eventsService.generateTickets(id, req.user);
  }

  @Get('events/:id/inventory')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('events:manage')
  getInventory(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.eventsService.getInventory(id, req.user);
  }

  // --- tiers:manage ---

  @Post('events/:eventId/tiers')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('tiers:manage')
  createTier(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateTierDto,
    @Req() req: RequestWithUser,
  ) {
    return this.eventsService.createTier(eventId, dto, req.user);
  }

  @Patch('tiers/:id')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('tiers:manage')
  updateTier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTierDto,
    @Req() req: RequestWithUser,
  ) {
    return this.eventsService.updateTier(id, dto, req.user);
  }

  @Post('tiers/:id/assign')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('tiers:manage')
  assignTickets(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketsDto,
    @Req() req: RequestWithUser,
  ) {
    return this.eventsService.assignTickets(id, dto.quantity, req.user);
  }

  @Patch('tiers/:id/paused')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('tiers:manage')
  setTierPaused(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTierPausedDto,
    @Req() req: RequestWithUser,
  ) {
    return this.eventsService.setTierPaused(id, dto.isPaused, req.user);
  }

  // --- courtesies:issue (superadmin, u organizador sobre sus propios eventos) ---

  @Post('tiers/:id/courtesies')
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('courtesies:issue')
  issueCourtesy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: IssueCourtesyDto,
    @Req() req: RequestWithUser,
  ) {
    return this.eventsService.issueCourtesy(id, dto, req.user);
  }
}
