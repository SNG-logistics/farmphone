import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ExecFileProcessRunner } from '../src/video-processing/process-runner.service';
import { VideoPathService } from '../src/video-processing/video-path.service';
import { VideoProbeService } from '../src/video-processing/video-probe.service';
import { VideoTranscodeService } from '../src/video-processing/video-transcode.service';
import { ProcessRunOptions, ProcessRunner } from '../src/video-processing/video-processing.types';

class FakeProcessRunner implements ProcessRunner {
  readonly calls: Array<{ command: string; args: readonly string[]; options: ProcessRunOptions }> = [];
  response = JSON.stringify({
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '30.5', size: '12345' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, avg_frame_rate: '30000/1001' },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
  });
  failure: Error | null = null;
  failAfterCall: number | null = null;

  async run(command: string, args: readonly string[], options: ProcessRunOptions) {
    this.calls.push({ command, args, options });
    if (this.failure && (this.failAfterCall === null || this.calls.length >= this.failAfterCall)) throw this.failure;
    return { stdout: this.response, stderr: '' };
  }
}

describe('Video processing command safety', () => {
  let mediaRoot: string;
  let temporaryRoot: string;
  let sourcePath: string;
  let runner: FakeProcessRunner;
  let paths: VideoPathService;
  let probe: VideoProbeService;
  let transcode: VideoTranscodeService;

  beforeEach(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'farm-phone-media-'));
    temporaryRoot = await mkdtemp(join(tmpdir(), 'farm-phone-output-'));
    sourcePath = join(mediaRoot, 'clip.mp4');
    await writeFile(sourcePath, 'video fixture');
    process.env.VIDEO_PROCESSING_ALLOWED_ROOTS = mediaRoot;
    process.env.VIDEO_PROCESSING_TEMP_ROOT = temporaryRoot;
    runner = new FakeProcessRunner();
    paths = new VideoPathService();
    const processRunner = runner as unknown as ExecFileProcessRunner;
    probe = new VideoProbeService(paths, processRunner);
    transcode = new VideoTranscodeService(paths, probe, processRunner);
  });

  afterEach(async () => {
    delete process.env.VIDEO_PROCESSING_ALLOWED_ROOTS;
    delete process.env.VIDEO_PROCESSING_TEMP_ROOT;
    await rm(mediaRoot, { recursive: true, force: true });
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('validates video metadata through an argument-array ffprobe invocation', async () => {
    const result = await probe.validate(sourcePath);
    expect(result.metadata).toMatchObject({ videoCodec: 'h264', audioCodec: 'aac', width: 1080, height: 1920 });
    expect(runner.calls).toEqual([expect.objectContaining({
      command: 'ffprobe',
      args: ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', sourcePath],
      options: { timeoutMs: 15_000, maxBufferBytes: 2 * 1024 * 1024 },
    })]);
  });

  it('constructs an allowlisted ffmpeg thumbnail command without shell fragments', async () => {
    const result = await transcode.createThumbnail({ sourcePath, timestampSeconds: 5, width: 720 });
    const command = runner.calls[1];
    expect(command.command).toBe('ffmpeg');
    expect(command.args).toEqual(expect.arrayContaining(['-ss', '5', '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', '-an']));
    expect(command.args.at(-1)).toBe(result.outputPath);
    expect(result.outputPath).toContain(temporaryRoot);
    expect(command.options.timeoutMs).toBe(60_000);
  });

  it('constructs a fixed social transcode command and cleans temporary output on failure', async () => {
    runner.failure = new Error('ffmpeg failed');
    runner.failAfterCall = 2;
    await expect(transcode.transcode({ sourcePath, preset: 'social-square', crf: 20 })).rejects.toThrow('ffmpeg failed');
    const command = runner.calls[1];
    expect(command.args).toEqual(expect.arrayContaining([
      '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-crf', '20',
      '-vf', 'scale=1080:1080:force_original_aspect_ratio=decrease,pad=1080:1080:(ow-iw)/2:(oh-ih)/2',
    ]));
    expect(command.args).not.toContain(';');
    await expect(readdir(temporaryRoot)).resolves.toEqual([]);
    await expect(mkdir(join(temporaryRoot, 'still-writable'))).resolves.toBeUndefined();
  });

  it('rejects paths outside the configured media root and invalid probe data', async () => {
    await expect(probe.validate(join(tmpdir(), 'outside.mp4'))).rejects.toBeInstanceOf(BadRequestException);
    runner.response = '{}';
    await expect(probe.validate(sourcePath)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
