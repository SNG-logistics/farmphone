import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { AdbService } from './adb.service';
import { DeviceTestController } from './device-test.controller';
import { FleetController } from './fleet.controller';
import { ScreenMirrorController } from './screen-mirror.controller';
import { DeviceAgentGuard } from './device-agent.guard';
import { EventsModule } from '../events/events.module';
import { DeviceOfflineMonitorService } from './device-offline-monitor.service';

@Module({
  imports: [EventsModule],
  controllers: [DevicesController, DeviceTestController, FleetController, ScreenMirrorController],
  providers: [DevicesService, AdbService, DeviceAgentGuard, DeviceOfflineMonitorService],
  exports: [DevicesService, AdbService],
})
export class DevicesModule {}


