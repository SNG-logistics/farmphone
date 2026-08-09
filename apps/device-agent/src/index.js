const io = require('socket.io-client');
const { execFile } = require('child_process');
const { createHash } = require('crypto');
const { promises: fs } = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function resolveAdbPath() {
  const configured = process.env.ADB_PATH;
  const fsSync = require('fs');
  if (configured && fsSync.existsSync(configured)) return configured;

  const candidates = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'platform-tools', 'adb.exe') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'platform-tools', 'adb.exe') : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) return candidate;
  }
  return configured || 'adb';
}

function boundedNumber(value, fallback, minimum, maximum) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

const config = {
  apiUrl: process.env.API_URL || 'http://localhost:3001',
  nodeId: String(process.env.NODE_ID || 'NODE-A').trim(),
  deviceCode: String(process.env.DEVICE_CODE || 'PHONE-001').trim(),
  selectedSerial: String(process.env.ANDROID_DEVICE_SERIAL || '').trim(),
  targetPackage: String(process.env.TARGET_ANDROID_PACKAGE || '').trim(),
  adbPath: resolveAdbPath(),
  token: process.env.DEVICE_AGENT_TOKEN || '',
  agentVersion: process.env.npm_package_version || '1.0.0',
  heartbeatMs: boundedNumber(process.env.HEARTBEAT_INTERVAL_MS, 5_000, 1_000, 300_000),
  batteryWarningLevel: boundedNumber(process.env.BATTERY_WARNING_LEVEL, 15, 0, 100),
  storageWarningPercent: boundedNumber(process.env.STORAGE_WARNING_PERCENT, 90, 0, 100),
  commandTimeoutMs: boundedNumber(process.env.DEVICE_COMMAND_TIMEOUT_MS, 60_000, 1_000, 600_000),
  rebootTimeoutMs: boundedNumber(process.env.DEVICE_REBOOT_TIMEOUT_MS, 120_000, 30_000, 600_000),
  pushDestination: process.env.PUSH_FILE_DESTINATION || '/sdcard/Download/FarmPhone/',
};

const state = {
  deviceId: null,
  serial: null,
  currentJobId: null,
  lastError: null,
  commandError: null,
  socket: null,
  stopping: false,
  heartbeatPromise: null,
  backendRetryAt: 0,
  activeCommandJobs: new Map(),
  completedCommandResponses: new Map(),
  commandHistory: new Map(),
};

function log(level, message, metadata = {}) {
  const suffix = Object.keys(metadata).length ? ` ${JSON.stringify(metadata)}` : '';
  console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] [${config.nodeId}] ${message}${suffix}`);
}

function codedError(code, message, adbOutput = '') {
  const error = new Error(message);
  error.code = code;
  error.adbOutput = adbOutput;
  return error;
}

function backendRetryAfterMs(body) {
  const parsed = Number(body && typeof body === 'object' ? body.retryAfterMs : 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(3_600_000, Math.max(config.heartbeatMs, Math.trunc(parsed))) : 0;
}

async function runAdb(args, options = {}) {
  try {
    const result = await execFileAsync(config.adbPath, args, {
      windowsHide: true,
      timeout: options.timeout || config.commandTimeoutMs,
      maxBuffer: options.maxBuffer || 20 * 1024 * 1024,
      encoding: options.encoding || 'utf8',
    });
    return result.stdout;
  } catch (error) {
    const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : String(error.stderr || '');
    const stdout = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : String(error.stdout || '');
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    if (error.code === 'ENOENT') throw codedError('ADB_NOT_FOUND', `ไม่พบ ADB ที่ ${config.adbPath}`, output);
    if (error.killed || error.code === 'ETIMEDOUT') throw codedError('ADB_TIMEOUT', `ADB command timed out after ${options.timeout || config.commandTimeoutMs}ms`, output);
    if (/unauthorized/i.test(output)) throw codedError('ADB_UNAUTHORIZED', 'โทรศัพท์ยังไม่อนุญาต ADB', output);
    if (/no devices|not found|offline/i.test(output)) throw codedError('ADB_DISCONNECTED', 'โทรศัพท์ไม่พร้อมเชื่อมต่อผ่าน ADB', output);
    throw codedError('ADB_COMMAND_FAILED', error.message || 'ADB command failed', output);
  }
}

function parseAdbDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, rawState = 'unknown'] = line.split(/\s+/, 2);
      return {
        serial,
        state: rawState,
        model: (line.match(/(?:^|\s)model:([^\s]+)/)?.[1] || '').replace(/_/g, ' '),
      };
    });
}

function selectDevice(devices, configuredSerial = config.selectedSerial) {
  if (configuredSerial) {
    const selected = devices.find((device) => device.serial === configuredSerial);
    if (!selected) throw codedError('DEVICE_NOT_FOUND', `ไม่พบ ANDROID_DEVICE_SERIAL=${configuredSerial}`);
    if (selected.state === 'unauthorized') throw codedError('ADB_UNAUTHORIZED', `โทรศัพท์ ${configuredSerial} ยังไม่อนุญาต ADB`);
    if (selected.state !== 'device') throw codedError('ADB_DISCONNECTED', `โทรศัพท์ ${configuredSerial} อยู่ในสถานะ ${selected.state}`);
    return selected;
  }

  const ready = devices.filter((device) => device.state === 'device');
  if (ready.length >= 1) return ready[0];
  const unauthorized = devices.find((device) => device.state === 'unauthorized');
  if (unauthorized) throw codedError('ADB_UNAUTHORIZED', `โทรศัพท์ ${unauthorized.serial} ยังไม่อนุญาต ADB`);
  throw codedError('DEVICE_NOT_FOUND', 'ไม่พบโทรศัพท์ Android ที่พร้อมใช้งาน');
}

async function detectSelectedDevice() {
  await runAdb(['version']);
  const output = await runAdb(['devices', '-l']);
  return selectDevice(parseAdbDevices(output));
}

async function shell(serial, args, timeout) {
  const command = args.map(quoteShellArgument).join(' ');
  return String(await runAdb(['-s', serial, 'shell', command], { timeout })).trim();
}

function quoteShellArgument(value) {
  const str = String(value);
  if (str.includes('\0')) throw codedError('INVALID_SHELL_ARGUMENT', 'ADB shell argument contains a null byte');
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

function sanitizeFilename(filename) {
  const normalized = String(filename || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f/\\]+/g, '_')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 180);
  return normalized || `upload-${Date.now()}.bin`;
}

function normalizeRemoteDirectory(value) {
  const raw = String(value || '').trim();
  const directory = raw === '/' ? '/' : raw.replace(/\/+$/, '');
  if (!directory.startsWith('/') || directory.includes('\0') || directory.split('/').some((part) => part === '..')) {
    throw codedError('INVALID_DESTINATION', 'PUSH_FILE destination must be an absolute Android path without traversal');
  }
  return directory || '/';
}

function parseStorage(output) {
  const columns = output.trim().split(/\r?\n/).at(-1)?.trim().split(/\s+/) || [];
  const total = Number(columns[1]) * 1024;
  const used = Number(columns[2]) * 1024;
  return {
    storageTotal: Number.isFinite(total) ? total : 0,
    storageUsed: Number.isFinite(used) ? used : 0,
  };
}

async function readDeviceInfo(serial) {
  const [manufacturer, model, androidVersion, batteryOutput, storageOutput, uptimeOutput] = await Promise.all([
    shell(serial, ['getprop', 'ro.product.manufacturer']),
    shell(serial, ['getprop', 'ro.product.model']),
    shell(serial, ['getprop', 'ro.build.version.release']),
    shell(serial, ['dumpsys', 'battery']),
    shell(serial, ['df', '-k', '/data']),
    shell(serial, ['cat', '/proc/uptime']),
  ]);
  const batteryLevel = Number(batteryOutput.match(/level:\s*(\d+)/i)?.[1] || 0);
  const storage = parseStorage(storageOutput);
  const uptimeSeconds = Math.floor(Number(uptimeOutput.split(/\s+/)[0]) || 0);
  return { serialNumber: serial, manufacturer, model, androidVersion, batteryLevel, ...storage, uptimeSeconds };
}

function deriveStatus(info) {
  if (state.currentJobId) return 'BUSY';
  if (state.commandError) return 'ERROR';
  if (info.batteryLevel <= config.batteryWarningLevel) return 'WARNING';
  const usedPercent = info.storageTotal > 0 ? (info.storageUsed / info.storageTotal) * 100 : 0;
  if (usedPercent >= config.storageWarningPercent) return 'WARNING';
  return 'ONLINE';
}

async function apiRequest(pathname, options = {}) {
  const response = await fetch(new URL(`/api/v1${pathname}`, config.apiUrl), {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(config.token ? { 'x-device-agent-token': config.token } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = codedError('BACKEND_REQUEST_FAILED', body.message || `${response.status} ${response.statusText}`);
    error.httpStatus = response.status;
    error.retryAfterMs = backendRetryAfterMs(body);
    throw error;
  }
  return body.data ?? body;
}

async function downloadQueuedFile(downloadPath) {
  const backend = new URL(config.apiUrl);
  const target = new URL(downloadPath, backend);
  if (target.origin !== backend.origin || !target.pathname.startsWith('/api/v1/devices/files/')) {
    throw codedError('INVALID_FILE_DOWNLOAD_URL', 'Backend file URL must use the configured API origin and device-files route');
  }
  const response = await fetch(target, {
    headers: config.token ? { 'x-device-agent-token': config.token } : {},
  });
  if (!response.ok) throw codedError('FILE_DOWNLOAD_FAILED', `ดาวน์โหลดไฟล์จาก Backend ไม่สำเร็จ: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function registerDevice() {
  const selected = await detectSelectedDevice();
  const info = await readDeviceInfo(selected.serial);
  const status = deriveStatus(info);
  const device = await apiRequest('/devices', {
    method: 'POST',
    body: JSON.stringify({
      organizationId: 'default-org',
      code: config.deviceCode,
      name: `${info.manufacturer} ${info.model}`.trim() || config.deviceCode,
      nodeId: config.nodeId,
      adbStatus: status,
      agentVersion: config.agentVersion,
      ...info,
    }),
  });
  state.deviceId = device.id;
  state.serial = selected.serial;
  state.lastError = null;
  log('info', `Registered ${config.deviceCode}`, { serial: state.serial, deviceId: state.deviceId });
  registerSocketAgent();
  return { device, info, status };
}

async function sendHeartbeat() {
  if (state.stopping) return;
  if (state.heartbeatPromise) return state.heartbeatPromise;
  state.heartbeatPromise = sendHeartbeatOnce().finally(() => {
    state.heartbeatPromise = null;
  });
  return state.heartbeatPromise;
}

async function sendHeartbeatOnce() {
  if (Date.now() < state.backendRetryAt) return;
  try {
    if (!state.serial || !state.deviceId) await registerDevice();
    const selected = await detectSelectedDevice();
    if (selected.serial !== state.serial) throw codedError('SERIAL_CHANGED', `อุปกรณ์ที่เลือกเปลี่ยนจาก ${state.serial} เป็น ${selected.serial}`);
    const info = await readDeviceInfo(state.serial);
    const status = deriveStatus(info);
    await apiRequest(`/devices/${config.deviceCode}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({
        deviceCode: config.deviceCode,
        status,
        currentJobId: state.currentJobId,
        agentVersion: config.agentVersion,
        timestamp: new Date().toISOString(),
        ...info,
      }),
    });
    state.backendRetryAt = 0;
    state.lastError = null;
  } catch (error) {
    if (error.retryAfterMs > 0) state.backendRetryAt = Date.now() + error.retryAfterMs;
    state.lastError = { code: error.code || 'HEARTBEAT_FAILED', message: error.message };
    log('error', 'Heartbeat failed', state.lastError);
    if (state.deviceId && ['ADB_UNAUTHORIZED', 'CONFIGURATION_ERROR', 'SERIAL_CHANGED'].includes(state.lastError.code)) {
      await apiRequest(`/devices/${config.deviceCode}/heartbeat`, {
        method: 'POST',
        body: JSON.stringify({
          deviceCode: config.deviceCode,
          serialNumber: state.serial,
          status: 'ERROR',
          currentJobId: state.currentJobId,
          agentVersion: config.agentVersion,
          timestamp: new Date().toISOString(),
          errorCode: state.lastError.code,
          errorMessage: state.lastError.message,
        }),
      }).catch(() => undefined);
    }
  }
}

function checksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function isPackageInstalled(serial, packageName) {
  if (!packageName) return false;
  const output = await shell(serial, ['pm', 'path', packageName]);
  return output.includes(`package:`);
}

async function healthCheck(serial, requestedPackage = config.targetPackage) {
  const info = await readDeviceInfo(serial);
  const packageName = String(requestedPackage || '').trim();
  const packageInstalled = packageName ? await isPackageInstalled(serial, packageName) : null;
  const warnings = [];
  if (info.batteryLevel <= config.batteryWarningLevel) warnings.push(`Battery ต่ำ: ${info.batteryLevel}%`);
  if (info.storageTotal && (info.storageUsed / info.storageTotal) * 100 >= config.storageWarningPercent) warnings.push('Storage ใกล้เต็ม');
  if (!packageName) warnings.push('ยังไม่ได้ตั้ง TARGET_ANDROID_PACKAGE');
  if (packageName && !packageInstalled) warnings.push(`ไม่พบแอป ${packageName}`);
  const result = packageName && !packageInstalled ? 'FAIL' : warnings.length ? 'WARNING' : 'PASS';
  return {
    result,
    checks: {
      adbConnection: 'PASS',
      authorization: 'PASS',
      androidVersion: info.androidVersion,
      batteryLevel: info.batteryLevel,
      storageUsed: info.storageUsed,
      storageTotal: info.storageTotal,
      uptimeSeconds: info.uptimeSeconds,
      selectedAppPackage: packageName || null,
      selectedAppInstalled: packageInstalled,
      deviceAgentConnection: state.socket?.connected ? 'PASS' : 'FAIL',
    },
    warnings,
  };
}

function validatedPackageName(value) {
  const packageName = String(value || '').trim();
  if (!packageName) throw codedError('TARGET_PACKAGE_REQUIRED', 'กรุณากำหนด TARGET_ANDROID_PACKAGE');
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/.test(packageName)) {
    throw codedError('INVALID_PACKAGE_NAME', `Android package name ไม่ถูกต้อง: ${packageName}`);
  }
  return packageName;
}

async function readPackageRuntimeState(serial, packageName) {
  const [pidOutput, activities, windows] = await Promise.all([
    shell(serial, ['pidof', packageName]).catch(() => ''),
    shell(serial, ['dumpsys', 'activity', 'activities']).catch(() => ''),
    shell(serial, ['dumpsys', 'window', 'windows']).catch(() => ''),
  ]);
  const processIds = pidOutput.trim().split(/\s+/).filter(Boolean);
  const foregroundLines = `${activities}\n${windows}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /mResumedActivity|topResumedActivity|mCurrentFocus|mFocusedApp/i.test(line) && line.includes(packageName))
    .slice(0, 5);
  return {
    processIds,
    processRunning: processIds.length > 0,
    foreground: foregroundLines.length > 0,
    foregroundEvidence: foregroundLines,
  };
}

async function waitForPackageState(serial, packageName, expectedRunning, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let runtime = await readPackageRuntimeState(serial, packageName);
  while (Date.now() < deadline) {
    const matched = expectedRunning
      ? runtime.processRunning && runtime.foreground
      : !runtime.processRunning && !runtime.foreground;
    if (matched) return runtime;
    await new Promise((resolve) => setTimeout(resolve, 500));
    runtime = await readPackageRuntimeState(serial, packageName);
  }
  return runtime;
}

async function openApp(serial, requestedPackage) {
  const packageName = validatedPackageName(requestedPackage || config.targetPackage);
  if (!(await isPackageInstalled(serial, packageName))) throw codedError('PACKAGE_NOT_INSTALLED', `ไม่พบแอป ${packageName}`);
  await runAdb(['-s', serial, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  const runtime = await waitForPackageState(serial, packageName, true);
  if (!runtime.processRunning || !runtime.foreground) {
    throw codedError('OPEN_APP_VERIFICATION_FAILED', `เปิดแอป ${packageName} แล้วแต่ไม่พบ process ที่อยู่ foreground`);
  }
  return { packageName, verifiedRunning: true, ...runtime };
}

async function stopApp(serial, requestedPackage) {
  const packageName = validatedPackageName(requestedPackage || config.targetPackage);
  await runAdb(['-s', serial, 'shell', 'am', 'force-stop', packageName]);
  const runtime = await waitForPackageState(serial, packageName, false);
  if (runtime.processRunning || runtime.foreground) {
    throw codedError('STOP_APP_VERIFICATION_FAILED', `แอป ${packageName} ยังทำงานอยู่`);
  }
  return { packageName, verifiedStopped: true, ...runtime };
}

async function captureScreenshot(serial) {
  const buffer = Buffer.from(await runAdb(['-s', serial, 'exec-out', 'screencap', '-p'], { encoding: 'buffer', timeout: 20_000 }));
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 100 || !buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw codedError('SCREENSHOT_INVALID', 'ADB ไม่ได้ส่งไฟล์ PNG ที่ถูกต้อง');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width < 100 || height < 100) throw codedError('SCREENSHOT_INVALID', `ขนาดภาพ Screenshot ไม่ถูกต้อง: ${width}x${height}`);
  return { screenshotBase64: buffer.toString('base64'), size: buffer.length, checksum: checksum(buffer), mimeType: 'image/png', width, height };
}

function validatePushPayload(parameters) {
  const encoded = parameters.fileBase64;
  const downloadPath = parameters.downloadPath;
  const hasEncoded = typeof encoded === 'string';
  const expectedChecksum = String(parameters.checksum || '').trim().toLowerCase();
  const expectedSize = Number(parameters.size);
  if ((!hasEncoded && !downloadPath) || !/^[a-f0-9]{64}$/.test(expectedChecksum) || !Number.isSafeInteger(expectedSize) || expectedSize < 0) {
    throw codedError('INVALID_FILE_PAYLOAD', 'ข้อมูลไฟล์ไม่ครบหรือ size/checksum ไม่ถูกต้อง');
  }
  return { encoded, downloadPath, expectedChecksum, expectedSize };
}

async function pushFileToDevice(serial, parameters) {
  const { encoded, downloadPath, expectedChecksum, expectedSize } = validatePushPayload(parameters);
  const buffer = typeof encoded === 'string' ? Buffer.from(encoded, 'base64') : await downloadQueuedFile(String(downloadPath));
  if (buffer.length !== expectedSize || checksum(buffer) !== expectedChecksum) {
    throw codedError('SOURCE_CHECKSUM_MISMATCH', 'ไฟล์จาก Backend มีขนาดหรือ checksum ไม่ตรง');
  }
  const rawFilename = path.basename(String(parameters.filename || 'upload.bin'));
  const filename = sanitizeFilename(rawFilename);
  const destinationDirectory = normalizeRemoteDirectory(parameters.destination || config.pushDestination);
  const destination = destinationDirectory === '/' ? `/${filename}` : `${destinationDirectory}/${filename}`;
  const temporaryPath = path.join(os.tmpdir(), `farm-phone-${process.pid}-${Date.now()}-${checksum(Buffer.from(filename)).slice(0, 12)}.upload`);
  try {
    await fs.writeFile(temporaryPath, buffer);
    await shell(serial, ['mkdir', '-p', destinationDirectory]);
    const adbOutput = String(await runAdb(['-s', serial, 'push', temporaryPath, destination], { timeout: 120_000 })).trim();
    const remoteSize = Number(await shell(serial, ['stat', '-c', '%s', destination]));
    const remoteChecksumOutput = await shell(serial, ['sha256sum', destination]).catch(async () => shell(serial, ['toybox', 'sha256sum', destination]));
    const remoteChecksum = remoteChecksumOutput.split(/\s+/)[0].toLowerCase();
    if (remoteSize !== expectedSize) throw codedError('DESTINATION_SIZE_MISMATCH', `ขนาดปลายทาง ${remoteSize} ไม่ตรง ${expectedSize}`, adbOutput);
    if (remoteChecksum !== expectedChecksum) throw codedError('DESTINATION_CHECKSUM_MISMATCH', 'Checksum ปลายทางไม่ตรง', adbOutput);
    await shell(serial, ['am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file://${destination}`]).catch(() => '');
    return { filename, size: remoteSize, checksum: remoteChecksum, destination, adbOutput };
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined);
  }
}

async function rebootDevice(serial) {
  const uptimeBefore = Number((await shell(serial, ['cat', '/proc/uptime'])).split(/\s+/)[0]) || 0;
  const startedAt = Date.now();
  await runAdb(['-s', serial, 'reboot'], { timeout: 15_000 });

  const disconnectDeadline = Date.now() + Math.min(30_000, Math.floor(config.rebootTimeoutMs / 3));
  let disconnectedAt = 0;
  while (Date.now() < disconnectDeadline) {
    try {
      const adbState = String(await runAdb(['-s', serial, 'get-state'], { timeout: 3_000 })).trim();
      if (adbState !== 'device') {
        disconnectedAt = Date.now();
        break;
      }
    } catch {
      disconnectedAt = Date.now();
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!disconnectedAt) throw codedError('REBOOT_DISCONNECT_NOT_OBSERVED', 'ไม่พบช่วงที่ PHONE-001 หลุดจาก ADB หลังสั่ง reboot');

  const deadline = startedAt + config.rebootTimeoutMs;
  await runAdb(['-s', serial, 'wait-for-device'], { timeout: Math.max(1_000, deadline - Date.now()) });
  const reconnectedAt = Date.now();
  let bootCompleted = '';
  while (Date.now() < deadline) {
    bootCompleted = await shell(serial, ['getprop', 'sys.boot_completed']).catch(() => '');
    if (bootCompleted === '1') break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  if (bootCompleted !== '1') throw codedError('REBOOT_VERIFICATION_FAILED', 'โทรศัพท์เชื่อมต่อกลับมาแต่ Android ยัง boot ไม่เสร็จ');
  const uptimeAfter = Number((await shell(serial, ['cat', '/proc/uptime'])).split(/\s+/)[0]) || 0;
  if (uptimeBefore >= 60 && uptimeAfter >= uptimeBefore) {
    throw codedError('REBOOT_UPTIME_NOT_RESET', `Uptime ไม่ reset หลัง reboot (${uptimeBefore} -> ${uptimeAfter})`);
  }
  return {
    rebooted: true,
    disconnectObserved: true,
    bootCompleted: true,
    uptimeBefore: Math.floor(uptimeBefore),
    uptimeAfter: Math.floor(uptimeAfter),
    disconnectMs: disconnectedAt - startedAt,
    reconnectMs: reconnectedAt - startedAt,
    bootCompletedMs: Date.now() - startedAt,
  };
}

async function viewDeviceStatus(serial) {
  const info = await readDeviceInfo(serial);
  return {
    deviceCode: config.deviceCode,
    ...info,
    adbStatus: deriveStatus(info),
    authorization: 'AUTHORIZED',
    lastHeartbeatError: state.lastError,
  };
}

function appendCommandHistory(jobId, level, message, metadata = {}) {
  if (!jobId) return;
  const entries = state.commandHistory.get(jobId) || [];
  entries.push({ timestamp: new Date().toISOString(), level, message, ...metadata });
  state.commandHistory.set(jobId, entries.slice(-100));
  while (state.commandHistory.size > 100) state.commandHistory.delete(state.commandHistory.keys().next().value);
}

async function runSingleDeviceTest(serial, parameters) {
  const startedAt = new Date().toISOString();
  const steps = [];
  const errors = [];
  let health;
  let screenshot;
  let openResult;
  let pushResult;
  let stopResult;
  const record = (name, status, details = {}) => steps.push({ name, status, timestamp: new Date().toISOString(), ...details });
  const attempt = async (name, operation) => {
    try {
      const result = await operation();
      record(name, 'PASS');
      return result;
    } catch (error) {
      const failure = { code: error.code || 'DEVICE_TEST_STEP_FAILED', message: error.message };
      errors.push({ step: name, ...failure });
      record(name, 'FAIL', { error: failure });
      return undefined;
    }
  };

  record('DEVICE_AGENT_CHECK', state.socket?.connected ? 'PASS' : 'FAIL', { connected: Boolean(state.socket?.connected) });
  if (!state.socket?.connected) errors.push({ step: 'DEVICE_AGENT_CHECK', code: 'DEVICE_AGENT_DISCONNECTED', message: 'WebSocket is not connected' });
  await attempt('ADB_CHECK', () => runAdb(['version']));
  record('PHONE_001_CHECK', serial ? 'PASS' : 'FAIL', { deviceCode: config.deviceCode, serialNumber: serial });
  health = await attempt('HEALTH_CHECK', () => healthCheck(serial, parameters.packageName || config.targetPackage));
  screenshot = await attempt('SCREENSHOT', () => captureScreenshot(serial));
  openResult = await attempt('OPEN_APP', () => openApp(serial, parameters.packageName || config.targetPackage));
  if (openResult?.verifiedRunning) record('VERIFY_APP_RUNNING', 'PASS', { processIds: openResult.processIds });
  else {
    record('VERIFY_APP_RUNNING', 'FAIL');
    errors.push({ step: 'VERIFY_APP_RUNNING', code: 'OPEN_APP_NOT_VERIFIED', message: 'OPEN_APP did not verify foreground process' });
  }
  pushResult = await attempt('PUSH_FILE', () => pushFileToDevice(serial, parameters));
  if (pushResult && pushResult.size === Number(parameters.size) && pushResult.checksum === String(parameters.checksum || '').toLowerCase()) {
    record('VERIFY_PUSH_FILE', 'PASS', { destination: pushResult.destination, size: pushResult.size, checksum: pushResult.checksum });
  } else {
    record('VERIFY_PUSH_FILE', 'FAIL');
    errors.push({ step: 'VERIFY_PUSH_FILE', code: 'PUSH_FILE_NOT_VERIFIED', message: 'Remote size/checksum was not verified' });
  }
  stopResult = await attempt('STOP_APP', () => stopApp(serial, parameters.packageName || config.targetPackage));
  if (stopResult?.verifiedStopped) record('VERIFY_APP_STOPPED', 'PASS');
  else {
    record('VERIFY_APP_STOPPED', 'FAIL');
    errors.push({ step: 'VERIFY_APP_STOPPED', code: 'STOP_APP_NOT_VERIFIED', message: 'STOP_APP did not verify process absence' });
  }
  record('REPORT', 'PASS', { completedSteps: steps.length + 2, failedSteps: errors.length });
  const status = errors.length ? 'FAIL' : 'PASS';
  record('FINAL_RESULT', status);

  return {
    status,
    startedAt,
    completedAt: new Date().toISOString(),
    deviceCode: config.deviceCode,
    serialNumber: serial,
    steps,
    errors,
    health,
    screenshot,
    openApp: openResult,
    pushFile: pushResult,
    stopApp: stopResult,
  };
}

async function executeCommand(command, parameters = {}) {
  const selected = await detectSelectedDevice();
  const serial = selected.serial;
  if (state.serial && serial !== state.serial) throw codedError('SERIAL_CHANGED', 'Serial ไม่ตรงกับ PHONE-001 ที่ลงทะเบียน');

  if (command === 'HEALTH_CHECK') return healthCheck(serial, parameters.packageName || config.targetPackage);
  if (command === 'SCREENSHOT') return captureScreenshot(serial);
  if (command === 'OPEN_APP') return openApp(serial, parameters.packageName || config.targetPackage);
  if (command === 'STOP_APP') return stopApp(serial, parameters.packageName || config.targetPackage);
  if (command === 'RESTART_APP') {
    const stopped = await stopApp(serial, parameters.packageName || config.targetPackage);
    const opened = await openApp(serial, parameters.packageName || config.targetPackage);
    return { packageName: opened.packageName, verifiedStopped: stopped.verifiedStopped, verifiedRunning: opened.verifiedRunning, stopEvidence: stopped, startEvidence: opened };
  }
  if (command === 'PUSH_FILE') return pushFileToDevice(serial, parameters);
  if (command === 'REBOOT_DEVICE') return rebootDevice(serial);
  if (command === 'VIEW_DEVICE_STATUS') return viewDeviceStatus(serial);
  if (command === 'VIEW_JOB_LOG') {
    const targetJobId = String(parameters.targetJobId || parameters.jobId || '').trim();
    if (!targetJobId) throw codedError('TARGET_JOB_ID_REQUIRED', 'VIEW_JOB_LOG ต้องมี targetJobId');
    return { jobId: targetJobId, entries: state.commandHistory.get(targetJobId) || [] };
  }
  if (command === 'RUN_SINGLE_DEVICE_TEST') return runSingleDeviceTest(serial, parameters);

  throw codedError('UNSUPPORTED_COMMAND', `ไม่รองรับคำสั่ง ${command}`);
}

function registerSocketAgent() {
  if (!state.socket?.connected || !state.deviceId) return;
  state.socket.emit('agent:register', {
    nodeId: config.nodeId,
    devices: [{ id: state.deviceId, code: config.deviceCode, serial: state.serial }],
  });
}

function rememberCompletedResponse(jobId, response) {
  state.completedCommandResponses.set(jobId, response);
  while (state.completedCommandResponses.size > 10) {
    state.completedCommandResponses.delete(state.completedCommandResponses.keys().next().value);
  }
}

async function handleDeviceCommand(socket, message, executor = executeCommand, heartbeat = sendHeartbeat) {
  if (!message) return false;
  if (message.deviceCode && message.deviceCode !== config.deviceCode) return false;
  if (message.deviceId && message.deviceId !== state.deviceId) return false;
  const jobId = String(message.jobId || '').trim();
  const command = String(message.command || '').trim().toUpperCase();
  const attemptNumber = Math.max(1, Number(message.attemptNumber) || 1);
  if (!jobId || !command) {
    log('error', 'Rejected device command without jobId/command', { jobId: jobId || null, command: command || null });
    return false;
  }

  const cached = state.completedCommandResponses.get(jobId);
  if (cached) {
    if (cached.command !== command) {
      socket.emit('device:response', {
        jobId,
        deviceId: state.deviceId,
        deviceCode: config.deviceCode,
        command,
        attemptNumber,
        error: { code: 'JOB_COMMAND_MISMATCH', message: `Job ${jobId} was already completed as ${cached.command}`, adbOutput: '' },
        completedAt: new Date().toISOString(),
      });
      return true;
    }
    appendCommandHistory(jobId, 'INFO', 'Duplicate delivery returned cached successful response', { command, attemptNumber });
    socket.emit('device:response', { ...cached, attemptNumber, duplicate: true });
    return true;
  }
  const activeCommand = state.activeCommandJobs.get(jobId);
  if (activeCommand) {
    if (activeCommand !== command) {
      socket.emit('device:response', {
        jobId,
        deviceId: state.deviceId,
        deviceCode: config.deviceCode,
        command,
        attemptNumber,
        error: { code: 'JOB_COMMAND_MISMATCH', message: `Job ${jobId} is already running as ${activeCommand}`, adbOutput: '' },
        completedAt: new Date().toISOString(),
      });
      return true;
    }
    appendCommandHistory(jobId, 'INFO', 'Duplicate delivery ignored while command is in progress', { command, attemptNumber });
    return true;
  }
  if (state.currentJobId && state.currentJobId !== jobId) {
    socket.emit('device:response', {
      jobId,
      deviceId: state.deviceId,
      deviceCode: config.deviceCode,
      command,
      attemptNumber,
      error: { code: 'DEVICE_BUSY', message: `PHONE-001 is executing job ${state.currentJobId}`, adbOutput: '' },
      completedAt: new Date().toISOString(),
    });
    return true;
  }

  state.activeCommandJobs.set(jobId, command);
  state.commandError = null;
  state.currentJobId = jobId;
  appendCommandHistory(jobId, 'INFO', 'Command execution started', { command, attemptNumber });
  await heartbeat();
  log('info', `Executing ${command}`, { jobId, attemptNumber });
  try {
    const result = await executor(command, message.parameters || {});
    if (String(result?.status || '').toUpperCase() === 'FAIL') {
      const error = codedError('SINGLE_DEVICE_TEST_FAILED', `${command} reported FAIL`);
      error.result = result;
      throw error;
    }
    const response = {
      jobId,
      deviceId: state.deviceId,
      deviceCode: config.deviceCode,
      command,
      attemptNumber,
      result,
      completedAt: new Date().toISOString(),
    };
    rememberCompletedResponse(jobId, response);
    appendCommandHistory(jobId, 'INFO', 'Command execution succeeded', { command, attemptNumber });
    socket.emit('device:response', response);
  } catch (error) {
    state.commandError = { code: error.code || 'DEVICE_COMMAND_FAILED', message: error.message };
    appendCommandHistory(jobId, 'ERROR', 'Command execution failed', {
      command,
      attemptNumber,
      errorCode: state.commandError.code,
      errorMessage: state.commandError.message,
      adbOutput: error.adbOutput || '',
    });
    log('error', `Command ${command} failed`, { jobId, attemptNumber, code: error.code, message: error.message });
    socket.emit('device:response', {
      jobId,
      deviceId: state.deviceId,
      deviceCode: config.deviceCode,
      command,
      attemptNumber,
      ...(error.result ? { result: error.result } : {}),
      error: { code: error.code || 'DEVICE_COMMAND_FAILED', message: error.message, adbOutput: error.adbOutput || '' },
      completedAt: new Date().toISOString(),
    });
  } finally {
    state.activeCommandJobs.delete(jobId);
    if (state.currentJobId === jobId) state.currentJobId = null;
    await heartbeat();
    state.commandError = null;
  }
  return true;
}

function connectSocket() {
  const socket = io(new URL(config.apiUrl).origin, {
    auth: { token: config.deviceAgentToken, nodeId: config.nodeId },
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
  state.socket = socket;
  socket.on('connect', () => {
    log('info', 'WebSocket connected');
    registerSocketAgent();
  });
  socket.on('disconnect', (reason) => log('warn', 'WebSocket disconnected', { reason }));
  socket.on('connect_error', (error) => log('error', 'WebSocket connection error', { message: error.message }));
  socket.on('device:command', (message) => void handleDeviceCommand(socket, message));
  return socket;
}

async function main() {
  log('info', 'Fleet Device Agent starting', {
    deviceCode: config.deviceCode,
    configuredSerial: config.selectedSerial || null,
    heartbeatMs: config.heartbeatMs,
  });
  connectSocket();
  await sendHeartbeat();
  const timer = setInterval(() => void sendHeartbeat(), config.heartbeatMs);

  const shutdown = async (signal) => {
    if (state.stopping) return;
    state.stopping = true;
    clearInterval(timer);
    log('info', `Shutting down after ${signal}`);
    if (state.deviceId) {
      await apiRequest(`/devices/${config.deviceCode}`, {
        method: 'PATCH',
        body: JSON.stringify({ adbStatus: 'OFFLINE', currentJobId: null }),
      }).catch(() => undefined);
    }
    state.socket?.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch((error) => {
    log('error', 'Fatal error', { code: error.code, message: error.message, adbOutput: error.adbOutput });
    process.exitCode = 1;
  });
}

module.exports = {
  config,
  boundedNumber,
  backendRetryAfterMs,
  parseAdbDevices,
  selectDevice,
  parseStorage,
  checksum,
  deriveStatus,
  quoteShellArgument,
  sanitizeFilename,
  normalizeRemoteDirectory,
  validatedPackageName,
  validatePushPayload,
  executeCommand,
  handleDeviceCommand,
  state,
};
