import { Module } from '@nestjs/common';
import { VenuesController } from './venues.controller.js';
import { VenuesService } from './venues.service.js';
import { VenueLayoutService } from './venue-layout.service.js';
import { VenueSeatingService } from './venue-seating.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [VenuesController],
  providers: [VenuesService, VenueLayoutService, VenueSeatingService],
})
export class VenuesModule {}
