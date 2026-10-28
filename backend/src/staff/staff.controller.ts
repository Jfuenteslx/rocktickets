import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { StaffService } from './staff.service.js';
import { CreateStaffDto, SetActiveDto, SetApprovalDto } from './dto/staff.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequierePermiso } from '../auth/decorators/require-permission.decorator.js';
import type { AuthUser } from '../auth/access.js';

type RequestWithUser = Request & { user: AuthUser };

@Controller('staff')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequierePermiso('staff:manage')
  list(@Req() req: RequestWithUser, @Query('organizerId', new ParseUUIDPipe({ optional: true })) organizerId?: string) {
    return this.staff.list(req.user, organizerId);
  }

  @Post()
  @RequierePermiso('staff:manage')
  create(@Body() dto: CreateStaffDto, @Req() req: RequestWithUser) {
    return this.staff.create(dto, req.user);
  }

  // Solo el superadmin aprueba/rechaza al personal de las organizaciones
  @Patch(':id/approval')
  @RequierePermiso('staff:approve')
  setApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetApprovalDto,
    @Req() req: RequestWithUser,
  ) {
    return this.staff.setApproval(id, dto.status, req.user);
  }

  @Patch(':id/active')
  @RequierePermiso('staff:manage')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
    @Req() req: RequestWithUser,
  ) {
    return this.staff.setActive(id, dto.isActive, req.user);
  }
}
