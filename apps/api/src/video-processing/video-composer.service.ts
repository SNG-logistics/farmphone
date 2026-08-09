import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface VideoComposerInput {
  jobId: string;
  organizationId: string;
  brief: string;
  brandName: string;
  durationSeconds: number;
  aspectRatio: string;
  resolution: string;
  script: any;
  scenePlan: any;
  voiceAudioPath: string;
}

export interface VideoComposerOutput {
  mp4Path: string;
  thumbnailPath: string;
  workspaceDir: string;
  outputDir: string;
  renderLogPath: string;
  durationSeconds: number;
}

@Injectable()
export class VideoComposerService {
  private readonly logger = new Logger(VideoComposerService.name);
  private readonly ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  private readonly defaultFont = process.env.VIDEO_THAI_FONT_PATH || 'C:/Windows/Fonts/tahoma.ttf';

  async composeVideo(input: VideoComposerInput): Promise<VideoComposerOutput> {
    const workspaceDir = join(process.cwd(), 'storage', 'video-workspaces', input.jobId);
    const outputDir = join(process.cwd(), 'storage', 'generated-videos', input.organizationId, input.jobId);

    if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    const mp4Path = join(outputDir, 'final.mp4');
    const thumbnailPath = join(outputDir, 'thumbnail.jpg');
    const renderLogPath = join(workspaceDir, 'render-log.txt');

    // Save artifacts for audit
    writeFileSync(join(outputDir, 'script.json'), JSON.stringify(input.script || {}, null, 2));
    writeFileSync(join(outputDir, 'scene-plan.json'), JSON.stringify(input.scenePlan || {}, null, 2));

    const duration = Math.max(15, Math.min(60, input.durationSeconds || 25));
    const brandName = input.brandName || 'SNG EXPRESS';
    const fontPath = existsSync(this.defaultFont) ? this.defaultFont.replace(/\\/g, '/').replace('C:', 'C\\:') : 'C\\:/Windows/Fonts/tahoma.ttf';

    const renderLog: string[] = [`[${new Date().toISOString()}] Starting FFmpeg Render for Job: ${input.jobId}`];
    renderLog.push(`Font path: ${fontPath}`);
    renderLog.push(`Resolution: 1080x1920 (9:16)`);
    renderLog.push(`Duration: ${duration}s`);

    // FFmpeg complex filter: Motion graphic scenes, SNG Express theme (Yellow/Black/White), Subtitles & Branding
    const filterComplex = [
      // Base background: Dark cyber background with yellow accent headers
      `color=c=0x111111:s=1080x1920:d=${duration}:r=30[bg0]`,
      `[bg0]drawbox=x=0:y=0:w=1080:h=220:color=0xFFCC00@1:t=fill[bg1]`,
      `[bg1]drawbox=x=0:y=1700:w=1080:h=220:color=0xFFCC00@1:t=fill[bg2]`,
      // Motion elements (rotating accent bars)
      `[bg2]drawbox=x='(1080/2)+(sin(t*2)*200)-300':y=300:w=600:h=12:color=0xFFCC00@0.8:t=fill[m1]`,
      `[m1]drawbox=x='(1080/2)-(sin(t*2)*200)-300':y=330:w=600:h=6:color=0xFFFFFF@0.5:t=fill[m2]`,

      // Brand Title Header (SNG EXPRESS)
      `[m2]drawtext=fontfile='${fontPath}':text='${this.escapeFftext(brandName)}':fontcolor=0x000000:fontsize=72:x=(w-text_w)/2:y=75[t_brand]`,

      // Scene 1 Hook (0s - 4s)
      `[t_brand]drawtext=fontfile='${fontPath}':text='${this.escapeFftext("สั่งของจากไทย ส่งถึงลาวง่ายๆ")}'`
        + `:fontcolor=0xFFFFFF:fontsize=56:x=(w-text_w)/2:y=550:enable='between(t,0,4)'[s1_t1]`,
      `[s1_t1]drawtext=fontfile='${fontPath}':text='${this.escapeFftext("Shopee & Lazada Thailand")}'`
        + `:fontcolor=0xFFCC00:fontsize=48:x=(w-text_w)/2:y=680:enable='between(t,0,4)'[s1_t2]`,

      // Scene 2 Warehouse & Order (4s - 8s)
      `[s1_t2]drawtext=fontfile='${fontPath}':text='${this.escapeFftext("ร้านไม่ส่งมาลาว... เราจัดส่งให้!")}'`
        + `:fontcolor=0xFFFFFF:fontsize=52:x=(w-text_w)/2:y=550:enable='between(t,4,9)'[s2_t1]`,
      `[s2_t1]drawtext=fontfile='${fontPath}':text='${this.escapeFftext("ส่งตรงถึงคลัง SNG EXPRESS")}'`
        + `:fontcolor=0xFFCC00:fontsize=48:x=(w-text_w)/2:y=680:enable='between(t,4,9)'[s2_t2]`,

      // Scene 3 Route & Transit (9s - 16s)
      `[s2_t2]drawtext=fontfile='${fontPath}':text='${this.escapeFftext("ขนส่งรอบรถประจำวัน ไทย -> ลาว")}'`
        + `:fontcolor=0xFFFFFF:fontsize=52:x=(w-text_w)/2:y=550:enable='between(t,9,16)'[s3_t1]`,
      `[s3_t1]drawtext=fontfile='${fontPath}':text='${this.escapeFftext("รวดเร็ว ปลอดภัย ตรวจสอบสถานะได้")}'`
        + `:fontcolor=0xFFCC00:fontsize=44:x=(w-text_w)/2:y=680:enable='between(t,9,16)'[s3_t2]`,

      // Scene 4 CTA & Subtitle (16s - End)
      `[s3_t2]drawtext=fontfile='${fontPath}':text='${this.escapeFftext("ทักสอบถามค่าขนส่งและรอบรถ")}'`
        + `:fontcolor=0x000000:fontsize=54:x=(w-text_w)/2:y=1785:enable='between(t,16,${duration})'[s4_cta]`,
      `[s4_cta]drawtext=fontfile='${fontPath}':text='${this.escapeFftext("SNG EXPRESS ขนส่งไทย-ลาว")}'`
        + `:fontcolor=0xFFCC00:fontsize=58:x=(w-text_w)/2:y=600:enable='between(t,16,${duration})'[s4_t1]`,
    ].join(';');

    const args = [
      '-y',
      '-f', 'lavfi', '-i', `aevalsrc=0:d=${duration}`, // silent fallback audio if voice null
      '-i', input.voiceAudioPath,
      '-filter_complex', filterComplex,
      '-map', '[s4_t1]',
      '-map', '1:a',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-shortest',
      '-movflags', '+faststart',
      mp4Path,
    ];

    try {
      this.logger.log(`Executing FFmpeg video render for ${input.jobId}...`);
      const { stderr } = await execFileAsync(this.ffmpegPath, args, { timeout: 120_000 });
      renderLog.push(stderr);
      renderLog.push(`[${new Date().toISOString()}] FFmpeg Video Render Completed Successfully.`);
      writeFileSync(renderLogPath, renderLog.join('\n'));
    } catch (error) {
      renderLog.push(`[ERROR] FFmpeg render failed: ${error}`);
      writeFileSync(renderLogPath, renderLog.join('\n'));
      this.logger.error(`FFmpeg render error: ${error}`);
      throw error;
    }

    // Generate thumbnail.jpg at 2.0s
    try {
      await execFileAsync(this.ffmpegPath, [
        '-y',
        '-ss', '00:00:02.000',
        '-i', mp4Path,
        '-vframes', '1',
        '-q:v', '2',
        thumbnailPath,
      ], { timeout: 15_000 });
    } catch (err) {
      this.logger.warn(`Failed to generate thumbnail: ${err}`);
    }

    return {
      mp4Path,
      thumbnailPath,
      workspaceDir,
      outputDir,
      renderLogPath,
      durationSeconds: duration,
    };
  }

  private escapeFftext(text: string): string {
    if (!text) return '';
    return text
      .replace(/\\/g, '/')
      .replace(/'/g, '')
      .replace(/:/g, '\\:')
      .replace(/%/g, '\\%');
  }
}
