import { Body, Controller, ForbiddenException, Get, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdbService } from './adb.service';

@ApiTags('Local Device Test')
@Controller('device-test')
export class DeviceTestController {
  constructor(private readonly adbService: AdbService) {}

  @Get('devices')
  @ApiOperation({ summary: 'Detect locally connected Android devices through ADB' })
  detect(@Req() request: Request) {
    this.assertLocalDevelopment(request);
    return this.adbService.diagnose().then((data) => ({ success: true, data }));
  }

  @Post('devices/:serial/action')
  @ApiOperation({ summary: 'Run a safe test action on a locally connected device' })
  action(
    @Req() request: Request,
    @Param('serial') serial: string,
    @Body() body: { action?: string },
  ) {
    this.assertLocalDevelopment(request);
    if (!body.action || !['wake', 'sleep', 'home'].includes(body.action)) {
      throw new ForbiddenException('อนุญาตเฉพาะคำสั่ง wake, sleep และ home');
    }
    return this.adbService
      .executeAction(serial, body.action as 'wake' | 'sleep' | 'home')
      .then((data) => ({ success: true, data }));
  }

  private assertLocalDevelopment(request: Request) {
    const address = request.socket.remoteAddress || '';
    const local = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
    if (process.env.NODE_ENV === 'production' || !local) {
      throw new ForbiddenException('Device test API ใช้ได้เฉพาะ localhost ใน development mode');
    }
  }
}
