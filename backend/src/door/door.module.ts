import { Module } from '@nestjs/common';
import { DoorController } from './door.controller.js';
import { DoorService } from './door.service.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [DoorController],
  providers: [DoorService],
})
export class DoorModule {}
