import { Module } from '@nestjs/common';
import { OrganizersController } from './organizers.controller.js';
import { OrganizersService } from './organizers.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [OrganizersController],
  providers: [OrganizersService],
})
export class OrganizersModule {}
