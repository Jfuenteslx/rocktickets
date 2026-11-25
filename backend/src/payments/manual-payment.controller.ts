import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequierePermiso } from '../auth/decorators/require-permission.decorator.js';
import type { AuthUser } from '../auth/access.js';
import { MANUAL_STATUSES, ManualPaymentService, type ManualStatus } from './manual-payment.service.js';
import { RejectPaymentDto } from './dto/manual-payment.dto.js';

type RequestWithUser = Request & { user: AuthUser };

// Bandeja de pagos avisados por los compradores. SOLO superadmin (payments:review): aquí están
// los datos personales de quien pagó y la decisión de entregar o no las entradas.
@Controller('payments/manual')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ManualPaymentController {
  constructor(private readonly manual: ManualPaymentService) {}

  @Get('count')
  @RequierePermiso('payments:review')
  count() {
    return this.manual.count();
  }

  @Get()
  @RequierePermiso('payments:review')
  list(@Query('status') status?: string) {
    const s = (status || 'EN_REVISION') as ManualStatus;
    if (!(MANUAL_STATUSES as readonly string[]).includes(s)) throw new BadRequestException('Estado no válido');
    return this.manual.list(s);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequierePermiso('payments:review')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.manual.approve(id, req.user.sub);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequierePermiso('payments:review')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectPaymentDto, @Req() req: RequestWithUser) {
    return this.manual.reject(id, req.user.sub, dto.reason);
  }
}
