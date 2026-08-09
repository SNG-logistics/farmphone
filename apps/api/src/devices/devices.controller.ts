import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { DevicesService } from './devices.service';
import { DeviceAgentGuard } from './device-agent.guard';

@ApiTags('Devices')
@ApiBearerAuth()
@Controller()
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get('devices')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all devices' })
  findAll() {
    return this.devicesService.findAll().then((data) => ({ success: true, data }));
  }

  @Get('devices/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get device by ID' })
  findOne(@Param('id') id: string) {
    return this.devicesService.findOne(id).then((data) => ({ success: true, data }));
  }

  @Post('devices')
  @UseGuards(DeviceAgentGuard)
  @ApiOperation({ summary: 'Register a new device (called by Device Agent)' })
  create(@Body() body: any) {
    return this.devicesService.create(body).then((data) => ({ success: true, data }));
  }

  @Patch('devices/:id')
  @UseGuards(DeviceAgentGuard)
  @ApiOperation({ summary: 'Update device info or status' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.devicesService.update(id, body).then((data) => ({ success: true, data }));
  }

  @Patch('devices/:id/heartbeat')
  @UseGuards(DeviceAgentGuard)
  @ApiOperation({ summary: 'Send heartbeat for device' })
  heartbeat(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.devicesService.heartbeat(id, body).then((data) => ({ success: true, data }));
  }

  @Post('devices/:id/heartbeat')
  @UseGuards(DeviceAgentGuard)
  @ApiOperation({ summary: 'Send heartbeat for device (POST alias)' })
  heartbeatPost(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.devicesService.heartbeat(id, body).then((data) => ({ success: true, data }));
  }

  @Get('device-groups')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all device groups' })
  findAllGroups() {
    return this.devicesService.findAllGroups().then((data) => ({ success: true, data }));
  }

  @Post('devices/commands/batch')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Dispatch batch command to multiple devices' })
  dispatchBatchCommand(@Body() body: { deviceCodes?: string[]; command: string; parameters?: Record<string, unknown> }) {
    return this.devicesService.dispatchBatchCommand(body.deviceCodes, body.command, body.parameters).then((data) => ({ success: true, data }));
  }

  @Post('devices/:code/commands')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Dispatch command to a single device' })
  dispatchSingleCommand(@Param('code') code: string, @Body() body: { command: string; parameters?: Record<string, unknown> }) {
    return this.devicesService.dispatchCommand(code, body.command, body.parameters).then((data) => ({ success: true, data }));
  }
}
