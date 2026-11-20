import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PagosYaSignatureGuard } from './pagosya-signature.guard.js';
import { PagosYaWebhookDto } from './pagosya-webhook.dto.js';
import { PagosYaWebhookService } from './pagosya-webhook.service.js';

// Receptor de avisos de pago. Público, pero solo acepta cuerpos con firma HMAC válida.
@Controller('webhooks/pagosya')
export class PagosYaWebhookController {
  constructor(private readonly webhook: PagosYaWebhookService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(PagosYaSignatureGuard)
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  receive(@Body() dto: PagosYaWebhookDto) {
    return this.webhook.handle(dto);
  }
}
