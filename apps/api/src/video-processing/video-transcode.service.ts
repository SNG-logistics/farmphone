import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateThumbnailDto, TranscodeVideoDto } from './dto/video-processing.dto';
import { ExecFileProcessRunner } from './process-runner.service';
import { VideoPathService } from './video-path.service';
import { VideoProbeService } from './video-probe.service';
import { GeneratedVideoAsset, VideoOutputPreset } from './video-processing.types';

const OUTPUT_EXPIRY_SECONDS = 60 * 60;
const SCALE_BY_PRESET: Record<VideoOutputPreset, string> = {
  'social-vertical': 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
  'social-square': 'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2',
  'social-landscape': 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2',
};

@Injectable()
export class VideoTranscodeService {
  private readonly ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  constructor(
    private readonly paths: VideoPathService,
    private readonly probe: VideoProbeService,
    private readonly runner: ExecFileProcessRunner,
  ) {}

  async createThumbnail(dto: CreateThumbnailDto): Promise<GeneratedVideoAsset> {
    const { sourcePath, metadata } = await this.probe.validate(dto.sourcePath);
    const timestamp = dto.timestampSeconds ?? 0;
    if (timestamp >= metadata.durationSeconds) throw new UnprocessableEntityException('Thumbnail timestamp is outside the video duration');
    const workspace = await this.paths.createWorkspace();
    const outputPath = this.paths.outputPath(workspace, `${randomUUID()}.jpg`);
    try {
      await this.runner.run(this.ffmpegPath, this.buildThumbnailArgs(sourcePath, outputPath, timestamp, dto.width ?? 720), {
        timeoutMs: 60_000,
        maxBufferBytes: 2 * 1024 * 1024,
      });
      return this.asset(outputPath);
    } catch (error) {
      await this.paths.removeWorkspace(workspace);
      throw error;
    }
  }

  async transcode(dto: TranscodeVideoDto): Promise<GeneratedVideoAsset> {
    const { sourcePath } = await this.probe.validate(dto.sourcePath);
    const workspace = await this.paths.createWorkspace();
    const outputPath = this.paths.outputPath(workspace, `${randomUUID()}.mp4`);
    try {
      await this.runner.run(this.ffmpegPath, this.buildTranscodeArgs(sourcePath, outputPath, dto.preset ?? 'social-vertical', dto.crf ?? 23), {
        timeoutMs: 15 * 60_000,
        maxBufferBytes: 2 * 1024 * 1024,
      });
      return this.asset(outputPath);
    } catch (error) {
      await this.paths.removeWorkspace(workspace);
      throw error;
    }
  }

  buildThumbnailArgs(sourcePath: string, outputPath: string, timestampSeconds: number, width: number) {
    return [
      '-hide_banner', '-loglevel', 'error', '-ss', String(timestampSeconds), '-i', sourcePath,
      '-frames:v', '1', '-an', '-vf', `scale=${width}:-2`, '-q:v', '3', '-y', outputPath,
    ];
  }

  buildTranscodeArgs(sourcePath: string, outputPath: string, preset: VideoOutputPreset, crf: number) {
    return [
      '-hide_banner', '-loglevel', 'error', '-i', sourcePath,
      '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf),
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k',
      '-vf', SCALE_BY_PRESET[preset], '-y', outputPath,
    ];
  }

  private asset(outputPath: string): GeneratedVideoAsset {
    return { outputPath, expiresAt: new Date(Date.now() + OUTPUT_EXPIRY_SECONDS * 1000).toISOString() };
  }
}
