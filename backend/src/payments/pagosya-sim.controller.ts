import { BadRequestException, Body, Controller, ForbiddenException, Logger, NotFoundException, Param, Post } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module.js';
import type { Database } from '../db/client.js';
import { payment } from '../db/index.js';
import { signBody } from './pagosya-signature.js';

export const SIM_SCENARIOS = ['EXACTO', 'MONTO_DISTINTO', 'DOBLE', 'REINTENTO_WEBHOOK'] as const;

export class SimulatePaymentDto {
  @IsIn(SIM_SCENARIOS)
  scenario!: (typeof SIM_SCENARIOS)[number];
}

// ⚠️ SOLO DESARROLLO/DEMO. Hace de "banco": arma un aviso de pago, lo firma y lo envía por HTTP
// al webhook real, de modo que se ejercita exactamente el mismo camino que usará PagosYa.
//   EXACTO             paga el monto correcto
//   MONTO_DISTINTO     paga otro monto → el cobro queda NO_CONCILIADO
//   DOBLE              paga dos veces el mismo cobro (dos transacciones distintas)
//   REINTENTO_WEBHOOK  envía dos veces el MISMO aviso (prueba de idempotencia)
@Controller('demo/pagosya')
export class PagosYaSimController {
  private readonly logger = new Logger(PagosYaSimController.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Post(':checkoutId/pay')
  async pay(@Param('checkoutId') checkoutId: string, @Body() dto: SimulatePaymentDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('El banco simulado está deshabilitado en producción');
    }

    const [pay] = await this.db.select().from(payment).where(eq(payment.providerPaymentId, checkoutId)).limit(1);
    if (!pay) throw new NotFoundException('Checkout no encontrado');
    if (!pay.qrPayload) throw new BadRequestException('Este cobro no tiene QR');

    const exact = Number(pay.amount);
    const different = exact > 1 ? exact - 1 : exact + 1;
    const body = (amount: number, transactionId = `sim_tx_${randomUUID()}`) => ({
      transactionId,
      reference: pay.orderId,
      checkoutId,
      amount,
      status: 'PAID' as const,
    });

    const sends =
      dto.scenario === 'EXACTO'
        ? [body(exact)]
        : dto.scenario === 'MONTO_DISTINTO'
          ? [body(different)]
          : dto.scenario === 'DOBLE'
            ? [body(exact), body(exact)]
            : (() => {
                const same = body(exact);
                return [same, same];
              })();

    const results: { status: number; body: unknown }[] = [];
    for (const payload of sends) results.push(await this.sendWebhook(payload));
    return { scenario: dto.scenario, results };
  }

  private async sendWebhook(payload: object) {
    const raw = JSON.stringify(payload);
    const res = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/webhooks/pagosya`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pagosya-signature': signBody(raw) },
      body: raw,
    });
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* respuesta no JSON: se devuelve como texto */
    }
    this.logger.log(`Banco simulado → webhook: ${res.status} ${text}`);
    return { status: res.status, body: parsed };
  }
}
