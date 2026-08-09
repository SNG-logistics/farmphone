import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

console.log('\n==================================================');
console.log('🎥 SNG EXPRESS FINAL VIDEO RENDERER (1080x1920)');
console.log('==================================================\n');

let rootDir = process.cwd();
while (rootDir && !existsSync(join(rootDir, 'turbo.json')) && existsSync(join(rootDir, '..'))) {
  const parent = join(rootDir, '..');
  if (parent === rootDir) break;
  rootDir = parent;
}

const outDir = join(rootDir, 'output', 'sng-express');
const workDir = join(rootDir, 'storage', 'video-workspaces', 'sng-one-click');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

const finalMp4Path = join(outDir, 'final.mp4');
const thumbnailPath = join(outDir, 'thumbnail.jpg');
const audioPath = join(workDir, 'voiceover.wav');
const duration = 25;

if (!existsSync(audioPath)) {
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', `aevalsrc=sin(330*2*3.14159*t)*0.15:d=${duration}`,
    '-ac', '2',
    '-ar', '48000',
    '-c:a', 'pcm_s16le',
    audioPath
  ]);
}

let fontPath = 'C\\:/Windows/Fonts/tahoma.ttf';
if (!existsSync('C:/Windows/Fonts/tahoma.ttf')) {
  if (existsSync('C:/Windows/Fonts/leelawad.ttf')) fontPath = 'C\\:/Windows/Fonts/leelawad.ttf';
}

const filterComplex = [
  `color=c=0x111111:s=1080x1920:d=${duration}:r=30[bg0]`,
  `[bg0]drawbox=x=0:y=0:w=1080:h=220:color=0xFFCC00@1:t=fill[bg1]`,
  `[bg1]drawbox=x=0:y=1700:w=1080:h=220:color=0xFFCC00@1:t=fill[bg2]`,
  `[bg2]drawbox=x='(1080/2)+(sin(t*2.5)*220)-300':y=300:w=600:h=14:color=0xFFCC00@0.9:t=fill[m1]`,
  `[m1]drawbox=x='(1080/2)-(sin(t*2.5)*220)-300':y=335:w=600:h=8:color=0xFFFFFF@0.6:t=fill[m2]`,
  `[m2]drawtext=fontfile='${fontPath}':text='SNG EXPRESS':fontcolor=0x000000:fontsize=72:x=(w-text_w)/2:y=75[t_brand]`,
  `[t_brand]drawtext=fontfile='${fontPath}':text='ชิ้นเล็ก ชิ้นใหญ่ ส่งด่วน 100\\\\%':fontcolor=0xFFCC00:fontsize=56:x=(w-text_w)/2:y=540:enable='between(t,0,5)'[s1_t1]`,
  `[s1_t1]drawtext=fontfile='${fontPath}':text='สั่ง Shopee & Lazada ส่งถึงลาว':fontcolor=0xFFFFFF:fontsize=48:x=(w-text_w)/2:y=670:enable='between(t,0,5)'[s1_t2]`,
  `[s1_t2]drawtext=fontfile='${fontPath}':text='พนักงานลุยส่งด่วน ไทย ➡️ ลาว':fontcolor=0xFFCC00:fontsize=54:x=(w-text_w)/2:y=540:enable='between(t,5,11)'[s2_t1]`,
  `[s2_t1]drawtext=fontfile='${fontPath}':text='รีบเช็คของ คัดแยก ขนส่งทันที':fontcolor=0xFFFFFF:fontsize=46:x=(w-text_w)/2:y=670:enable='between(t,5,11)'[s2_t2]`,
  `[s2_t2]drawtext=fontfile='${fontPath}':text='แพ็คแน่น ถึงมือลูกค้าแน่นอน!':fontcolor=0xFFCC00:fontsize=54:x=(w-text_w)/2:y=540:enable='between(t,11,18)'[s3_t1]`,
  `[s3_t1]drawtext=fontfile='${fontPath}':text='ดูแลทุกกล่อง ส่งตรงถึงหน้าบ้าน':fontcolor=0xFFFFFF:fontsize=46:x=(w-text_w)/2:y=670:enable='between(t,11,18)'[s3_t2]`,
  `[s3_t2]drawtext=fontfile='${fontPath}':text='ทัก SNG EXPRESS เช็ครอบรถด่วน!':fontcolor=0x000000:fontsize=52:x=(w-text_w)/2:y=1785:enable='between(t,18,${duration})'[s4_cta]`,
  `[s4_cta]drawtext=fontfile='${fontPath}':text='ส่งไว ทันใจ ไว้ใจได้ 100\\\\%':fontcolor=0xFFCC00:fontsize=56:x=(w-text_w)/2:y=600:enable='between(t,18,${duration})'[s4_t1]`
].join(';');

const ffmpegArgs = [
  '-y',
  '-f', 'lavfi', '-i', `aevalsrc=0:d=${duration}`,
  '-i', audioPath,
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
  finalMp4Path
];

console.log('🎬 Rendering 1080x1920 Final MP4...');
execFileSync('ffmpeg', ffmpegArgs);

// Generate Thumbnail
execFileSync('ffmpeg', ['-y', '-ss', '00:00:02.000', '-i', finalMp4Path, '-vframes', '1', '-q:v', '2', '-update', '1', thumbnailPath]);

const stats = statSync(finalMp4Path);
console.log(`✅ Final MP4 Rendered: ${finalMp4Path} (${(stats.size / 1024 / 1024).toFixed(2)} MB)\n`);
