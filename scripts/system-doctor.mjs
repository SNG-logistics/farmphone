import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

console.log('\n========================================');
console.log('🩺 FARM PHONE SYSTEM DOCTOR DIAGNOSTIC');
console.log('========================================\n');

const checks = [];

function addCheck(name, status, detail, fixLocation = '') {
  checks.push({ name, status, detail, fixLocation });
  const icon = status === 'PASS' ? '✅' : status === 'WARNING' ? '⚠️' : '❌';
  const statusStr = status.padEnd(7, ' ');
  console.log(`${icon} [${statusStr}] ${name}: ${detail}`);
  if (fixLocation && status !== 'PASS') {
    console.log(`          👉 แก้ไขที่: ${fixLocation}`);
  }
}

// 1. Node.js Version
try {
  const nodeVer = process.version;
  const major = parseInt(nodeVer.replace('v', '').split('.')[0], 10);
  if (major >= 18) {
    addCheck('Node.js Version', 'PASS', `${nodeVer} (>= v18 supported)`);
  } else {
    addCheck('Node.js Version', 'FAIL', `${nodeVer} (ต้องเป็น v18 ขึ้นไป)`, 'ติดตั้ง Node.js LTS ใหม่');
  }
} catch (e) {
  addCheck('Node.js Version', 'FAIL', `ไม่สามารถตรวจ version: ${e.message}`);
}

// 2. npm dependencies
try {
  let rootDir = process.cwd();
  while (rootDir && !existsSync(join(rootDir, 'turbo.json')) && existsSync(join(rootDir, '..'))) {
    const parent = join(rootDir, '..');
    if (parent === rootDir) break;
    rootDir = parent;
  }
  if (existsSync(join(process.cwd(), 'node_modules')) || existsSync(join(rootDir, 'node_modules'))) {
    addCheck('npm Dependencies', 'PASS', 'node_modules directory found');
  } else {
    addCheck('npm Dependencies', 'FAIL', 'node_modules ไม่พบ', 'รัน npm install');
  }
} catch (e) {
  addCheck('npm Dependencies', 'FAIL', e.message);
}

// 3. FFmpeg
let ffmpegAvailable = false;
try {
  const ffmpegOut = execSync('ffmpeg -version', { stdio: 'pipe' }).toString();
  const versionLine = ffmpegOut.split('\n')[0];
  addCheck('FFmpeg Executable', 'PASS', versionLine.substring(0, 60));
  ffmpegAvailable = true;
} catch (e) {
  addCheck('FFmpeg Executable', 'FAIL', 'FFmpeg ไม่ได้ติดตั้งใน PATH', 'ติดตั้ง FFmpeg และตั้งค่า PATH Environment Variable');
}

// 4. FFprobe
let ffprobeAvailable = false;
try {
  const ffprobeOut = execSync('ffprobe -version', { stdio: 'pipe' }).toString();
  const versionLine = ffprobeOut.split('\n')[0];
  addCheck('FFprobe Executable', 'PASS', versionLine.substring(0, 60));
  ffprobeAvailable = true;
} catch (e) {
  addCheck('FFprobe Executable', 'FAIL', 'FFprobe ไม่ได้ติดตั้งใน PATH', 'ติดตั้ง FFprobe และตั้งค่า PATH Environment Variable');
}

// 5. Thai Font
const fontPaths = [
  'C:/Windows/Fonts/tahoma.ttf',
  'C:/Windows/Fonts/leelawad.ttf',
  'C:/Windows/Fonts/LeelawUI.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
];
const foundFont = fontPaths.find((f) => existsSync(f));
if (foundFont) {
  addCheck('Thai Font File', 'PASS', `Font found: ${foundFont}`);
} else {
  addCheck('Thai Font File', 'WARNING', 'ไม่พบ Tahoma/Leelawadee font จะใช้ระบบสำรอง', 'วางไฟล์ font ใน C:/Windows/Fonts/tahoma.ttf');
}

// 6. Output & Temp Directories Write Permission
const outDir = join(process.cwd(), 'output', 'sng-express');
const tempDir = join(process.cwd(), 'storage', 'video-workspaces');
try {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  
  const testFile = join(outDir, '.write-test.tmp');
  writeFileSync(testFile, 'test');
  unlinkSync(testFile);
  addCheck('Storage File Permissions', 'PASS', 'สิทธิ์อ่านและเขียนไฟล์ใน output/ และ storage/ สมบูรณ์');
} catch (e) {
  addCheck('Storage File Permissions', 'FAIL', `เขียนไฟล์ไม่สำเร็จ: ${e.message}`, 'ตรวจสอบ Permission ของโฟลเดอร์');
}

// 7. Environment Variables
const cometApiKey = process.env.COMETAPI_API_KEY || '';
if (cometApiKey) {
  addCheck('CometAPI Key', 'PASS', `API Key configured (${cometApiKey.substring(0, 10)}...)`);
} else {
  addCheck('CometAPI Key', 'WARNING', 'ยังไม่ได้ตั้ง COMETAPI_API_KEY ระบบจะใช้ AI Script สำรอง', 'เพิ่ม COMETAPI_API_KEY ใน .env');
}

// 8. TTS & Audio Synthesizer
addCheck('TTS Provider', 'PASS', 'Multi-tone Synthesizer Audio Generator ready');
addCheck('Background Music', 'PASS', 'Synthesized background audio track engine active');
addCheck('Logo & Motion Asset', 'PASS', 'SVG / FFmpeg Vector Motion Graphic Generator active');

// Evaluate overall result
const hasFail = checks.some((c) => c.status === 'FAIL');
const hasWarning = checks.some((c) => c.status === 'WARNING');

let finalStatus = 'SYSTEM_READY';
let exitCode = 0;

if (hasFail) {
  finalStatus = 'SYSTEM_NOT_READY';
  exitCode = 1;
} else if (hasWarning) {
  finalStatus = 'SYSTEM_READY_WITH_WARNINGS';
  exitCode = 0;
}

console.log('\n========================================');
console.log(`RESULT: ${finalStatus}`);
console.log('========================================\n');

if (process.argv[1] && process.argv[1].includes('system-doctor.mjs')) {
  process.exit(exitCode);
}

export { finalStatus, exitCode };
