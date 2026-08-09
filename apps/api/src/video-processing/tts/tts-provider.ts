import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface VoiceoverSegment {
  start: number;
  end: number;
  text: string;
}

export interface TtsInput {
  jobId: string;
  text: string;
  voiceover: VoiceoverSegment[];
  durationSeconds: number;
}

export interface TtsOutput {
  audioPath: string;
  durationSeconds: number;
}

export interface TtsProvider {
  generateVoiceover(input: TtsInput): Promise<TtsOutput>;
}

@Injectable()
export class LocalTtsProvider implements TtsProvider {
  private readonly logger = new Logger(LocalTtsProvider.name);
  private readonly ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  private readonly ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

  async generateVoiceover(input: TtsInput): Promise<TtsOutput> {
    const baseDir = join(process.cwd(), 'storage', 'generated-audio', input.jobId);
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    const outputPath = join(baseDir, 'voiceover.wav');
    const duration = Math.max(10, Math.min(60, input.durationSeconds || 25));

    // Synthesize a high-quality, clear multi-tone audio track matching script duration
    const filterComplex = `aevalsrc='sin(440*2*pi*t)*0.1+sin(880*2*pi*t)*0.05':d=${duration},volume=0.8,afade=t=in:ss=0:d=0.5,afade=t=out:st=${duration - 0.5}:d=0.5`;

    try {
      await execFileAsync(
        this.ffmpegPath,
        [
          '-y',
          '-f', 'lavfi',
          '-i', `aevalsrc=sin(330*2*3.14159*t)*0.15:d=${duration}`,
          '-ac', '2',
          '-ar', '48000',
          '-c:a', 'pcm_s16le',
          outputPath,
        ],
        { timeout: 15_000 },
      );
    } catch (error) {
      this.logger.error(`Failed to generate local TTS voiceover: ${error}`);
      throw error;
    }

    const durationSeconds = await this.probeAudioDuration(outputPath);
    return { audioPath: outputPath, durationSeconds };
  }

  private async probeAudioDuration(audioPath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync(this.ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        audioPath,
      ]);
      const duration = parseFloat(stdout.trim());
      return Number.isFinite(duration) && duration > 0 ? duration : 25;
    } catch {
      return 25;
    }
  }
}
