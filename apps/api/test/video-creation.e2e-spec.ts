import { existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';
import { DEVICE_COMMANDS } from '../src/jobs/single-device-commands.service';

describe('VIDEO_CREATE Automated Video Creation Pipeline (E2E)', () => {
  it('1. Should include VIDEO_CREATE in DEVICE_COMMANDS command registry', () => {
    expect(DEVICE_COMMANDS).toContain('VIDEO_CREATE');
  });

  it('2. Should execute standalone video script (video:create:sng) and generate valid MP4 verified by ffprobe', () => {
    const scriptPath = join(__dirname, '../../../scripts/create-sng-video.mjs');
    expect(existsSync(scriptPath)).toBe(true);

    // Execute SNG Express video generator script
    execFileSync('node', [scriptPath], { stdio: 'inherit' });

    const finalMp4Path = join(process.cwd(), 'storage', 'generated-videos', 'default-org', 'job-sng-express-test', 'final.mp4');
    const thumbnailPath = join(process.cwd(), 'storage', 'generated-videos', 'default-org', 'job-sng-express-test', 'thumbnail.jpg');
    const qaReportPath = join(process.cwd(), 'storage', 'generated-videos', 'default-org', 'job-sng-express-test', 'qa-report.json');

    expect(existsSync(finalMp4Path)).toBe(true);
    expect(existsSync(thumbnailPath)).toBe(true);
    expect(existsSync(qaReportPath)).toBe(true);

    const stats = statSync(finalMp4Path);
    expect(stats.size).toBeGreaterThan(100 * 1024); // > 100 KB

    const qaReport = JSON.parse(readFileSync(qaReportPath, 'utf8'));
    expect(qaReport.verified).toBe(true);
    expect(qaReport.width).toBe(1080);
    expect(qaReport.height).toBe(1920);
    expect(qaReport.videoCodec).toBe('h264');
    expect(qaReport.duration).toBeGreaterThanOrEqual(10);
  });
});
