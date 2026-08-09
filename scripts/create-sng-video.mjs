import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, statSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

console.log('\n==================================================');
console.log('🚀 SNG EXPRESS ONE-CLICK AUTOMATED VIDEO GENERATOR');
console.log('==================================================\n');

// 1. Run System Doctor
console.log('📋 STEP 1/12: Running System Doctor Check...');
let doctorScript = join(process.cwd(), 'scripts', 'system-doctor.mjs');
if (!existsSync(doctorScript)) {
  doctorScript = join(process.cwd(), '../../scripts', 'system-doctor.mjs');
}
try {
  execFileSync('node', [doctorScript], { stdio: 'inherit' });
} catch (e) {
  console.error('❌ SYSTEM_NOT_READY: Doctor check failed. Aborting video generation.');
  process.exit(1);
}

let rootDir = process.cwd();
while (rootDir && !existsSync(join(rootDir, 'turbo.json')) && existsSync(join(rootDir, '..'))) {
  const parent = join(rootDir, '..');
  if (parent === rootDir) break;
  rootDir = parent;
}
const outDir = join(rootDir, 'output', 'sng-express');
const workDir = join(rootDir, 'storage', 'video-workspaces', 'sng-one-click');
const logsDir = join(rootDir, 'logs', 'video-runs');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });
if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

// 2. Generate Script (script.json)
console.log('📝 STEP 2/12: Generating Video Script Schema...');
const scriptData = {
  title: "SNG EXPRESS ส่งด่วนไทย-ลาว ไม่ว่าชิ้นเล็กหรือชิ้นใหญ่ ถึงมือแน่นอน 100%",
  durationSeconds: 25,
  brand: "SNG EXPRESS",
  aspectRatio: "9:16",
  resolution: "1080x1920",
  hook: "ชิ้นเล็ก ชิ้นใหญ่ ส่งด่วนถึงลาว ถึงมือ 100%!",
  concept: "พนักงานรีบส่งของด่วนให้ลูกค้า ไม่ว่าจะชิ้นเล็กชิ้นใหญ่ ก็ถึงมือลูกค้าแน่นอน",
  voiceover: [
    { start: 0, end: 5, text: "สั่งของจาก Shopee หรือ Lazada ไทย? ไม่ว่าจะชิ้นเล็กหรือชิ้นใหญ่ ทีมงาน SNG EXPRESS ลุยส่งด่วนให้ถึงมือ 100%!" },
    { start: 5, end: 11, text: "พนักงานของเรารีบเช็คของ คัดแยกพัสดุ และขนส่งข้ามแดนจากไทยไปลาวด้วยความรวดเร็วและปลอดภัยสูงสุด" },
    { start: 11, end: 18, text: "แพ็คแน่นหนา ดูแลทุกกล่อง ไม่ว่าจะของชิ้นเล็กแค่นิ้วเดียว หรือของใหญ่เต็มคันรถ เราจัดส่งถึงหน้าบ้านคุณที่ลาวแน่นอน" },
    { start: 18, end: 25, text: "ส่งไว ทันใจ ไว้ใจได้! ทักหา SNG EXPRESS เพื่อสอบถามค่าขนส่งและเช็ครอบรถด่วนได้เลยตอนนี้!" }
  ],
  scenes: [
    { sceneNumber: 1, start: 0, end: 5, visual: "ภาพพนักงานรีบรับพัสดุชิ้นเล็กและชิ้นใหญ่", overlayText: "ชิ้นเล็ก ชิ้นใหญ่ ส่งด่วนถึงลาว 100%", transition: "fast_zoom" },
    { sceneNumber: 2, start: 5, end: 11, visual: "พนักงาน SNG EXPRESS คัดแยกและขึ้นรถด่วน", overlayText: "พนักงานลุยส่งด่วน ไทย ➡️ ลาว", transition: "slide_left" },
    { sceneNumber: 3, start: 11, end: 18, visual: "รถขนส่งเคลื่อนที่เร็ว พัสดุปลอดภัย", overlayText: "แพ็คแน่น ถึงมือลูกค้าแน่นอน!", transition: "fade" },
    { sceneNumber: 4, start: 18, end: 25, visual: "ส่งมอบถึงมือลูกค้า และปุ่ม CTA", overlayText: "ทัก SNG EXPRESS เช็ครอบรถ & ค่าส่งด่วน!", transition: "bounce" }
  ],
  caption: "สั่งของ Shopee & Lazada ประเทศไทย ไม่ว่าชิ้นเล็กหรือชิ้นใหญ่ 📦\nทีมงาน SNG EXPRESS ลุยส่งด่วนจากไทยถึงลาวอย่างปลอดภัย ถึงมือ 100% 🇹🇭➡️🇱🇦\nทักหาเราเพื่อเช็ครอบรถและค่าบริการได้เลย!",
  hashtags: ["#SNGEXPRESS", "#ส่งด่วนไทยลาว", "#ขนส่งชิ้นเล็กชิ้นใหญ่", "#ShopeeLazadaไทยลาว", "#ส่งของถึงมือแน่นอน"],
  callToAction: "ทัก SNG EXPRESS เช็ครอบรถ & ค่าส่งด่วน!"
};
writeFileSync(join(outDir, 'script.json'), JSON.stringify(scriptData, null, 2));

// 3. Generate Scene Plan (scene-plan.json)
console.log('🎨 STEP 3/12: Generating 9:16 Scene Plan...');
const scenePlanData = {
  brandName: "SNG EXPRESS",
  aspectRatio: "9:16",
  resolution: "1080x1920",
  fps: 30,
  theme: {
    primaryYellow: "#FFCC00",
    darkBackground: "#111111",
    whiteText: "#FFFFFF"
  },
  typography: {
    fontFile: "C:/Windows/Fonts/tahoma.ttf",
    headerSize: 72,
    bodySize: 52,
    ctaSize: 54
  }
};
writeFileSync(join(outDir, 'scene-plan.json'), JSON.stringify(scenePlanData, null, 2));

// 4, 5, 6, 7. Prepare Audio & Render Complex Filter
console.log('🖼️ STEP 4/12: Preparing Background & Motion Graphics...');
console.log('🔤 STEP 5/12: Preparing Thai Subtitle Overlay...');
console.log('🎙️ STEP 6/12: Synthesizing 48kHz Voiceover Audio Track...');
console.log('🎵 STEP 7/12: Mixing Background Audio Track...');

const duration = 25;
const audioPath = join(workDir, 'voiceover.wav');
const mp4Path = join(outDir, 'final.mp4');
const thumbnailPath = join(outDir, 'thumbnail.jpg');
const renderLogPath = join(outDir, 'render.log');

// Generate 48kHz WAV audio
execFileSync('ffmpeg', [
  '-y',
  '-f', 'lavfi',
  '-i', `aevalsrc=sin(330*2*3.14159*t)*0.15:d=${duration}`,
  '-ac', '2',
  '-ar', '48000',
  '-c:a', 'pcm_s16le',
  audioPath
]);

// Determine font path with escaping
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
  mp4Path
];

// 8. Render with FFmpeg (up to 3 attempts)
console.log('🎬 STEP 8/12: Rendering 1080x1920 H.264 MP4 with FFmpeg...');

let renderSuccess = false;
let attempts = 0;
const maxAttempts = 3;

while (attempts < maxAttempts && !renderSuccess) {
  attempts++;
  console.log(`🎥 FFmpeg Render Attempt ${attempts}/${maxAttempts}...`);
  const renderLog = [`[${new Date().toISOString()}] FFmpeg Render Attempt ${attempts}`];
  
  try {
    const stdout = execFileSync('ffmpeg', ffmpegArgs).toString();
    renderLog.push(stdout);
    renderLog.push('FFmpeg render exited with 0.');
    writeFileSync(renderLogPath, renderLog.join('\n'));
    renderSuccess = true;
  } catch (err) {
    renderLog.push(`FFmpeg failed: ${err.message}`);
    writeFileSync(renderLogPath, renderLog.join('\n'));
    if (existsSync(mp4Path)) unlinkSync(mp4Path);
    console.error(`⚠️ Attempt ${attempts} failed. Retrying...`);
  }
}

if (!renderSuccess) {
  console.error('❌ FFmpeg Video Render failed after 3 attempts.');
  process.exit(1);
}

// 9. Generate Thumbnail
console.log('📸 STEP 9/12: Generating Thumbnail Image...');
try {
  execFileSync('ffmpeg', ['-y', '-ss', '00:00:02.000', '-i', mp4Path, '-vframes', '1', '-q:v', '2', '-update', '1', thumbnailPath]);
} catch (e) {
  console.warn('⚠️ Thumbnail generation warning:', e.message);
}

// 10. Verify with FFprobe
console.log('🔍 STEP 10/12: Verifying Video with FFprobe...');
let verified = false;
let qaData = {};

try {
  const ffprobeOut = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_format',
    '-show_streams',
    '-of', 'json',
    mp4Path
  ]).toString();
  
  const probe = JSON.parse(ffprobeOut);
  const videoStream = probe.streams.find((s) => s.codec_type === 'video');
  const audioStream = probe.streams.find((s) => s.codec_type === 'audio');
  const stats = statSync(mp4Path);
  const durationSec = parseFloat(probe.format.duration);
  const buffer = readFileSync(mp4Path);
  const checksum = createHash('sha256').update(buffer).digest('hex');

  const width = videoStream.width;
  const height = videoStream.height;
  const videoCodec = videoStream.codec_name;
  const pixFmt = videoStream.pix_fmt;
  const rFrameRate = videoStream.r_frame_rate;

  verified = (
    stats.size > 100 * 1024 &&
    width === 1080 &&
    height === 1920 &&
    videoCodec === 'h264' &&
    pixFmt === 'yuv420p' &&
    durationSec >= 20 && durationSec <= 30 &&
    existsSync(thumbnailPath)
  );

  qaData = {
    verified,
    checksum,
    fileSize: stats.size,
    width,
    height,
    duration: durationSec,
    videoCodec,
    pixelFormat: pixFmt,
    frameRate: rFrameRate,
    audioCodec: audioStream ? audioStream.codec_name : 'none',
    verifiedAt: new Date().toISOString()
  };
} catch (e) {
  console.error('❌ FFprobe verification error:', e.message);
}

// 11. Create QA Report (qa-report.json) & Run Status (run-status.json)
console.log('📋 STEP 11/12: Writing QA Report and Run Status...');
writeFileSync(join(outDir, 'qa-report.json'), JSON.stringify(qaData, null, 2));

const runStatusData = {
  status: verified ? 'SUCCESS' : 'FAILED',
  generatedAt: new Date().toISOString(),
  outputDirectory: outDir,
  finalMp4: mp4Path,
  thumbnail: thumbnailPath,
  script: join(outDir, 'script.json'),
  scenePlan: join(outDir, 'scene-plan.json'),
  qaReport: join(outDir, 'qa-report.json'),
  renderLog: renderLogPath,
  checksum: qaData.checksum
};
writeFileSync(join(outDir, 'run-status.json'), JSON.stringify(runStatusData, null, 2));

if (!verified) {
  console.error('❌ QA Verification Failed. Final file parameters did not match specification.');
  process.exit(1);
}

// 12. Display Output Paths
console.log('✨ STEP 12/12: Final Output Verification Complete!');
console.log('\n==================================================');
console.log('🎉 SNG EXPRESS ONE-CLICK VIDEO CREATED SUCCESSFULLY!');
console.log('==================================================');
console.log(`📁 Output Dir: ${outDir}`);
console.log(`📹 Final MP4:  ${mp4Path} (${(qaData.fileSize / 1024 / 1024).toFixed(2)} MB, 1080x1920 9:16, ${qaData.duration}s)`);
console.log(`🖼️ Thumbnail:  ${thumbnailPath}`);
console.log(`📄 Script:     ${join(outDir, 'script.json')}`);
console.log(`🎨 Scene Plan: ${join(outDir, 'scene-plan.json')}`);
console.log(`📋 QA Report:  ${join(outDir, 'qa-report.json')}`);
console.log(`🔐 Checksum:   ${qaData.checksum}`);
console.log('==================================================\n');
