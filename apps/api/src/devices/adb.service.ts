import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

export type AdbDeviceState = 'device' | 'offline' | 'unauthorized' | 'unknown';

export interface AdbDevice {
  serial: string;
  state: AdbDeviceState;
  model: string;
  product: string;
  transportId: string | null;
  androidVersion: string | null;
  battery: number | null;
  storageGb: number | null;
  resolution: string | null;
}

export interface AdbDiagnostic {
  available: boolean;
  adbPath: string;
  message: string;
  devices: AdbDevice[];
}

type DeviceAction = 'wake' | 'sleep' | 'home';

@Injectable()
export class AdbService {
  private readonly adbPath: string;

  constructor() {
    this.adbPath = this.resolveAdbPath();
  }

  private resolveAdbPath(): string {
    const configured = process.env.ADB_PATH;
    if (configured && existsSync(configured)) return configured;

    const candidates = [
      'C:\\Users\\acer\\AppData\\Local\\Android\\platform-tools\\adb.exe',
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'platform-tools', 'adb.exe') : null,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe') : null,
      process.env.USERPROFILE ? join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'platform-tools', 'adb.exe') : null,
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }
    return configured || 'adb';
  }

  async diagnose(): Promise<AdbDiagnostic> {
    try {
      await this.run(['version']);
      const output = await this.run(['devices', '-l']);
      const devices = await Promise.all(this.parseDevices(output).map((device) => this.enrich(device)));

      return {
        available: true,
        adbPath: this.adbPath,
        message: devices.length > 0 ? `พบโทรศัพท์ ${devices.length} เครื่อง` : 'ADB พร้อมใช้งาน แต่ยังไม่พบโทรศัพท์',
        devices,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return {
        available: false,
        adbPath: this.adbPath,
        message: code === 'ENOENT'
          ? 'ไม่พบ ADB กรุณาติดตั้ง Android Platform Tools และตั้งค่า ADB_PATH'
          : `เรียกใช้ ADB ไม่สำเร็จ: ${this.errorMessage(error)}`,
        devices: [],
      };
    }
  }

  async executeAction(serial: string, action: DeviceAction) {
    const connected = this.parseDevices(await this.run(['devices', '-l']));
    const device = connected.find((item) => item.serial === serial);
    if (!device) throw new Error(`ไม่พบโทรศัพท์ serial ${serial}`);
    if (device.state !== 'device') throw new Error(`โทรศัพท์ ${serial} อยู่ในสถานะ ${device.state}`);

    const keyCodes: Record<DeviceAction, string> = {
      wake: 'KEYCODE_WAKEUP',
      sleep: 'KEYCODE_SLEEP',
      home: 'KEYCODE_HOME',
    };
    await this.run(['-s', serial, 'shell', 'input', 'keyevent', keyCodes[action]]);
    return { serial, action, status: 'completed' };
  }

  async tap(serial: string, x: number, y: number) {
    const targetSerial = await this.assertConnected(serial);
    await this.run(['-s', targetSerial, 'shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))]);
    return { serial: targetSerial, action: 'tap', x, y, status: 'completed' };
  }

  async swipe(serial: string, x1: number, y1: number, x2: number, y2: number, durationMs = 300) {
    const targetSerial = await this.assertConnected(serial);
    await this.run(['-s', targetSerial, 'shell', 'input', 'swipe',
      String(Math.round(x1)), String(Math.round(y1)),
      String(Math.round(x2)), String(Math.round(y2)),
      String(Math.round(durationMs)),
    ]);
    return { serial: targetSerial, action: 'swipe', x1, y1, x2, y2, durationMs, status: 'completed' };
  }

  async inputText(serial: string, text: string) {
    const targetSerial = await this.assertConnected(serial);
    const escaped = text.replace(/([\\'"$`!#&|;(){}[\]<>*?~])/g, '\\$1').replace(/ /g, '%s');
    await this.run(['-s', targetSerial, 'shell', 'input', 'text', escaped]);
    return { serial: targetSerial, action: 'input_text', text, status: 'completed' };
  }

  async keyEvent(serial: string, keycode: string) {
    const targetSerial = await this.assertConnected(serial);
    await this.run(['-s', targetSerial, 'shell', 'input', 'keyevent', keycode]);
    return { serial: targetSerial, action: 'key_event', keycode, status: 'completed' };
  }

  async getResolution(serial: string): Promise<{ width: number; height: number }> {
    const targetSerial = await this.assertConnected(serial);
    const output = await this.run(['-s', targetSerial, 'shell', 'wm', 'size']);
    const match = output.match(/Physical size:\s*(\d+)x(\d+)/i) || output.match(/(\d+)x(\d+)/);
    if (!match) return { width: 1080, height: 2400 };
    return { width: Number(match[1]), height: Number(match[2]) };
  }

  async pushFile(serial: string, localPath: string, remotePath: string) {
    const targetSerial = await this.assertConnected(serial);
    await this.run(['-s', targetSerial, 'push', localPath, remotePath], 60_000);
    await this.run(['-s', targetSerial, 'shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file://${remotePath}`]);
    return remotePath;
  }

  async launchPackage(serial: string, packageName: string) {
    const targetSerial = await this.assertConnected(serial);
    await this.run(['-s', targetSerial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  }

  async screenshot(serial: string) {
    const targetSerial = await this.assertConnected(serial);
    const { stdout } = await execFileAsync(this.adbPath, ['-s', targetSerial, 'exec-out', 'screencap', '-p'], {
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 20 * 1024 * 1024,
      encoding: 'buffer',
    });
    return Buffer.from(stdout);
  }

  async fastScreenshot(serial: string, targetWidth = 480, quality = 60): Promise<{ buffer: Buffer; format: string }> {
    const targetSerial = await this.assertConnected(serial);
    const { stdout } = await execFileAsync(this.adbPath, ['-s', targetSerial, 'exec-out', 'screencap', '-p'], {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 20 * 1024 * 1024,
      encoding: 'buffer',
    });
    const rawBuffer = Buffer.from(stdout);
    try {
      const compressed = await sharp(rawBuffer)
        .resize({ width: targetWidth, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
      return { buffer: compressed, format: 'image/jpeg' };
    } catch {
      return { buffer: rawBuffer, format: 'image/png' };
    }
  }

  private readonly streamBuffers = new Map<string, { buffer: Buffer; format: string; timestamp: number; fetching: boolean }>();

  async getStreamScreen(serial: string, targetWidth = 480, quality = 60): Promise<{ buffer: Buffer; format: string }> {
    const targetSerial = await this.assertConnected(serial);
    const now = Date.now();
    const cached = this.streamBuffers.get(targetSerial);

    if (!cached || (!cached.fetching && now - cached.timestamp > 30)) {
      this.refreshStreamBuffer(targetSerial, targetWidth, quality);
    }

    if (cached && cached.buffer.length > 0) {
      return { buffer: cached.buffer, format: cached.format };
    }

    return this.fastScreenshot(targetSerial, targetWidth, quality);
  }

  private refreshStreamBuffer(serial: string, targetWidth: number, quality: number) {
    const existing = this.streamBuffers.get(serial);
    if (existing?.fetching) return;

    if (existing) {
      existing.fetching = true;
    } else {
      this.streamBuffers.set(serial, { buffer: Buffer.alloc(0), format: 'image/jpeg', timestamp: 0, fetching: true });
    }

    this.fastScreenshot(serial, targetWidth, quality).then((frame) => {
      this.streamBuffers.set(serial, {
        buffer: frame.buffer,
        format: frame.format,
        timestamp: Date.now(),
        fetching: false,
      });
    }).catch(() => {
      const entry = this.streamBuffers.get(serial);
      if (entry) entry.fetching = false;
    });
  }

  async captureUiSnapshot(serial: string) {
    const targetSerial = await this.assertConnected(serial);
    await this.run(['-s', targetSerial, 'shell', 'uiautomator', 'dump', '/sdcard/window.xml'], 15_000);
    const xml = await this.run(['-s', targetSerial, 'shell', 'cat', '/sdcard/window.xml'], 15_000);
    const values = (attribute: string) => [...xml.matchAll(new RegExp(`${attribute}="([^"]*)"`, 'g'))]
      .map((match) => this.decodeXml(match[1]))
      .filter(Boolean);
    return {
      texts: values('text'),
      contentDescriptions: values('content-desc'),
      resourceIds: values('resource-id'),
      capturedAt: new Date(),
    };
  }

  private parseDevices(output: string): Array<Pick<AdbDevice, 'serial' | 'state' | 'model' | 'product' | 'transportId'>> {
    return output
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [serial, rawState = 'unknown'] = line.split(/\s+/, 2);
        return {
          serial,
          state: this.normalizeState(rawState),
          model: this.field(line, 'model')?.replace(/_/g, ' ') || 'Unknown Android device',
          product: this.field(line, 'product') || '',
          transportId: this.field(line, 'transport_id'),
        };
      });
  }

  private async enrich(device: Pick<AdbDevice, 'serial' | 'state' | 'model' | 'product' | 'transportId'>): Promise<AdbDevice> {
    const base = { ...device, androidVersion: null, battery: null, storageGb: null, resolution: null };
    if (device.state !== 'device') return base;

    const [androidVersion, batteryOutput, storageOutput, resolutionOutput] = await Promise.all([
      this.safeShell(device.serial, ['getprop', 'ro.build.version.release']),
      this.safeShell(device.serial, ['dumpsys', 'battery']),
      this.safeShell(device.serial, ['df', '-k', '/data']),
      this.safeShell(device.serial, ['wm', 'size']),
    ]);

    return {
      ...base,
      androidVersion: androidVersion || null,
      battery: this.numberMatch(batteryOutput, /level:\s*(\d+)/i),
      storageGb: this.storageGb(storageOutput),
      resolution: resolutionOutput.match(/Physical size:\s*([^\r\n]+)/i)?.[1]?.trim() || null,
    };
  }

  private async safeShell(serial: string, args: string[], timeout = 2500) {
    try {
      return (await this.run(['-s', serial, 'shell', ...args], timeout)).trim();
    } catch {
      return '';
    }
  }

  private async run(args: string[], timeout = 10_000) {
    const { stdout } = await execFileAsync(this.adbPath, args, {
      windowsHide: true,
      timeout,
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  }

  private async assertConnected(serial: string) {
    const devices = this.parseDevices(await this.run(['devices', '-l']));
    const readyDevices = devices.filter((item) => item.state === 'device');

    let device = devices.find((item) => item.serial === serial);
    if (!device) {
      const envSerial = process.env.ANDROID_DEVICE_SERIAL;
      if (envSerial) device = devices.find((item) => item.serial === envSerial);
    }
    if (!device && readyDevices.length === 1) {
      device = readyDevices[0];
    }
    if (!device || device.state !== 'device') {
      const activeMsg = readyDevices.length > 0 ? `พบเครื่องที่เสียบอยู่: ${readyDevices.map((d) => d.serial).join(', ')}` : 'ไม่พบเครื่องที่เสียบสาย USB/ADB';
      throw new Error(`โทรศัพท์ ${serial} ไม่พร้อมใช้งาน (${activeMsg})`);
    }
    return device.serial;
  }

  private field(line: string, key: string) {
    return line.match(new RegExp(`(?:^|\\s)${key}:([^\\s]+)`))?.[1] || null;
  }

  private normalizeState(state: string): AdbDeviceState {
    if (state === 'device' || state === 'offline' || state === 'unauthorized') return state;
    return 'unknown';
  }

  private numberMatch(value: string, pattern: RegExp) {
    const result = value.match(pattern)?.[1];
    return result ? Number(result) : null;
  }

  private storageGb(output: string) {
    const lines = output.trim().split(/\r?\n/);
    const columns = lines.at(-1)?.trim().split(/\s+/);
    const availableKb = Number(columns?.[3]);
    return Number.isFinite(availableKb) ? Math.round((availableKb / 1024 / 1024) * 10) / 10 : null;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  private decodeXml(value: string) {
    return value
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
}
