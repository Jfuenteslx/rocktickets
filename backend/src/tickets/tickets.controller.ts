import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { TicketsService } from './tickets.service.js';
import { ScanTicketDto, SyncScansDto } from './dto/scan-ticket.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequierePermiso } from '../auth/decorators/require-permission.decorator.js';
import type { AuthUser } from '../auth/access.js';

// JwtAuthGuard adjunta `user` al request, pero el tipo base de Express no lo
// declara (eso lo hace @types/passport normalmente) — lo extendemos acá.
type RequestWithUser = Request & { user: AuthUser };

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  // El staff escanea en ráfagas en la puerta: límite holgado pero acotado
  @Post('scan')
  @Throttle({ default: { limit: 180, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('access:scan')
  scan(@Body() dto: ScanTicketDto, @Req() req: RequestWithUser) {
    return this.ticketsService.scanTicketAndNotify(dto.ticketId, req.user, dto.deviceId, dto.eventId, dto.manual === true ? 'MANUAL' : 'QR');
  }

  // Admisiones guardadas en el celular mientras no había red
  @Post('scan/sync')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard, PermissionGuard)
  @RequierePermiso('access:scan')
  async sync(@Body() dto: SyncScansDto, @Req() req: RequestWithUser) {
    const results = await this.ticketsService.syncOfflineScans(req.user, dto.deviceId, dto.eventId, dto.items);
    return { results };
  }
}
