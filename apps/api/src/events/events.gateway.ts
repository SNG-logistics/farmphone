import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import type { EventBus } from '@farm-phone/events';
import { EVENT_BUS } from './event-bus.token';
import { Server, Socket } from 'socket.io';
import { DeviceCommandBrokerService, DeviceCommandResponse } from './device-command-broker.service';

@WebSocketGateway({
  maxHttpBufferSize: 25 * 1024 * 1024,
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);
  private readonly nodes = new Map<string, { socketId: string; devices: unknown[]; connectedAt: Date }>();

  constructor(
    @Inject(EVENT_BUS) private readonly eventBus: EventBus<Record<string, unknown>>,
    private readonly commandBroker: DeviceCommandBrokerService,
  ) {}
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    for (const [nodeId, node] of this.nodes) {
      if (node.socketId === client.id) {
        this.nodes.delete(nodeId);
        this.server.emit('agent:offline', { nodeId, disconnectedAt: new Date().toISOString() });
      }
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('agent:register')
  registerAgent(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { nodeId?: string; devices?: unknown[] },
  ) {
    if (!this.authorized(client)) {
      client.emit('agent:registration:error', { message: 'Invalid device agent token' });
      client.disconnect(true);
      return { success: false };
    }
    const nodeId = body.nodeId || String(client.handshake.auth?.nodeId || '');
    if (!nodeId) return { success: false, message: 'nodeId is required' };
    const devices = Array.isArray(body.devices) ? body.devices : [];
    this.nodes.set(nodeId, { socketId: client.id, devices, connectedAt: new Date() });
    void client.join(`node:${nodeId}`);
    const response = { success: true, nodeId, deviceCount: devices.length, registeredAt: new Date().toISOString() };
    client.emit('agent:registered', response);
    this.server.emit('agent:online', response);
    return response;
  }

  @SubscribeMessage('device:response')
  deviceResponse(@ConnectedSocket() client: Socket, @MessageBody() body: DeviceCommandResponse) {
    if (!this.authorized(client)) return { success: false };
    const registration = [...this.nodes.values()].find((node) => node.socketId === client.id);
    if (!registration || !this.matchesRegisteredDevice(registration.devices, body)) {
      this.logger.warn(`Rejected device response from unregistered socket ${client.id}`);
      return { success: false };
    }
    const accepted = this.commandBroker.resolve(body);
    this.server.emit('device:response:update', { ...body, accepted });
    return { success: accepted };
  }

  emitDeviceCommand(nodeId: string, command: unknown) {
    this.server.to(`node:${nodeId}`).emit('device:command', command);
  }

  isNodeConnected(nodeId: string) {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    return this.server?.sockets?.sockets?.get(node.socketId)?.connected === true;
  }

  private authorized(client: Socket) {
    const configured = process.env.DEVICE_AGENT_TOKEN || '';
    const supplied = String(client.handshake.auth?.token || '');
    const address = client.handshake.address || '';
    const local = address.includes('127.0.0.1') || address === '::1';
    return Boolean(configured && supplied === configured) || (process.env.NODE_ENV !== 'production' && local);
  }

  private matchesRegisteredDevice(devices: unknown[], response: DeviceCommandResponse) {
    if (!response.deviceId && !response.deviceCode) return false;
    return devices.some((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const device = value as { id?: unknown; code?: unknown };
      return (response.deviceId && String(device.id || '') === response.deviceId)
        || (response.deviceCode && String(device.code || '') === response.deviceCode);
    });
  }

  emitAgentState(agentStateUpdate: any) {
    this.eventBus.emit('agent.state', agentStateUpdate, agentStateUpdate.organizationId || 'system');
    this.server.emit('agentState', agentStateUpdate);
  }

  emitWorkflowUpdate(workflowUpdate: any) {
    this.eventBus.emit('workflow.update', workflowUpdate, workflowUpdate.organizationId || 'system');
    this.server.emit('workflowUpdate', workflowUpdate);
  }

  emitDeviceUpdate(deviceUpdate: any) {
    this.eventBus.emit('device.update', deviceUpdate, deviceUpdate.device?.organizationId || deviceUpdate.organizationId || 'system');
    this.server.emit('deviceUpdate', deviceUpdate);
  }

  emitJobUpdate(jobUpdate: any) {
    this.eventBus.emit('job.update', jobUpdate, jobUpdate.organizationId || 'system');
    this.server.emit('jobUpdate', jobUpdate);
  }

  emitNotification(notification: any) {
    this.eventBus.emit('notification.created', notification, notification.organizationId || 'system');
    this.server.emit('notification', notification);
  }
}
