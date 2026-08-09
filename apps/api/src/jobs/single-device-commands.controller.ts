import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DeviceAgentGuard } from '../devices/device-agent.guard';
import { SingleDeviceCommandsService } from './single-device-commands.service';
import { verifyDeviceFileSignature } from './device-file-signature';

@ApiTags('Single Device Commands')
@Controller('devices')
export class SingleDeviceCommandsController {
  constructor(private readonly commands: SingleDeviceCommandsService) {}

  @Post(':code/commands')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OPERATOR')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({ summary: 'Create and enqueue a real PHONE-001 command' })
  create(
    @Param('code') code: string,
    @Body() body: { command?: string; parameters?: unknown; idempotencyKey?: string },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-idempotency-key') alternateIdempotencyKey: string | undefined,
    @UploadedFile() file?: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ) {
    return this.commands.create(code, body, idempotencyKey || alternateIdempotencyKey, file)
      .then((data) => ({ success: true, data }));
  }

  @Get('files/:fileId/download')
  @UseGuards(DeviceAgentGuard)
  @ApiOperation({ summary: 'Download a queued PUSH_FILE payload for Device Agent' })
  async download(@Param('fileId') fileId: string, @Res() response: Response) {
    const { file, buffer } = await this.commands.downloadFile(fileId);
    response.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    response.setHeader('Content-Length', String(buffer.length));
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    response.send(buffer);
  }

  @Get('files/:fileId/view')
  @ApiOperation({ summary: 'View screenshot evidence using an HMAC-signed URL' })
  async view(
    @Param('fileId') fileId: string,
    @Query('signature') signature: string,
    @Query('expiresAt') expiresAtRaw: string,
    @Res() response: Response,
  ) {
    const expiresAt = parseInt(expiresAtRaw || '', 10);
    if (!Number.isFinite(expiresAt) || !verifyDeviceFileSignature(fileId, signature, expiresAt)) {
      throw new ForbiddenException('Invalid or expired evidence signature');
    }
    const { file, buffer } = await this.commands.downloadFile(fileId);
    response.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    response.setHeader('Content-Length', String(buffer.length));
    response.setHeader('Cache-Control', 'private, max-age=300');
    response.send(buffer);
  }
}
