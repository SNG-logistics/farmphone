import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Headers,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { JobsService } from './jobs.service';
import { SingleDeviceCommandsService } from './single-device-commands.service';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OPERATOR')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly singleDeviceCommandsService: SingleDeviceCommandsService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get job stats' })
  getStats() {
    return this.jobsService.getStats();
  }

  @Get('dead-letters')
  @ApiOperation({ summary: 'List jobs that exhausted all retries' })
  deadLetters() {
    return this.jobsService.getDeadLetters();
  }

  @Post('dead-letters/:id/retry')
  @ApiOperation({ summary: 'Move a dead-letter job back to the main queue' })
  retryDeadLetter(@Param('id') id: string) {
    return this.jobsService.retryDeadLetter(id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all jobs with filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'deviceId', required: false })
  @ApiQuery({ name: 'campaignId', required: false })
  findAll(
    @Query('status') status?: string,
    @Query('deviceId') deviceId?: string,
    @Query('campaignId') campaignId?: string,
  ) {
    return this.jobsService.findAll({ status, deviceId, campaignId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID' })
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @Post('single-device/:code')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 500 * 1024 * 1024 } }))
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({ summary: 'Create and enqueue a single-device command' })
  createSingleDeviceCommand(
    @Param('code') code: string,
    @Body() body: { command?: string; parameters?: unknown; idempotencyKey?: string },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-idempotency-key') alternateIdempotencyKey: string | undefined,
    @UploadedFile() file?: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ) {
    return this.singleDeviceCommandsService.create(code, body, idempotencyKey || alternateIdempotencyKey, file)
      .then((data) => ({ success: true, data }));
  }

  @Post()
  @ApiOperation({ summary: 'Create and enqueue a new job' })
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      type?: string;
      deviceId?: string;
      campaignId?: string;
      accountId?: string;
      contentId?: string;
      scheduledAt?: string;
      metadata?: any;
      queueName?: string;
      payload?: any;
    },
  ) {
    return this.jobsService.createAndEnqueue(body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update job status' })
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.jobsService.updateStatus(id, body.status);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Approve, reject, or resume an action-required job' })
  review(
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT' | 'RESUME'; note?: string; actor?: string },
  ) {
    return this.jobsService.review(id, body);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify a published post with UI signals and evidence' })
  verify(
    @Param('id') id: string,
    @Body() body: {
      uiTexts?: string[];
      contentDescriptions?: string[];
      resourceIds?: string[];
      screenshotUrl?: string;
      accountIdentifier?: string;
      contentFingerprint?: string;
      caption?: string;
      postId?: string;
      permalink?: string;
      actor?: string;
    },
  ) {
    return this.jobsService.verify(id, body);
  }
}
