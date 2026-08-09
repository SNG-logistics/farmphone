import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CleanupVideoAssetsDto, CreateThumbnailDto, SourceVideoDto, TranscodeVideoDto } from './dto/video-processing.dto';
import { VideoPathService } from './video-path.service';
import { VideoProbeService } from './video-probe.service';
import { VideoTranscodeService } from './video-transcode.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Video processing')
@Controller('video-processing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OPERATOR')
export class VideoProcessingController {
  constructor(
    private readonly probe: VideoProbeService,
    private readonly transcode: VideoTranscodeService,
    private readonly paths: VideoPathService,
  ) {}

  @Post('validate')
  @ApiOperation({ summary: 'Validate a locally staged video using ffprobe' })
  validate(@Body() dto: SourceVideoDto) {
    return this.probe.validate(dto.sourcePath);
  }

  @Post('thumbnail')
  @ApiOperation({ summary: 'Create a JPEG thumbnail with allowlisted ffmpeg options' })
  createThumbnail(@Body() dto: CreateThumbnailDto) {
    return this.transcode.createThumbnail(dto);
  }

  @Post('transcode')
  @ApiOperation({ summary: 'Transcode a video to an allowlisted social-media preset' })
  transcodeVideo(@Body() dto: TranscodeVideoDto) {
    return this.transcode.transcode(dto);
  }

  @Delete('temporary-assets')
  @ApiOperation({ summary: 'Remove expired generated video assets' })
  async cleanup(@Body() dto: CleanupVideoAssetsDto) {
    const olderThanSeconds = dto.olderThanSeconds ?? 60 * 60;
    return { removed: await this.paths.cleanupExpiredOutputs(olderThanSeconds) };
  }
}
