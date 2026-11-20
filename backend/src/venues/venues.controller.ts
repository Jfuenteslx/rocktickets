import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import { VenuesService } from './venues.service.js';
import { VenueLayoutService } from './venue-layout.service.js';
import { VenueSeatingService } from './venue-seating.service.js';
import { CreateSectorDto, CreateVenueDto, ReorderPhotosDto, UpdateSectorDto, UpdateVenueDto } from './dto/venue.dto.js';
import { VENUE_ALLOWED_IMAGE_TYPES, VENUE_PHOTOS_DIR } from './venue-profile.constants.js';
import { SaveLayoutDto } from './dto/layout.dto.js';
import { SaveSeatingDto } from './dto/seating.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequierePermiso } from '../auth/decorators/require-permission.decorator.js';
import type { AuthUser } from '../auth/access.js';

type RequestWithUser = Request & { user: AuthUser };

// Solo superadmin (venues:manage). OJO: PermissionGuard lee el permiso del HANDLER, no de la clase,
// por eso el decorador va en cada endpoint. El listado lo da GET /manage/venues.
@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VenuesController {
  constructor(
    private readonly venues: VenuesService,
    private readonly layouts: VenueLayoutService,
    private readonly seating: VenueSeatingService,
  ) {}

  @Post('venues')
  @RequierePermiso('venues:manage')
  create(@Body() dto: CreateVenueDto, @Req() req: RequestWithUser) {
    return this.venues.create(dto, req.user);
  }

  @Patch('venues/:id')
  @RequierePermiso('venues:manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVenueDto, @Req() req: RequestWithUser) {
    return this.venues.update(id, dto, req.user);
  }

  // Ficha del local: datos, horarios y fotos
  @Get('venues/:id/profile')
  @RequierePermiso('venues:manage')
  getProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.venues.getProfile(id);
  }

  @Post('venues/:id/photos')
  @RequierePermiso('venues:manage')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 5 * 1024 * 1024 },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          mkdirSync(VENUE_PHOTOS_DIR, { recursive: true });
          cb(null, VENUE_PHOTOS_DIR);
        },
        filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
      }),
      fileFilter: (_req, file, cb) =>
        VENUE_ALLOWED_IMAGE_TYPES.includes(file.mimetype)
          ? cb(null, true)
          : cb(new BadRequestException('Solo se aceptan imágenes JPG, PNG o WEBP'), false),
    }),
  )
  async addPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { filename: string } | undefined,
    @Req() req: RequestWithUser,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo "image"');
    try {
      return await this.venues.addPhoto(id, file.filename, req.user);
    } catch (err) {
      // multer ya guardó el archivo: si se rechaza (límite de fotos, local inexistente), no dejamos huérfanos
      await rm(join(VENUE_PHOTOS_DIR, file.filename), { force: true });
      throw err;
    }
  }

  @Put('venues/:id/photos/order')
  @RequierePermiso('venues:manage')
  reorderPhotos(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderPhotosDto, @Req() req: RequestWithUser) {
    return this.venues.reorderPhotos(id, dto.photoIds, req.user);
  }

  @Delete('venues/:id/photos/:photoId')
  @RequierePermiso('venues:manage')
  deletePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.venues.deletePhoto(id, photoId, req.user);
  }

  // Plano del local (creador de venues): niveles, sectores y elementos de referencia
  @Get('venues/:id/layout')
  @RequierePermiso('venues:manage')
  getLayout(@Param('id', ParseUUIDPipe) id: string) {
    return this.layouts.getLayout(id);
  }

  @Put('venues/:id/layout')
  @RequierePermiso('venues:manage')
  saveLayout(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveLayoutDto, @Req() req: RequestWithUser) {
    return this.layouts.saveLayout(id, dto, req.user);
  }

  // Mesas y asientos de un sector (fase 2 del creador de venues)
  @Get('venues/:id/sectors/:sectorId/seating')
  @RequierePermiso('venues:manage')
  getSeating(@Param('id', ParseUUIDPipe) id: string, @Param('sectorId', ParseUUIDPipe) sectorId: string) {
    return this.seating.getSeating(id, sectorId);
  }

  @Put('venues/:id/sectors/:sectorId/seating')
  @RequierePermiso('venues:manage')
  saveSeating(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectorId', ParseUUIDPipe) sectorId: string,
    @Body() dto: SaveSeatingDto,
    @Req() req: RequestWithUser,
  ) {
    return this.seating.saveSeating(id, sectorId, dto, req.user);
  }

  @Post('venues/:id/sectors')
  @RequierePermiso('venues:manage')
  createSector(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSectorDto, @Req() req: RequestWithUser) {
    return this.venues.createSector(id, dto, req.user);
  }

  @Patch('sectors/:id')
  @RequierePermiso('venues:manage')
  updateSector(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectorDto, @Req() req: RequestWithUser) {
    return this.venues.updateSector(id, dto, req.user);
  }
}
