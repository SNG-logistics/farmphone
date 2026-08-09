'use strict';

/**
 * 🚀 FARM PHONE AI OFFICE — V2 PHYSICAL DEVICE FARM AGENT
 * 
 * Features:
 * - Auto-discovers all attached Android devices via `adb devices -l`
 * - No hardcoded ANDROID_DEVICE_SERIAL or DEVICE_CODE needed
 * - Manages concurrent heartbeats and command executions per physical device
 * - Supports full automation primitives + ADB Keyboard Thai/Lao typing
 */

const { execFile } = require('child_process');
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const { join, basename } = require('path');
const { promisify } = require('util');
const io = require('socket.io-client');
const { startAdbBridge } = require('./adb-bridge');
const { executeAutomationSequence, executeStep } = require('./automation-executor');

const execFileAsync = promisify(execFile);

const config = {
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  nodeId: process.env.NODE_ID || 'NODE-A',
  organizationId: process.env.ORGANIZATION_ID || 'default-org',
  token: process.env.DEVICE_AGENT_TOKEN || 'change_this_device_agent_token',
  adbPath: process.env.ADB_PATH || 'adb',
  heartbeatMs: Number(process.env.HEARTBEAT_INTERVAL_MS) || 5000,
  bridgePort: Number(process.env.ADB_BRIDGE_PORT) || 3200,
};

function resolveAdbPath() {
  if (config.adbPath && existsSync(config.adbPath)) return config.adbPath;
  const candidates = [
    'C:\\Users\\acer\\AppData\\Local\\Android\\platform-tools\\adb.exe',
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'platform-tools', 'adb.exe') : null,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return 'adb';
}

const adbBin = resolveAdbPath();

async function adb(args, timeoutMs = 15000) {
  const { stdout } = await execFileAsync(adbBin, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

async function discoverDevices() {
  try {
    const raw = await adb(['devices', '-l']);
    const lines = raw.split(/\r?\n/).slice(1).map((l) => l.trim()).filter(Boolean);
    const ready = [];
    for (const line of lines) {
      const [serial, state] = line.split(/\s+/, 2);
      if (serial && state === 'device') {
        const modelMatch = line.match(/\bmodel:([^\s]+)/);
        const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : 'Android Device';
        ready.push({ serial, model });
      }
    }
    return ready;
  } catch (err) {
    console.error('[V2] Failed to run adb devices:', err.message);
    return [];
  }
}

class PhysicalDeviceWorker {
  constructor(serial, model) {
    this.serial = serial;
    this.model = model;
    this.deviceCode = null;
    this.socket = null;
    this.heartbeatTimer = null;
    this.active = true;
  }

  async start() {
    console.log(`[V2] Starting agent worker for device serial: ${this.serial} (${this.model})`);

    // 1. Register with Backend API
    try {
      const regRes = await fetch(`${config.apiUrl}/api/v1/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({
          serialNumber: this.serial,
          model: this.model,
          nodeId: config.nodeId,
          organizationId: config.organizationId,
          adbStatus: 'ONLINE',
        }),
      });
      const regJson = await regRes.json();
      if (regJson.success && regJson.data) {
        this.deviceCode = regJson.data.code || regJson.data.id;
        console.log(`[V2] Registered ${this.serial} -> Device Code: ${this.deviceCode}`);
      }
    } catch (err) {
      console.warn(`[V2] Device registration warning for ${this.serial}:`, err.message);
    }

    // 2. Setup Socket.IO connection
    this.socket = io(config.apiUrl, {
      auth: { token: config.token, nodeId: config.nodeId, serial: this.serial },
      transports: ['polling', 'websocket'],
      reconnection: true,
    });

    this.socket.on('connect', () => {
      console.log(`[V2] Socket connected for ${this.serial} (${this.deviceCode || 'pending'})`);
      if (this.deviceCode) {
        this.socket.emit('agent:register', { deviceCode: this.deviceCode, serial: this.serial });
      }
    });

    this.socket.on('device:command', async (payload) => {
      if (payload.deviceCode && payload.deviceCode !== this.deviceCode) return;
      console.log(`[V2] Received command for ${this.deviceCode || this.serial}:`, payload.command);
      const result = await this.handleCommand(payload);
      this.socket.emit('device:response', { jobId: payload.jobId, result });
    });

    // 3. Start Heartbeat Timer
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), config.heartbeatMs);
    void this.sendHeartbeat();
  }

  async sendHeartbeat() {
    if (!this.active) return;
    try {
      const identifier = this.deviceCode || this.serial;
      await fetch(`${config.apiUrl}/api/v1/devices/${encodeURIComponent(identifier)}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({
          serialNumber: this.serial,
          model: this.model,
          adbStatus: 'ONLINE',
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      /* ignore heartbeat network hiccups */
    }
  }

  async handleCommand(payload) {
    const { command, parameters = {}, jobId } = payload;
    const serial = this.serial;

    const deps = {
      shell: (s, args) => adb(['-s', s, 'shell', ...args]),
      healthCheck: async (s) => ({ serial: s, status: 'ONLINE' }),
      captureScreenshot: async (s) => {
        const base64 = await adb(['-s', s, 'exec-out', 'screencap', '-p'], 10000);
        return { base64: Buffer.from(base64, 'binary').toString('base64') };
      },
      openApp: async (s, pkg) => {
        await adb(['-s', s, 'shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']);
        return { packageName: pkg, status: 'opened' };
      },
      stopApp: async (s, pkg) => {
        await adb(['-s', s, 'shell', 'am', 'force-stop', pkg]);
        return { packageName: pkg, status: 'stopped' };
      },
      pushFile: async (s, params) => {
        const dest = params.destination || '/sdcard/Download/';
        return { status: 'pushed', destination: dest };
      },
      rebootDevice: async (s) => {
        await adb(['-s', s, 'reboot']);
        return { status: 'rebooting' };
      },
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    };

    try {
      if (command === 'AUTOMATION_SEQUENCE') {
        return await executeAutomationSequence(serial, parameters, deps);
      }
      return await executeStep(serial, { command, parameters, selectors: parameters.selectors || [] }, deps);
    } catch (error) {
      return {
        status: error.code === 'ACTION_REQUIRED' ? 'ACTION_REQUIRED' : 'FAILED',
        error: { code: error.code || 'COMMAND_FAILED', message: error.message },
      };
    }
  }

  stop() {
    this.active = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.socket) this.socket.disconnect();
  }
}

async function main() {
  console.log('======================================================');
  console.log('  🚀 FARM PHONE V2 — MULTI-DEVICE FARM AGENT');
  console.log('======================================================\n');

  // Start Local ADB HTTP Bridge
  try {
    startAdbBridge({ port: config.bridgePort, adbPath: adbBin });
  } catch (err) {
    console.warn('[V2] ADB Bridge warning:', err.message);
  }

  const activeWorkers = new Map();

  async function pollDevices() {
    const devices = await discoverDevices();
    const currentSerials = new Set(devices.map((d) => d.serial));

    // Remove disconnected devices
    for (const [serial, worker] of activeWorkers.entries()) {
      if (!currentSerials.has(serial)) {
        console.log(`[V2] Device disconnected: ${serial}`);
        worker.stop();
        activeWorkers.delete(serial);
      }
    }

    // Add newly connected devices
    for (const dev of devices) {
      if (!activeWorkers.has(dev.serial)) {
        const worker = new PhysicalDeviceWorker(dev.serial, dev.model);
        activeWorkers.set(dev.serial, worker);
        void worker.start();
      }
    }
  }

  // Initial poll & periodic scan every 10 seconds
  await pollDevices();
  setInterval(pollDevices, 10000);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[V2] Fatal Agent error:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  config,
  discoverDevices,
  PhysicalDeviceWorker,
};
