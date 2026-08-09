import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

console.log('\n==================================================');
console.log('🎥 SNG EXPRESS PREVIEW VIDEO RENDERER (540x960)');
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

const previewMp4Path = join(outDir, 'preview.mp4');
const audioPath = join(workDir, 'voiceover.wav');
const duration = 25;

// Generate audio if missing
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
  `color=c=0x111111:s=540x960:d=${duration}:r=30[bg0]`,
  `[bg0]drawbox=x=0:y=0:w=540:h=110:color=0xFFCC00@1:t=fill[bg1]`,
  `[bg1]drawbox=x=0:y=850:w=540:h=110:color=0xFFCC00@1:t=fill[bg2]`,
  `[bg2]drawbox=x='(540/2)+(sin(t*2.5)*110)-150':y=150:w=300:h=7:color=0xFFCC00@0.9:t=fill[m1]`,
  `[m1]drawtext=fontfile='${fontPath}':text='SNG EXPRESS':fontcolor=0x000000:fontsize=36:x=(w-text_w)/2:y=35[t_brand]`,
  `[t_brand]drawtext=fontfile='${fontPath}':text='ชิ้นเล็ก ชิ้นใหญ่ ส่งด่วน 100\\\\%':fontcolor=0xFFCC00:fontsize=28:x=(w-text_w)/2:y=270:enable='between(t,0,5)'[s1_t1]`,
  `[s1_t1]drawtext=fontfile='${fontPath}':text='สั่ง Shopee & Lazada ส่งถึงลาว':fontcolor=0xFFFFFF:fontsize=24:x=(w-text_w)/2:y=335:enable='between(t,0,5)'[s1_t2]`,
  `[s1_t2]drawtext=fontfile='${fontPath}':text='พนักงานลุยส่งด่วน ไทย ➡️ ลาว':fontcolor=0xFFCC00:fontsize=27:x=(w-text_w)/2:y=270:enable='between(t,5,11)'[s2_t1]`,
  `[s2_t1]drawtext=fontfile='${fontPath}':text='รีบเช็คของ คัดแยก ขนส่งทันที':fontcolor=0xFFFFFF:fontsize=23:x=(w-text_w)/2:y=335:enable='between(t,5,11)'[s2_t2]`,
  `[s2_t2]drawtext=fontfile='${fontPath}':text='แพ็คแน่น ถึงมือลูกค้าแน่นอน!':fontcolor=0xFFCC00:fontsize=27:x=(w-text_w)/2:y=270:enable='between(t,11,18)'[s3_t1]`,
  `[s3_t1]drawtext=fontfile='${fontPath}':text='ดูแลทุกกล่อง ส่งตรงถึงหน้าบ้าน':fontcolor=0xFFFFFF:fontsize=23:x=(w-text_w)/2:y=335:enable='between(t,11,18)'[s3_t2]`,
  `[s3_t2]drawtext=fontfile='${fontPath}':text='ทัก SNG EXPRESS เช็ครอบรถด่วน!':fontcolor=0x000000:fontsize=26:x=(w-text_w)/2:y=890:enable='between(t,18,${duration})'[s4_cta]`,
  `[s4_cta]drawtext=fontfile='${fontPath}':text='ส่งไว ทันใจ ไว้ใจได้ 100\\\\%':fontcolor=0xFFCC00:fontsize=28:x=(w-text_w)/2:y=300:enable='between(t,18,${duration})'[s4_t1]`
].join(';');

const ffmpegArgs = [
  '-y',
  '-f', 'lavfi', '-i', `aevalsrc=0:d=${duration}`,
  '-i', audioPath,
  '-filter_complex', filterComplex,
  '-map', '[s4_t1]',
  '-map', '1:a',
  '-c:v', 'libx264',
  '-preset', 'ultrafast',
  '-crf', '26',
  '-pix_fmt', 'yuv420p',
  '-r', '30',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-ar', '48000',
  '-shortest',
  '-movflags', '+faststart',
  previewMp4Path
];

console.log('⚡ Rendering 540x960 Preview MP4...');
execFileSync('ffmpeg', ffmpegArgs);

const stats = statSync(previewMp4Path);
console.log(`✅ Preview MP4 Rendered: ${previewMp4Path} (${(stats.size / 1024 / 1024).toFixed(2)} MB)\n`);
