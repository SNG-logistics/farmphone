#!/usr/bin/env node
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { promisify } from 'util';
import OpenAI from 'openai';

const execFileAsync = promisify(execFile);

function loadDotEnv() {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fsSync.existsSync(envPath)) {
      const content = fsSync.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch {}
}

loadDotEnv();

function resolveAdbPath() {
  const envPath = process.env.ADB_PATH;
  if (envPath && fsSync.existsSync(envPath)) return envPath;
  const candidates = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'platform-tools', 'adb.exe') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'platform-tools', 'adb.exe') : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return 'adb';
}

const adbPath = resolveAdbPath();
const cometApiKey = process.env.COMETAPI_API_KEY;
const cometBaseUrl = process.env.COMETAPI_BASE_URL || 'https://api.cometapi.com/v1';

const args = process.argv.slice(2);
const postUrl = args.find((a) => a.startsWith('http')) || 'https://www.tiktok.com';
const isDryRun = args.includes('--dry-run');

console.log('=====================================================');
console.log('🔄 CROSS-FARM MUTUAL ENGAGEMENT MATRIX ENGINE');
console.log('=====================================================');
console.log(`[MATRIX] Target Post URL: ${postUrl}`);
console.log(`[MATRIX] Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE MUTUAL ENGAGEMENT'}`);

const commentPool = [
  'สั่งซื้อเรียบร้อยครับ ส่งไวมาก!',
  'สินค้าคุณภาพดีมาก แนะนำร้านนี้เลยครับ',
  'กดใส่ตะกร้าตามแล้วครับ คุ้มสุดๆ',
  'แพ็คของดีมาก ได้รับของครบถ้วนครับ',
  'ร้านบริการดี ตอบไว จัดส่งรวดเร็วครับ',
];

async function getScreenSize() {
  try {
    const { stdout } = await execFileAsync(adbPath, ['shell', 'wm', 'size']);
    const match = stdout.match(/Physical size:\s*(\d+)x(\d+)/i);
    if (match) return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
  } catch {}
  return { width: 720, height: 1600 };
}

async function runMutualEngagement() {
  const screenSize = await getScreenSize();
  console.log(`[MATRIX] Screen Resolution: ${screenSize.width}x${screenSize.height}`);

  if (isDryRun) {
    console.log('[DRY-RUN] Simulating 100% Watch Time retention boost (20s)...');
    console.log('[DRY-RUN] Simulating Like/Heart tap action...');
    console.log('[DRY-RUN] Simulating positive comment posting...');
    console.log('[DRY-RUN] Simulating Repost / Retweet share action...');
    console.log('✅ [DRY-RUN] Cross-farm mutual engagement completed successfully!');
    return;
  }

  try {
    // 1. Open Target Post URL in App
    console.log(`[MATRIX] 1/4 Opening post link on device...`);
    await execFileAsync(adbPath, ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', postUrl]);
    await new Promise((r) => setTimeout(r, 4000));

    // 2. Watch Time Retention Booster (Wait 15s to simulate 100% view)
    console.log(`[MATRIX] 2/4 Boosting Retention Rate: Watching video for 15s (100% Watch Time)...`);
    await new Promise((r) => setTimeout(r, 15000));

    // 3. Auto Like (Heart)
    const likeX = Math.round(0.92 * screenSize.width);
    const likeY = Math.round(0.55 * screenSize.height);
    console.log(`[MATRIX] 3/4 Tapping Like / Heart at X:${likeX} Y:${likeY}`);
    await execFileAsync(adbPath, ['shell', 'input', 'tap', String(likeX), String(likeY)]);
    await new Promise((r) => setTimeout(r, 1500));

    // 4. Auto Comment
    const selectedComment = commentPool[Math.floor(Math.random() * commentPool.length)];
    const commentX = Math.round(0.92 * screenSize.width);
    const commentY = Math.round(0.63 * screenSize.height);
    console.log(`[MATRIX] 4/4 Opening Comment drawer & typing: "${selectedComment}"`);
    await execFileAsync(adbPath, ['shell', 'input', 'tap', String(commentX), String(commentY)]);
    await new Promise((r) => setTimeout(r, 2000));

    // Input comment text
    await execFileAsync(adbPath, ['shell', 'input', 'text', String(selectedComment)]);
    await new Promise((r) => setTimeout(r, 1000));
    await execFileAsync(adbPath, ['shell', 'input', 'keyevent', '66']); // ENTER

    // 5. Auto Repost / Share
    const shareX = Math.round(0.92 * screenSize.width);
    const shareY = Math.round(0.71 * screenSize.height);
    console.log(`[MATRIX] 5/5 Tapping Share / Repost button...`);
    await execFileAsync(adbPath, ['shell', 'input', 'tap', String(shareX), String(shareY)]);
    await new Promise((r) => setTimeout(r, 2000));

    // Tap Repost icon (center left area of share sheet)
    const repostX = Math.round(0.20 * screenSize.width);
    const repostY = Math.round(0.75 * screenSize.height);
    await execFileAsync(adbPath, ['shell', 'input', 'tap', String(repostX), String(repostY)]);

    console.log('\n=====================================================');
    console.log('✅ CROSS-FARM MUTUAL ENGAGEMENT COMPLETED SUCCESSFULLY');
    console.log('=====================================================');
  } catch (error) {
    console.error(`[MATRIX ERROR] ${error.message}`);
  }
}

runMutualEngagement();
