import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { AdbService } from './adb.service';
import { DevicesService } from './devices.service';
import type { Response } from 'express';

@ApiTags('Screen Mirror')
@ApiBearerAuth()
@Controller('devices')
export class ScreenMirrorController {
  constructor(
    private readonly adbService: AdbService,
    private readonly devicesService: DevicesService,
  ) {}

  @Get(':code/screen')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Capture live screenshot from device (PNG)' })
  async captureScreen(
    @Param('code') code: string,
    @Res() res: Response,
  ) {
    const device = await this.devicesService.findByCode(code);
    if (!device.serialNumber) {
      res.status(404).json({ success: false, message: 'Device has no serial number — not connected via ADB' });
      return;
    }
    try {
      const { buffer, format } = await this.adbService.getStreamScreen(device.serialNumber, 480, 60);
      res.set({
        'Content-Type': format,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Device-Code': device.code,
        'X-Captured-At': new Date().toISOString(),
      });
      res.send(buffer);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Screenshot capture failed';
      res.status(500).json({ success: false, message });
    }
  }

  @Get(':code/screen/info')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get device screen resolution' })
  async screenInfo(@Param('code') code: string) {
    const device = await this.devicesService.findByCode(code);
    if (!device.serialNumber) {
      return { success: false, message: 'Device has no serial number' };
    }
    try {
      const resolution = await this.adbService.getResolution(device.serialNumber);
      return { success: true, data: { code: device.code, serial: device.serialNumber, ...resolution } };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to get resolution';
      return { success: false, message };
    }
  }

  @Post(':code/screen/tap')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send tap input to device screen' })
  async tap(
    @Param('code') code: string,
    @Body() body: { x: number; y: number },
  ) {
    const device = await this.devicesService.findByCode(code);
    if (!device.serialNumber) {
      return { success: false, message: 'Device has no serial number' };
    }
    const { x, y } = body;
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0) {
      return { success: false, message: 'Valid x and y coordinates are required' };
    }
    const result = await this.adbService.tap(device.serialNumber, x, y);
    return { success: true, data: result };
  }

  @Post(':code/screen/swipe')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send swipe input to device screen' })
  async swipe(
    @Param('code') code: string,
    @Body() body: { x1: number; y1: number; x2: number; y2: number; duration?: number },
  ) {
    const device = await this.devicesService.findByCode(code);
    if (!device.serialNumber) {
      return { success: false, message: 'Device has no serial number' };
    }
    const { x1, y1, x2, y2, duration } = body;
    if ([x1, y1, x2, y2].some((v) => typeof v !== 'number' || v < 0)) {
      return { success: false, message: 'Valid x1, y1, x2, y2 coordinates are required' };
    }
    const result = await this.adbService.swipe(device.serialNumber, x1, y1, x2, y2, duration ?? 300);
    return { success: true, data: result };
  }

  @Post(':code/screen/key')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Send keycode to device' })
  async keyEvent(
    @Param('code') code: string,
    @Body() body: { keycode: string },
  ) {
    const device = await this.devicesService.findByCode(code);
    if (!device.serialNumber) {
      return { success: false, message: 'Device has no serial number' };
    }
    const allowed = [
      'KEYCODE_HOME', 'KEYCODE_BACK', 'KEYCODE_APP_SWITCH',
      'KEYCODE_VOLUME_UP', 'KEYCODE_VOLUME_DOWN', 'KEYCODE_POWER',
      'KEYCODE_WAKEUP', 'KEYCODE_SLEEP', 'KEYCODE_MENU',
      'KEYCODE_ENTER', 'KEYCODE_DEL', 'KEYCODE_DPAD_UP',
      'KEYCODE_DPAD_DOWN', 'KEYCODE_DPAD_LEFT', 'KEYCODE_DPAD_RIGHT',
    ];
    if (!body.keycode || !allowed.includes(body.keycode)) {
      return { success: false, message: `Allowed keycodes: ${allowed.join(', ')}` };
    }
    const result = await this.adbService.keyEvent(device.serialNumber, body.keycode);
    return { success: true, data: result };
  }

  @Post(':code/screen/text')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Input text to device' })
  async inputText(
    @Param('code') code: string,
    @Body() body: { text: string },
  ) {
    const device = await this.devicesService.findByCode(code);
    if (!device.serialNumber) {
      return { success: false, message: 'Device has no serial number' };
    }
    if (!body.text || typeof body.text !== 'string') {
      return { success: false, message: 'text is required' };
    }
    const result = await this.adbService.inputText(device.serialNumber, body.text);
    return { success: true, data: result };
  }
}
