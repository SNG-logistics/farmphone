#!/usr/bin/env node
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

const execFileAsync = promisify(execFile);

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

const adbPath = resolveAdbPath();
const cometApiKey = process.env.COMETAPI_API_KEY;
const cometBaseUrl = process.env.COMETAPI_BASE_URL || 'https://api.cometapi.com/v1';
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

if (!cometApiKey && !geminiApiKey) {
  console.error('[ERROR] COMETAPI_API_KEY or GEMINI_API_KEY is required to run Gemini Screen Agent.');
  console.error('Please set COMETAPI_API_KEY or GEMINI_API_KEY in your environment or .env file.');
  process.exit(1);
}

const initialVisionModel = process.env.GEMINI_VISION_MODEL || 'gemini-1.5-flash';
const goal = process.argv.slice(2).join(' ') || 'Inspect home screen and check status';

console.log(`[GEMINI AGENT] Initializing Vision Agent`);
if (cometApiKey) {
  console.log(`[GEMINI AGENT] Provider: CometAPI (${cometBaseUrl})`);
} else {
  console.log(`[GEMINI AGENT] Provider: Google Generative AI Direct`);
}
console.log(`[GEMINI AGENT] Vision Model: ${initialVisionModel}`);
console.log(`[GEMINI AGENT] Target Goal: "${goal}"`);

const cometClient = cometApiKey ? new OpenAI({ apiKey: cometApiKey, baseURL: cometBaseUrl }) : null;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

async function queryCometWithFallback(messages, initialModel) {
  const fallbackModels = [initialModel, 'gpt-4o', 'gpt-4o-mini', 'gemini-1.5-pro'].filter(
    (m, i, arr) => arr.indexOf(m) === i,
  );

  let lastError;
  for (const modelName of fallbackModels) {
    try {
      if (modelName !== initialModel) {
        console.log(`[GEMINI AGENT] Retrying with fallback Vision model: ${modelName}...`);
      }
      const response = await cometClient.chat.completions.create({
        model: modelName,
        messages,
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content || '';
      if (content) {
        if (modelName !== initialModel) {
          console.log(`[GEMINI AGENT] Succeeded with fallback model: ${modelName}`);
        }
        return content;
      }
    } catch (error) {
      lastError = error;
      const errorMsg = error.message || String(error);
      console.warn(`[GEMINI AGENT] Model ${modelName} failed on CometAPI: ${errorMsg}`);
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

async function captureScreenshotBuffer() {
  const tempPath = '/sdcard/farmphone_screencap.png';
  await execFileAsync(adbPath, ['shell', 'screencap', '-p', tempPath]);
  const localFile = path.join(process.cwd(), 'output', 'current_screencap.png');
  await fs.mkdir(path.dirname(localFile), { recursive: true });
  await execFileAsync(adbPath, ['pull', tempPath, localFile]);
  const buffer = await fs.readFile(localFile);
  return buffer;
}

async function getScreenSize() {
  const { stdout } = await execFileAsync(adbPath, ['shell', 'wm', 'size']);
  const match = stdout.match(/Physical size:\s*(\d+)x(\d+)/i);
  if (match) {
    return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
  }
  return { width: 1080, height: 1920 };
}

async function executeAction(action, screenSize) {
  const { width, height } = screenSize;

  if (action.action === 'tap') {
    const pixelX = Math.round((action.x / 100) * width);
    const pixelY = Math.round((action.y / 100) * height);
    console.log(`[ADB EXECUTE] Tapping target "${action.targetLabel || 'element'}" at X:${pixelX} Y:${pixelY} (${action.x}%, ${action.y}%)`);
    await execFileAsync(adbPath, ['shell', 'input', 'tap', String(pixelX), String(pixelY)]);
  } else if (action.action === 'swipe') {
    const x1 = Math.round(((action.x || 50) / 100) * width);
    const y1 = Math.round(((action.y || 80) / 100) * height);
    const x2 = Math.round(((action.endX || 50) / 100) * width);
    const y2 = Math.round(((action.endY || 20) / 100) * height);
    console.log(`[ADB EXECUTE] Swiping from (${x1},${y1}) to (${x2},${y2})`);
    await execFileAsync(adbPath, ['shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), '300']);
  } else if (action.action === 'type' && action.text) {
    console.log(`[ADB EXECUTE] Typing text: "${action.text}"`);
    await execFileAsync(adbPath, ['shell', 'input', 'text', String(action.text)]);
  } else if (action.action === 'key_event') {
    console.log(`[ADB EXECUTE] Key event: ${action.keyCode}`);
    const key = String(action.keyCode).toUpperCase();
    const codeMap = { BACK: 4, HOME: 3, ENTER: 66, TAB: 61 };
    const code = codeMap[key] || action.keyCode;
    await execFileAsync(adbPath, ['shell', 'input', 'keyevent', String(code)]);
  } else {
    console.log(`[ADB EXECUTE] Action: ${action.action} — ${action.reasoning || ''}`);
  }
}

async function runLoop() {
  const screenSize = await getScreenSize();
  console.log(`[GEMINI AGENT] Detected Screen Resolution: ${screenSize.width}x${screenSize.height}`);

  try {
    console.log(`[GEMINI AGENT] Capturing screenshot via ADB...`);
    const screenshotBuffer = await captureScreenshotBuffer();
    const base64Data = screenshotBuffer.toString('base64');

    const prompt = `You are an AI Device Agent controlling an Android smartphone via ADB touch actions.
Your goal is: "${goal}"

Inspect the screenshot and determine the single next ADB action to reach the goal.
Calculate exact tap/swipe coordinates in percentages (x: 0 to 100, y: 0 to 100) relative to screen dimensions (${screenSize.width}x${screenSize.height}).

Return JSON:
{
  "action": "tap | swipe | type | key_event | wait | finish | unknown",
  "targetLabel": "Element name",
  "x": 50,
  "y": 75,
  "endX": 50,
  "endY": 25,
  "text": "Text if action is type",
  "keyCode": "BACK | HOME | ENTER",
  "confidence": 0.95,
  "reasoning": "Why this action was chosen"
}`;

    console.log(`[GEMINI AGENT] Querying Vision AI...`);
    let responseText = '';

    if (cometClient) {
      responseText = await queryCometWithFallback(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Data}` } },
            ],
          },
        ],
        initialVisionModel,
      );
    } else if (genAI) {
      const model = genAI.getGenerativeModel({
        model: initialVisionModel,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64Data, mimeType: 'image/png' } },
      ]);
      responseText = result.response.text();
    }

    const cleanedJson = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const decision = JSON.parse(cleanedJson);

    console.log('\n================ AI DECISION ================');
    console.log(JSON.stringify(decision, null, 2));
    console.log('=============================================\n');

    await executeAction(decision, screenSize);
    console.log('[GEMINI AGENT] Action completed successfully.');
  } catch (error) {
    console.error(`[GEMINI AGENT ERROR] ${error.message}`);
  }
}

runLoop();
