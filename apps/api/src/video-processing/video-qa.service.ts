import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface VideoQaResult {
  verified: boolean;
  checksum: string;
  width: number;
  height: number;
  duration: number;
  fileSize: number;
  videoCodec: string;
  audioCodec: string;
  frameRate: number;
  errors: string[];
}

@Injectable()
export class VideoQualityAssuranceService {
  private readonly logger = new Logger(VideoQualityAssuranceService.name);
  private readonly ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

  async verifyVideo(
    videoPath: string,
    expectedDuration: number = 25,
    maxRetries: number = 3,
  ): Promise<VideoQaResult> {
    let attempt = 0;
    let lastResult: VideoQaResult | null = null;

    while (attempt < maxRetries) {
      attempt++;
      this.logger.log(`QA Verification attempt ${attempt}/${maxRetries} for: ${videoPath}`);
      lastResult = await this.performProbeCheck(videoPath, expectedDuration);

      if (lastResult.verified) {
        this.logger.log(`✅ QA Verification PASSED for: ${videoPath} (Checksum: ${lastResult.checksum})`);
        return lastResult;
      }

      this.logger.warn(`⚠️ QA Verification failed on attempt ${attempt}: ${lastResult.errors.join('; ')}`);
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((res) => setTimeout(res, backoffMs));
      }
    }

    return lastResult || {
      verified: false,
      checksum: '',
      width: 0,
      height: 0,
      duration: 0,
      fileSize: 0,
      videoCodec: '',
      audioCodec: '',
      frameRate: 0,
      errors: ['QA Verification failed after maximum retries'],
    };
  }

  private async performProbeCheck(
    videoPath: string,
    expectedDuration: number,
  ): Promise<VideoQaResult> {
    const errors: string[] = [];
    if (!existsSync(videoPath)) {
      return {
        verified: false,
        checksum: '',
        width: 0,
        height: 0,
        duration: 0,
        fileSize: 0,
        videoCodec: '',
        audioCodec: '',
        frameRate: 0,
        errors: [`File does not exist: ${videoPath}`],
      };
    }

    const stats = statSync(videoPath);
    const fileSize = stats.size;
    if (fileSize < 100 * 1024) {
      errors.push(`File size (${fileSize} bytes) is less than required 100 KB`);
    }

    let checksum = '';
    try {
      const buffer = readFileSync(videoPath);
      checksum = createHash('sha256').update(buffer).digest('hex');
    } catch (err) {
      errors.push(`Failed to calculate SHA-256 checksum: ${err}`);
    }

    let stdout = '';
    try {
      const res = await execFileAsync(
        this.ffprobePath,
        ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', videoPath],
        { timeout: 15_000 },
      );
      stdout = res.stdout;
    } catch (err) {
      errors.push(`ffprobe failed with non-zero exit code: ${err}`);
      return {
        verified: false,
        checksum,
        width: 0,
        height: 0,
        duration: 0,
        fileSize,
        videoCodec: '',
        audioCodec: '',
        frameRate: 0,
        errors,
      };
    }

    let probeData: any = {};
    try {
      probeData = JSON.parse(stdout);
    } catch {
      errors.push('ffprobe returned invalid JSON output');
    }

    const videoStream = probeData?.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = probeData?.streams?.find((s: any) => s.codec_type === 'audio');

    if (!videoStream) {
      errors.push('No video stream found in container');
    }

    const videoCodec = videoStream?.codec_name || '';
    if (videoCodec.toLowerCase() !== 'h264') {
      errors.push(`Video codec is '${videoCodec}', expected 'h264'`);
    }

    const width = videoStream?.width || 0;
    const height = videoStream?.height || 0;
    if (width !== 1080 || height !== 1920) {
      errors.push(`Resolution is ${width}x${height}, expected 1080x1920 (9:16)`);
    }

    const duration = parseFloat(probeData?.format?.duration || videoStream?.duration || '0');
    if (duration < 10) {
      errors.push(`Duration (${duration.toFixed(1)}s) is less than minimum 10 seconds`);
    }
    if (duration > expectedDuration + 5) {
      errors.push(`Duration (${duration.toFixed(1)}s) exceeds target duration (${expectedDuration}s) by more than 5s`);
    }

    const audioCodec = audioStream?.codec_name || '';
    if (!audioStream) {
      errors.push('No audio stream found in container');
    }

    const frameRateStr = videoStream?.avg_frame_rate || '30/1';
    const [num, den] = frameRateStr.split('/').map(Number);
    const frameRate = den ? num / den : num || 30;

    const verified = errors.length === 0;

    return {
      verified,
      checksum,
      width,
      height,
      duration,
      fileSize,
      videoCodec,
      audioCodec,
      frameRate,
      errors,
    };
  }
}
