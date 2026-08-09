import { Module } from '@nestjs/common';
import { HealthController, SystemStatusController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DevicesModule } from '../devices/devices.module';

@Module({
  imports: [PrismaModule, DevicesModule],
  controllers: [HealthController, SystemStatusController],
})
export class HealthModule {}
