import { BadRequestException, Controller, Get, Header, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SalesService, ORDER_STATUSES, type OrderStatus } from './sales.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionGuard } from '../auth/guards/permission.guard.js';
import { RequierePermiso } from '../auth/decorators/require-permission.decorator.js';
import type { AuthUser } from '../auth/access.js';

type RequestWithUser = Request & { user: AuthUser };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Los valores numéricos del query llegan como texto: se validan a mano (la conversión
// implícita del ValidationPipe convertiría basura en NaN antes de llegar aquí).
function intParam(raw: string | undefined, name: string, def: number, min: number, max: number): number {
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) throw new BadRequestException(`${name} no es válido`);
  return Math.min(n, max);
}
function statusParam(raw: string | undefined): OrderStatus | undefined {
  if (raw === undefined || raw === '' || raw === 'TODAS') return undefined;
  if (!(ORDER_STATUSES as readonly string[]).includes(raw)) throw new BadRequestException('Estado no válido');
  return raw as OrderStatus;
}

// Ventas y órdenes. Cada handler lleva su @RequierePermiso (el guard solo lee el del handler).
// El ALCANCE (solo lo de mi organizador) lo aplica el servicio.
@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('sales/summary')
  @RequierePermiso('orders:read')
  summary(@Query('organizerId') organizerId: string | undefined, @Req() req: RequestWithUser) {
    if (organizerId !== undefined && !UUID.test(organizerId)) throw new BadRequestException('organizerId no es válido');
    return this.sales.summary(req.user, organizerId);
  }

  // Solo superadmin (payments:read): cobros que necesitan una mirada humana
  @Get('sales/review')
  @RequierePermiso('payments:read')
  review() {
    return this.sales.reviewPayments();
  }

  @Get('events/:id/sales')
  @RequierePermiso('orders:read')
  eventSales(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestWithUser) {
    return this.sales.eventSales(id, req.user);
  }

  @Get('events/:id/orders')
  @RequierePermiso('orders:read')
  orders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status: string | undefined,
    @Query('q') q: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Req() req: RequestWithUser,
  ) {
    return this.sales.listOrders(id, req.user, {
      status: statusParam(status),
      q: typeof q === 'string' ? q : undefined,
      limit: intParam(limit, 'limit', 25, 1, 100),
      offset: intParam(offset, 'offset', 0, 0, 1_000_000),
    });
  }

  // Antes que orders/:orderId, o "export" se leería como un id
  @Get('events/:id/orders/export')
  @RequierePermiso('orders:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  exportOrders(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status: string | undefined,
    @Query('q') q: string | undefined,
    @Req() req: RequestWithUser,
  ) {
    return this.sales.exportCsv(id, req.user, { status: statusParam(status), q: typeof q === 'string' ? q : undefined });
  }

  @Get('events/:id/orders/:orderId')
  @RequierePermiso('orders:read')
  orderDetail(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.sales.orderDetail(id, orderId, req.user);
  }
}
