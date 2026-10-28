import {
  BadRequestException, Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { DoorService } from './door.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequierePermiso } from '../auth/decorators/require-permission.decorator.js';
import type { AuthUser } from '../auth/access.js';

type RequestWithUser = Request & { user: AuthUser };

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DoorController {
  constructor(private readonly door: DoorService) {}

  // --- Panel: asignar personal a un evento (superadmin u organizador dueño) ---

  @Get('events/:id/door')
  @RequierePermiso('staff:manage')
  overview(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.door.overview(id, req.user);
  }

  @Put('events/:id/door/:userId')
  @RequierePermiso('staff:manage')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.door.assign(id, userId, req.user);
  }

  @Delete('events/:id/door/:userId')
  @RequierePermiso('staff:manage')
  unassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.door.unassign(id, userId, req.user);
  }

  // --- App de puerta ---

  @Get('access/events')
  @RequierePermiso('access:read')
  myEvents(@Req() req: RequestWithUser) {
    return this.door.myEvents(req.user);
  }

  @Get('access/events/:id')
  @RequierePermiso('access:read')
  myEvent(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.door.myEvent(id, req.user);
  }

  @Get('access/events/:id/history')
  @RequierePermiso('access:read')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limitRaw: string | undefined,
    @Req() req: RequestWithUser,
  ) {
    const limit = limitRaw === undefined ? 50 : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1) throw new BadRequestException('limit debe ser un entero positivo');
    return this.door.myHistory(req.user, id, Math.min(limit, 200));
  }

  @Get('access/events/:id/search')
  @RequierePermiso('access:read')
  search(@Param('id', ParseUUIDPipe) id: string, @Query('q') q: string | undefined, @Req() req: RequestWithUser) {
    return this.door.search(req.user, id, typeof q === 'string' ? q : '');
  }

  @Get('access/events/:id/manifest')
  @RequierePermiso('access:read')
  manifest(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.door.manifest(req.user, id);
  }
}
