import { Body, Controller, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { VenuesService } from './venues.service.js';
import { CreateSectorDto, CreateVenueDto, UpdateSectorDto, UpdateVenueDto } from './dto/venue.dto.js';
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
  constructor(private readonly venues: VenuesService) {}

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
