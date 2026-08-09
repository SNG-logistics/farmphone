import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { VideoPathService } from './video-path.service';
import { ProcessRunner, VideoMetadata } from './video-processing.types';
import { ExecFileProcessRunner } from './process-runner.service';

const VIDEO_CODECS = new Set(['h264', 'hevc', 'av1', 'vp8', 'vp9', 'mpeg4']);
const MAX_DURATION_SECONDS = 2 * 60 * 60;

@Injectable()
export class VideoProbeService {
  private readonly ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

  constructor(
    private readonly paths: VideoPathService,
    private readonly runner: ExecFileProcessRunner,
  ) {}

  async validate(sourcePath: string): Promise<{ sourcePath: string; metadata: VideoMetadata }> {
    const safePath = await this.paths.assertSourceFile(sourcePath);
    const result = await this.runner.run(this.ffprobePath, this.buildProbeArgs(safePath), {
      timeoutMs: 15_000,
      maxBufferBytes: 2 * 1024 * 1024,
    });
    return { sourcePath: safePath, metadata: this.parseMetadata(result.stdout) };
  }

  buildProbeArgs(sourcePath: string) {
    return ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', sourcePath];
  }

  private parseMetadata(stdout: string): VideoMetadata {
    let probe: any;
    try {
      probe = JSON.parse(stdout);
    } catch {
      throw new UnprocessableEntityException('ffprobe returned invalid JSON');
    }
    const video = probe?.streams?.find((stream: any) => stream?.codec_type === 'video');
    if (!video) throw new UnprocessableEntityException('The file does not contain a video stream');
    if (!VIDEO_CODECS.has(video.codec_name)) throw new UnprocessableEntityException('The video codec is not supported');

    const durationSeconds = this.toNumber(probe?.format?.duration ?? video.duration);
    const sizeBytes = this.toNumber(probe?.format?.size);
    const width = this.toNumber(video.width);
    const height = this.toNumber(video.height);
    if (!durationSeconds || durationSeconds > MAX_DURATION_SECONDS || !width || !height || !sizeBytes) {
      throw new UnprocessableEntityException('The video metadata is outside supported limits');
    }

    const audio = probe.streams.find((stream: any) => stream?.codec_type === 'audio');
    return {
      formatName: typeof probe?.format?.format_name === 'string' ? probe.format.format_name : null,
      durationSeconds,
      sizeBytes,
      videoCodec: video.codec_name,
      audioCodec: typeof audio?.codec_name === 'string' ? audio.codec_name : null,
      width,
      height,
      frameRate: this.frameRate(video.avg_frame_rate),
    };
  }

  private toNumber(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private frameRate(value: unknown) {
    if (typeof value !== 'string') return null;
    const [numerator, denominator] = value.split('/').map(Number);
    const rate = denominator ? numerator / denominator : numerator;
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  }
}
