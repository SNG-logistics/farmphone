#!/usr/bin/env node
/**
 * ตรวจสอบสถานะ ADB Bridge — ใช้ตอนโทรศัพท์เชื่อมต่อไม่ขึ้น หรือต้องการเช็คว่า bridge พร้อมใช้
 *
 * วิธีใช้:
 *   npm run bridge:check
 *   node scripts/check-adb-bridge.mjs
 *
 * ฟีเจอร์:
 *   - ตรวจหา adb.exe อัตโนมัติ (หาใน Android SDK platform-tools)
 *   - แสดงรายการอุปกรณ์ที่ต่อ USB
 *   - ตั้งค่า `adb reverse tcp:3200 tcp:3200` อัตโนมัติถ้ายังไม่มี
 *   - ทดสอบ HTTP ไปยัง bridge ที่ localhost:3200
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const BRIDGE_PORT = Number(process.env.ADB_BRIDGE_PORT || '3200');
const BRIDGE_BASE_URL = `http://${process.env.ADB_BRIDGE_HOST || '127.0.0.1'}:${BRIDGE_PORT}`;

function log(level, message) {
  const prefix = { info: 'ℹ️', ok: '✅', warn: '⚠️', error: '❌' }[level] || 'ℹ️';
  console.log(`${prefix} ${message}`);
}

function resolveAdbPath() {
  const configured = process.env.ADB_PATH;
  if (configured && existsSync(configured)) return configured;

  const home = os.homedir();
  const candidates = [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'platform-tools', 'adb.exe') : null,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe') : null,
    home ? join(home, 'AppData', 'Local', 'Android', 'platform-tools', 'adb.exe') : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return configured || 'adb';
}

async function runAdb(args, options = {}) {
  const { stdout, stderr } = await execFileAsync(adbPath, args, {
    windowsHide: true,
    timeout: options.timeout || 10_000,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: String(stdout), stderr: String(stderr) };
}

async function listDevices() {
  const { stdout } = await runAdb(['devices', '-l']);
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state = 'unknown', ...rest] = line.split(/\s+/);
      const modelMatch = line.match(/(?:^|\s)model:([^\s]+)/)?.[1] || '';
      return { serial, state, model: modelMatch.replace(/_/g, ' ') || null, product: rest.join(' ') || null };
    });
}

async function selectSerial(devices) {
  const configured = String(process.env.ANDROID_DEVICE_SERIAL || '').trim();
  if (configured) {
    const found = devices.find((device) => device.serial === configured);
    if (!found) throw new Error(`ไม่พบ ANDROID_DEVICE_SERIAL=${configured} ในรายการอุปกรณ์`);
    return found;
  }
  const ready = devices.filter((device) => device.state === 'device');
  if (ready.length === 0) {
    const unauthorized = devices.find((device) => device.state === 'unauthorized');
    if (unauthorized) {
      throw new Error(`โทรศัพท์ ${unauthorized.serial} ยังไม่อนุญาต ADB — ปลดล็อกหน้าจอแล้วกด "อนุญาตการดีบัก USB" บนโทรศัพท์ แล้วลองใหม่`);
    }
    throw new Error('ไม่พบโทรศัพท์ Android ที่พร้อมใช้งาน — เช็คสาย USB และเปิด Developer Options > USB Debugging');
  }
  if (ready.length > 1) {
    const serials = ready.map((device) => device.serial).join(', ');
    throw new Error(`พบอุปกรณ์พร้อมใช้หลายเครื่อง (${serials}) — ตั้ง ANDROID_DEVICE_SERIAL=<serial> เพื่อเลือกเครื่อง`);
  }
  return ready[0];
}

async function ensureReverse(serial) {
  const { stdout: listOutput } = await runAdb(['-s', serial, 'reverse', '--list']).catch(() => ({ stdout: '' }));
  if (listOutput.includes(`tcp:${BRIDGE_PORT}`)) {
    log('ok', `adb reverse tcp:${BRIDGE_PORT} ลงทะเบียนแล้ว (${serial})`);
    return;
  }
  log('warn', `ยังไม่มี adb reverse tcp:${BRIDGE_PORT} — กำลังตั้งค่าให้อัตโนมัติ`);
  await runAdb(['-s', serial, 'reverse', `tcp:${BRIDGE_PORT}`, `tcp:${BRIDGE_PORT}`]);
  const { stdout: verifyOutput } = await runAdb(['-s', serial, 'reverse', '--list']);
  if (!verifyOutput.includes(`tcp:${BRIDGE_PORT}`)) {
    throw new Error(`ตั้งค่า adb reverse tcp:${BRIDGE_PORT} ไม่สำเร็จ`);
  }
  log('ok', `ตั้งค่า adb reverse tcp:${BRIDGE_PORT} เรียบร้อย (${serial})`);
}

async function probeBridge() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${BRIDGE_BASE_URL}/health`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Bridge ตอบกลับ HTTP ${response.status}`);
    }
    const health = await response.json().catch(() => ({}));
    log('ok', `ADB Bridge ตอบกลับแล้ว (${BRIDGE_BASE_URL})`, health);

    if (health.device?.connected) {
      log('ok', `โทรศัพท์เชื่อมต่อกับ Bridge: ${health.device.serial || 'serial ไม่ทราบ'} (${health.device.status || 'ONLINE'})`);
    } else {
      log('warn', 'Bridge เปิดอยู่ แต่ยังไม่มี serial — Device Agent อาจยังลงทะเบียนไม่เสร็จ รอสักครู่แล้วลองใหม่');
    }

    const stateResponse = await fetch(`${BRIDGE_BASE_URL}/state`, { signal: controller.signal }).catch(() => null);
    if (stateResponse?.ok) {
      const state = await stateResponse.json().catch(() => ({}));
      console.log('\n📊 สถานะอุปกรณ์จาก Bridge:');
      console.log(JSON.stringify(state.device || {}, null, 2));
    }
    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`ADB Bridge ไม่ตอบกลับภายใน 5 วินาที — ตรวจว่า Device Agent รันอยู่ (npm run dev:agent)`);
    }
    throw new Error(`ไม่สามารถติดต่อ ADB Bridge ได้: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

const adbPath = resolveAdbPath();
let exitCode = 0;

try {
  console.log(`\n🧪 ตรวจสอบ ADB Bridge (localhost:${BRIDGE_PORT})\n`);
  log('info', `ใช้ ADB ที่: ${adbPath}`);

  await runAdb(['version']);
  const devices = await listDevices();

  if (devices.length === 0) {
    log('warn', 'ADB ยังไม่พบอุปกรณ์ใด — เสียบสาย USB และเปิด USB Debugging บนโทรศัพท์');
    console.log('ตัวอย่าง: "npm run adb:devices"');
    exitCode = 1;
  } else {
    for (const device of devices) {
      log(device.state === 'device' ? 'ok' : 'warn', `${device.serial} ${device.state}${device.model ? ` (${device.model})` : ''}`);
    }

    const selected = await selectSerial(devices);
    log('info', `เลือกอุปกรณ์: ${selected.serial}${selected.model ? ` (${selected.model})` : ''}`);
    await ensureReverse(selected.serial);
    await probeBridge();
  }
} catch (error) {
  log('error', error.message);
  exitCode = 1;
}

console.log('');
process.exit(exitCode);
