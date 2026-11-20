import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BuyerAuthGuard } from './buyer-auth.guard.js';
import { BuyerAuthService } from './buyer-auth.service.js';
import { BuyersService } from './buyers.service.js';
import { GoogleLoginDto } from './buyers.dto.js';
import type { buyerAccount } from '../db/index.js';

type BuyerRequest = { buyer: typeof buyerAccount.$inferSelect };

@Controller('buyers')
export class BuyersController {
  constructor(
    private readonly auth: BuyerAuthService,
    private readonly buyers: BuyersService,
  ) {}

  @Post('auth/google')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  @Get('me')
  @UseGuards(BuyerAuthGuard)
  me(@Req() req: BuyerRequest) {
    return this.auth.publicBuyer(req.buyer);
  }

  @Get('me/orders')
  @UseGuards(BuyerAuthGuard)
  myOrders(@Req() req: BuyerRequest) {
    return this.buyers.myOrders(req.buyer.id);
  }
}
