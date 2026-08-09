import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { InMemoryEventBus } from '@farm-phone/events';
import { EVENT_BUS } from './event-bus.token';
import { DeviceCommandBrokerService } from './device-command-broker.service';

@Module({
  providers: [
    { provide: EVENT_BUS, useFactory: () => new InMemoryEventBus<Record<string, unknown>>() },
    DeviceCommandBrokerService,
    EventsGateway,
  ],
  exports: [EventsGateway, EVENT_BUS, DeviceCommandBrokerService],
})
export class EventsModule {}
