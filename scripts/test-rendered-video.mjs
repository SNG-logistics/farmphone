import { execFileSync } from 'child_process';
import { existsSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

console.log('\n========================================');
console.log('🧪 SNG EXPRESS RENDERED VIDEO TESTER');
console.log('========================================\n');

let rootDir = process.cwd();
while (rootDir && !existsSync(join(rootDir, 'turbo.json')) && existsSync(join(rootDir, '..'))) {
  const parent = join(rootDir, '..');
  if (parent === rootDir) break;
  rootDir = parent;
}
const outDir = join(rootDir, 'output', 'sng-express');
const mp4Path = join(outDir, 'final.mp4');
const thumbPath = join(outDir, 'thumbnail.jpg');

const errors = [];

// 1. File exists
if (!existsSync(mp4Path)) {
  errors.push(`Missing final.mp4 at: ${mp4Path}`);
}

// 2. Thumbnail exists
if (!existsSync(thumbPath)) {
  errors.push(`Missing thumbnail.jpg at: ${thumbPath}`);
}

if (errors.length > 0) {
  console.error('❌ TEST FAILED: Missing output files');
  errors.forEach((e) => console.error(`   - ${e}`));
  process.exit(1);
}

// 3. File size > 100 KB
const stats = statSync(mp4Path);
if (stats.size < 100 * 1024) {
  errors.push(`File size (${stats.size} bytes) is less than 100 KB`);
}

// 4. Probe video streams
try {
  const probeOut = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_format',
    '-show_streams',
    '-of', 'json',
    mp4Path
  ]).toString();

  const probe = JSON.parse(probeOut);
  const videoStream = probe.streams.find((s) => s.codec_type === 'video');

  if (!videoStream) {
    errors.push('No video stream found in container');
  } else {
    // 5. Codec H.264
    if (videoStream.codec_name !== 'h264') {
      errors.push(`Video codec is '${videoStream.codec_name}', expected 'h264'`);
    }

    // 6. Pixel Format yuv420p
    if (videoStream.pix_fmt !== 'yuv420p') {
      errors.push(`Pixel format is '${videoStream.pix_fmt}', expected 'yuv420p'`);
    }

    // 7. Resolution 1080x1920
    if (videoStream.width !== 1080 || videoStream.height !== 1920) {
      errors.push(`Resolution is ${videoStream.width}x${videoStream.height}, expected 1080x1920`);
    }

    // 8. Duration 20-30s
    const duration = parseFloat(probe.format.duration || videoStream.duration);
    if (duration < 20 || duration > 30) {
      errors.push(`Duration is ${duration}s, expected between 20s and 30s`);
    }

    // 9. Frame rate 30 FPS
    const frameRateStr = videoStream.r_frame_rate || videoStream.avg_frame_rate;
    const [num, den] = frameRateStr.split('/').map(Number);
    const fps = den ? num / den : num;
    if (Math.abs(fps - 30) > 1) {
      errors.push(`Frame rate is ${fps} fps, expected 30 fps`);
    }
  }
} catch (e) {
  errors.push(`ffprobe execution failed: ${e.message}`);
}

console.log(`📹 Video File: ${mp4Path}`);
console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB (${stats.size} bytes)`);

if (errors.length === 0) {
  console.log('\n✅ ALL 9 VIDEO VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================\n');
  process.exit(0);
} else {
  console.error('\n❌ VIDEO VERIFICATION FAILED:');
  errors.forEach((e) => console.error(`   - ${e}`));
  console.log('========================================\n');
  process.exit(1);
}
