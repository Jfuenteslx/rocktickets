import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OrganizersService } from './organizers.service.js';
import { SetActiveDto } from '../staff/dto/staff.dto.js';
import { CreateOrganizerAdminDto, CreateOrganizerDto, UpdateOrganizerDto } from './dto/organizer.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequierePermiso } from '../auth/decorators/require-permission.decorator.js';
import type { AuthUser } from '../auth/access.js';

type RequestWithUser = Request & { user: AuthUser };

// Todo este controller es solo del superadmin (organizers:manage)
@Controller('organizers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class OrganizersController {
  constructor(private readonly organizers: OrganizersService) {}

  @Get()
  @RequierePermiso('organizers:manage')
  list() {
    return this.organizers.list();
  }

  @Post()
  @RequierePermiso('organizers:manage')
  create(@Body() dto: CreateOrganizerDto, @Req() req: RequestWithUser) {
    return this.organizers.create(dto, req.user);
  }

  @Patch(':id')
  @RequierePermiso('organizers:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizerDto,
    @Req() req: RequestWithUser,
  ) {
    return this.organizers.update(id, dto, req.user);
  }

  @Get(':id/admins')
  @RequierePermiso('organizers:manage')
  listAdmins(@Param('id', ParseUUIDPipe) id: string) {
    return this.organizers.listAdmins(id);
  }

  @Patch(':id/admins/:userId/active')
  @RequierePermiso('organizers:manage')
  setAdminActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetActiveDto,
    @Req() req: RequestWithUser,
  ) {
    return this.organizers.setAdminActive(id, userId, dto.isActive, req.user);
  }

  @Post(':id/admins')
  @RequierePermiso('organizers:manage')
  createAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOrganizerAdminDto,
    @Req() req: RequestWithUser,
  ) {
    return this.organizers.createAdmin(id, dto, req.user);
  }
}
