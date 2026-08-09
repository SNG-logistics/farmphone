#!/usr/bin/env node
import { execFile, exec } from 'child_process';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

// Load .env file automatically
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
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const visionModelName = process.env.GEMINI_VISION_MODEL || 'gemini-1.5-flash';

const args = process.argv.slice(2);
const platformArg = (args[0] || 'TikTok').toLowerCase();
const captionArg = args[1] || 'โปรโมชั่นพิเศษสุดคุ้มวันนี้! #สินค้าขายดี #ส่งฟรี #แจกโค้ด';
const isDryRun = args.includes('--dry-run');

console.log('=====================================================');
console.log('🎬 1-DEVICE AI VIRAL VIDEO & AUTO-POST PIPELINE');
console.log('=====================================================');
console.log(`[PIPELINE] Target Platform: ${platformArg.toUpperCase()}`);
console.log(`[PIPELINE] Caption text: "${captionArg}"`);
console.log(`[PIPELINE] Mode: ${isDryRun ? 'DRY-RUN (Simulated)' : 'LIVE EXECUTION'}`);

const cometClient = cometApiKey ? new OpenAI({ apiKey: cometApiKey, baseURL: cometBaseUrl }) : null;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Package names map
const packageMap = {
  tiktok: 'com.zhiliaoapp.musically',
  facebook: 'com.facebook.katana',
  instagram: 'com.instagram.android',
};

async function queryCometWithFallback(messages, initialModel) {
  const fallbackModels = [initialModel, 'gpt-4o', 'gpt-4o-mini', 'gemini-1.5-pro'].filter(
    (m, i, arr) => arr.indexOf(m) === i,
  );

  let lastError;
  for (const modelName of fallbackModels) {
    try {
      if (modelName !== initialModel) {
        console.log(`[VISION AI] Retrying with fallback Vision model: ${modelName}...`);
      }
      const response = await cometClient.chat.completions.create({
        model: modelName,
        messages,
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content || '';
      if (content) {
        if (modelName !== initialModel) {
          console.log(`[VISION AI] Fallback model ${modelName} succeeded.`);
        }
        return content;
      }
    } catch (error) {
      lastError = error;
      const errorMsg = error.message || String(error);
      console.warn(`[VISION AI] Model ${modelName} returned error: ${errorMsg}`);
      if (
        errorMsg.includes('no available channel') ||
        errorMsg.includes('distributor') ||
        errorMsg.includes('503') ||
        errorMsg.includes('404')
      ) {
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// STEP 1: Render AI Viral Video
async function step1RenderVideo() {
  console.log('\n[STEP 1/4] 🎨 Rendering AI Viral Video...');
  const outputDir = path.join(process.cwd(), 'output');
  await fs.mkdir(outputDir, { recursive: true });
  const targetVideoPath = path.join(outputDir, 'viral_video_trial.mp4');

  try {
    console.log(`[STEP 1/4] Running create-sng-video script...`);
    await execAsync('node scripts/create-sng-video.mjs');
  } catch (err) {
    console.warn(`[STEP 1/4] Video render info: ${err.message}`);
  }

  // Auto-locate generated MP4 file
  const candidatePaths = [
    targetVideoPath,
    path.join(outputDir, 'sng-express', 'sng_express_final.mp4'),
    path.join(outputDir, 'sng-express', 'final.mp4'),
  ];

  let foundPath = candidatePaths.find((p) => fsSync.existsSync(p));

  if (!foundPath) {
    const sngExpressDir = path.join(outputDir, 'sng-express');
    if (fsSync.existsSync(sngExpressDir)) {
      const files = await fs.readdir(sngExpressDir);
      const mp4File = files.find((f) => f.endsWith('.mp4'));
      if (mp4File) foundPath = path.join(sngExpressDir, mp4File);
    }
  }

  if (!foundPath) {
    const files = await fs.readdir(outputDir);
    const mp4File = files.find((f) => f.endsWith('.mp4'));
    if (mp4File) foundPath = path.join(outputDir, mp4File);
  }

  if (foundPath && fsSync.existsSync(foundPath)) {
    if (foundPath !== targetVideoPath) {
      await fs.copyFile(foundPath, targetVideoPath);
    }
    console.log(`[STEP 1/4] ✅ AI Video ready at ${targetVideoPath}`);
    return targetVideoPath;
  }

  throw new Error(`No rendered video file found in output directory.`);
}

// STEP 2: Transfer Video to Android Phone via ADB
async function step2PushVideoToDevice(localVideoPath) {
  console.log('\n[STEP 2/4] 📱 Pushing Video File to Android Phone via ADB...');
  const remoteDir = '/sdcard/DCIM/Camera/';
  const remoteFileName = `viral_${Date.now()}.mp4`;
  const remotePath = `${remoteDir}${remoteFileName}`;

  if (isDryRun) {
    console.log(`[DRY-RUN] Would execute: adb push ${localVideoPath} ${remotePath}`);
    return remotePath;
  }

  // Ensure remote directory exists
  await execFileAsync(adbPath, ['shell', 'mkdir', '-p', remoteDir]);
  console.log(`[STEP 2/4] Uploading video to device: ${remotePath}`);
  await execFileAsync(adbPath, ['push', localVideoPath, remotePath]);

  // Broadcast media scanner so Android Photos/Gallery detects it immediately
  console.log(`[STEP 2/4] Triggering Media Scanner Broadcast...`);
  await execFileAsync(adbPath, [
    'shell',
    'am',
    'broadcast',
    '-a',
    'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
    '-d',
    `file://${remotePath}`,
  ]);

  console.log(`[STEP 2/4] ✅ Video file transferred & scanned into Phone Media Store.`);
  return remotePath;
}

// STEP 3: Launch Target Social Media App
async function step3LaunchApp() {
  console.log(`\n[STEP 3/4] 🚀 Launching Target Social App: ${platformArg.toUpperCase()}...`);
  const pkg = packageMap[platformArg] || packageMap.tiktok;

  if (isDryRun) {
    console.log(`[DRY-RUN] Would launch package: ${pkg}`);
    return;
  }

  try {
    await execFileAsync(adbPath, ['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']);
    console.log(`[STEP 3/4] ✅ App launched. Waiting 4 seconds for UI initialization...`);
    await new Promise((r) => setTimeout(r, 4000));
  } catch (error) {
    console.warn(`[STEP 3/4] Could not launch package ${pkg} automatically: ${error.message}`);
  }
}

// STEP 4: Vision AI Auto-Post Loop
async function step4VisionAutoPostLoop() {
  console.log('\n[STEP 4/4] 🤖 Starting Vision AI Auto-Posting Loop...');

  if (isDryRun) {
    console.log(`[DRY-RUN] Simulating Vision AI screen inspection & post interaction.`);
    console.log(`[DRY-RUN] ✅ Auto-post pipeline dry run completed successfully!`);
    return;
  }

  // Get resolution
  const { stdout: sizeOut } = await execFileAsync(adbPath, ['shell', 'wm', 'size']);
  const match = sizeOut.match(/Physical size:\s*(\d+)x(\d+)/i);
  const screenSize = match ? { width: parseInt(match[1], 10), height: parseInt(match[2], 10) } : { width: 1080, height: 1920 };

  console.log(`[STEP 4/4] Screen Resolution: ${screenSize.width}x${screenSize.height}`);

  // Max 5 auto-post action iterations
  for (let i = 1; i <= 5; i++) {
    console.log(`\n--- Iteration ${i}/5: Inspecting Screen ---`);
    const tempCap = '/sdcard/post_screencap.png';
    await execFileAsync(adbPath, ['shell', 'screencap', '-p', tempCap]);
    const localCap = path.join(process.cwd(), 'output', 'post_screencap.png');
    await execFileAsync(adbPath, ['pull', tempCap, localCap]);
    const base64Data = (await fs.readFile(localCap)).toString('base64');

    const goalPrompt = `You are an AI Social Media Auto-Poster on an Android phone for platform "${platformArg.toUpperCase()}".
Your task is to post the newly added video from the gallery with this caption: "${captionArg}"

Look at the screenshot and find the next step to finish posting:
- Look for "+" (Create/Post) button, "Upload / Gallery" button, "Next / Post" button, or caption input field.
- If you see a text input for caption, action should be "type" with text: "${captionArg}".
- If posting is complete or already on confirmation screen, action is "finish".

Return JSON:
{
  "action": "tap | type | key_event | wait | finish",
  "targetLabel": "Button or element name",
  "x": 50, // center x percentage (0-100)
  "y": 80, // center y percentage (0-100)
  "text": "Text to type if action is type",
  "reasoning": "Reasoning for action"
}`;

    let responseText = '';
    if (cometClient) {
      responseText = await queryCometWithFallback(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: goalPrompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } },
            ],
          },
        ],
        visionModelName,
      );
    } else if (genAI) {
      const model = genAI.getGenerativeModel({ model: visionModelName, generationConfig: { responseMimeType: 'application/json' } });
      const res = await model.generateContent([goalPrompt, { inlineData: { data: base64Data, mimeType: 'image/png' } }]);
      responseText = res.response.text();
    }

    const decision = JSON.parse(responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim());
    console.log(`[VISION AI DECISION] Action: ${decision.action} — ${decision.reasoning}`);

    if (decision.action === 'finish') {
      console.log(`[STEP 4/4] 🎉 Video Post Workflow Completed!`);
      break;
    }

    if (decision.action === 'tap') {
      const px = Math.round((decision.x / 100) * screenSize.width);
      const py = Math.round((decision.y / 100) * screenSize.height);
      console.log(`[ADB EXECUTE] Tapping "${decision.targetLabel || 'element'}" at X:${px} Y:${py}`);
      await execFileAsync(adbPath, ['shell', 'input', 'tap', String(px), String(py)]);
    } else if (decision.action === 'type') {
      console.log(`[ADB EXECUTE] Typing text: "${decision.text || captionArg}"`);
      await execFileAsync(adbPath, ['shell', 'input', 'text', String(decision.text || captionArg)]);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }
}

async function runPipeline() {
  try {
    const videoPath = await step1RenderVideo();
    await step2PushVideoToDevice(videoPath);
    await step3LaunchApp();
    await step4VisionAutoPostLoop();

    console.log('\n=====================================================');
    console.log('✅ 1-DEVICE AUTO-POST PIPELINE EXECUTED SUCCESSFULLY');
    console.log('=====================================================');
  } catch (error) {
    console.error(`\n[PIPELINE ERROR] ${error.message}`);
    process.exit(1);
  }
}

runPipeline();
