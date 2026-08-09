import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { io } from 'socket.io-client';

const execFileAsync = promisify(execFile);

const enabled = process.env.RUN_LIVE_ONE_DEVICE === '1';
const configuredApiUrl = String(process.env.API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const apiUrl = configuredApiUrl.endsWith('/api/v1') ? configuredApiUrl : `${configuredApiUrl}/api/v1`;
const apiOrigin = new URL(apiUrl).origin;
const webUrl = process.env.WEB_URL || 'http://localhost:3000';
const deviceCode = 'PHONE-001';
const evidenceRoot = path.resolve('docs/evidence/PHONE-001');
const fixturePath = path.resolve(process.env.LIVE_PUSH_FILE_PATH || 'tests/fixtures/live push (PHONE-001).txt');
const buildId = process.env.BUILD_ID || 'local-worktree';
const state = { device: null, healthJob: null, screenshotJob: null, pushJob: null, failedJob: null };

async function physicalAdbEvidence() {
  const adbPath = process.env.ADB_PATH || 'adb';
  const version = (await execFileAsync(adbPath, ['version'], { encoding: 'utf8' })).stdout.trim();
  const devices = (await execFileAsync(adbPath, ['devices', '-l'], { encoding: 'utf8' })).stdout.trim();
  const ready = devices.split(/\r?\n/).slice(1).map((line) => line.trim()).filter((line) => /\sdevice(?:\s|$)/.test(line));
  const configuredSerial = String(process.env.ANDROID_DEVICE_SERIAL || '').trim();
  const selected = configuredSerial
    ? ready.find((line) => line.split(/\s+/, 1)[0] === configuredSerial)
    : ready.length === 1 ? ready[0] : undefined;
  assert.ok(selected, configuredSerial ? `ANDROID_DEVICE_SERIAL=${configuredSerial} is not authorized/ready` : `expected exactly one ready device, found ${ready.length}`);
  const serialNumber = selected.split(/\s+/, 1)[0];
  const qemu = (await execFileAsync(adbPath, ['-s', serialNumber, 'shell', 'getprop', 'ro.kernel.qemu'], { encoding: 'utf8' })).stdout.trim();
  assert.notEqual(qemu, '1', 'emulator/qemu is forbidden for physical acceptance');
  return { adbPath, version, devices, selected, serialNumber, qemu: qemu || '0/unset' };
}

async function request(route, options) {
  const response = await fetch(`${apiUrl}${route}`, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('json') ? await response.json().catch(() => ({})) : await response.arrayBuffer();
  assert.equal(response.ok, true, `${route} failed (${response.status}): ${body?.message || response.statusText}`);
  return body?.data ?? body;
}

async function command(commandName, parameters = {}, idempotencyKey = `${deviceCode}:${commandName}:${Date.now()}`) {
  const result = await request(`/devices/${deviceCode}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ command: commandName, parameters, idempotencyKey }),
  });
  return { ...result, job: result.job || result };
}

async function fileCommand(commandName, filePath, parameters = {}) {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append('command', commandName);
  form.append('parameters', JSON.stringify(parameters));
  form.append('file', new Blob([bytes]), path.basename(filePath));
  const key = `${deviceCode}:${commandName}:${createHash('sha256').update(bytes).digest('hex')}:${Date.now()}`;
  const result = await request(`/devices/${deviceCode}/commands`, { method: 'POST', headers: { 'idempotency-key': key }, body: form });
  return { ...result, job: result.job || result };
}

async function waitForJob(jobId, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await request(`/jobs/${jobId}`);
    if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Job ${jobId} did not finish within ${timeoutMs}ms`);
}

async function waitForDeadLetter(jobId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const deadLetters = await request('/jobs/dead-letters');
    const deadLetter = deadLetters.find((entry) => entry.jobId === jobId);
    if (deadLetter) return deadLetter;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Job ${jobId} did not enter the dead-letter queue within ${timeoutMs}ms`);
}

async function evidence(testId, result, extra = {}) {
  const directory = path.join(evidenceRoot, testId);
  await mkdir(directory, { recursive: true });
  const completedAt = new Date().toISOString();
  const payload = {
    testId,
    status: result,
    deviceCode,
    physicalDevice: extra.physicalDevice ?? true,
    startedAt: extra.startedAt || completedAt,
    completedAt,
    buildId,
    evidence: extra.evidence || [`docs/evidence/PHONE-001/${testId}/result.json`],
    notes: extra.notes || '',
    details: Object.fromEntries(Object.entries(extra).filter(([key]) => !['startedAt', 'evidence', 'notes', 'physicalDevice'].includes(key))),
  };
  await writeFile(path.join(directory, 'result.json'), JSON.stringify(payload, null, 2));
}

const live = { skip: enabled ? false : 'Set RUN_LIVE_ONE_DEVICE=1 only with physical PHONE-001, Docker services, API, Web, and Device Agent running' };

test('TEST-001 Device Agent detects and registers physical PHONE-001', live, async () => {
  const adb = await physicalAdbEvidence();
  const device = await request(`/devices/${deviceCode}`);
  assert.equal(device.code, deviceCode);
  assert.ok(device.serialNumber, 'serialNumber must come from ADB');
  assert.ok(!String(device.serialNumber).startsWith('sim-'), 'simulator serial is forbidden');
  assert.equal(device.serialNumber, adb.serialNumber, 'registered serial must match the selected physical ADB device');
  assert.ok(['ONLINE', 'WARNING', 'BUSY'].includes(device.adbStatus), `unexpected status ${device.adbStatus}`);
  state.device = device;
  const directory = path.join(evidenceRoot, 'TEST-001');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'adb-devices.txt'), `${adb.version}\n\n${adb.devices}\n`);
  await evidence('TEST-001', 'PASS', {
    device,
    adb,
    evidence: ['docs/evidence/PHONE-001/TEST-001/result.json', 'docs/evidence/PHONE-001/TEST-001/adb-devices.txt'],
  });
});

test('TEST-001A VIEW_DEVICE_STATUS returns live ADB identity and telemetry', live, async () => {
  const job = await waitForJob((await command('VIEW_DEVICE_STATUS')).job.id);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  assert.equal(job.result?.deviceCode, deviceCode);
  assert.equal(job.result?.serialNumber, state.device.serialNumber);
  assert.equal(job.result?.authorization, 'AUTHORIZED');
  assert.ok(['ONLINE', 'BUSY', 'WARNING'].includes(job.result?.adbStatus), `unexpected status ${job.result?.adbStatus}`);
  assert.ok(job.result?.manufacturer);
  assert.ok(job.result?.model);
  assert.ok(job.result?.androidVersion);
  await evidence('TEST-001A', 'PASS', { job });
});

test('TEST-002 Heartbeat reaches Dashboard through WebSocket', live, async () => {
  const socket = io(apiOrigin, { transports: ['websocket'], reconnection: true });
  const update = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No PHONE-001 deviceUpdate within 12 seconds')), 12_000);
    socket.on('deviceUpdate', (payload) => {
      const device = payload?.device || payload;
      if (device?.code !== deviceCode) return;
      clearTimeout(timer);
      resolve(payload);
    });
  }).finally(() => socket.disconnect());
  await evidence('TEST-002', 'PASS', { update });
});

test('TEST-005 HEALTH_CHECK verifies required physical metrics', live, async () => {
  const queued = await command('HEALTH_CHECK');
  const job = await waitForJob(queued.job.id);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  assert.ok(['PASS', 'WARNING'].includes(job.result?.result));
  assert.equal(job.result?.checks?.adbConnection, 'PASS');
  assert.equal(job.result?.checks?.authorization, 'PASS');
  state.healthJob = job;
  await evidence('TEST-005', 'PASS', { job, healthResult: job.result.result });
});

test('TEST-006 SCREENSHOT stores a real PNG linked to Job', live, async () => {
  const queued = await command('SCREENSHOT');
  const job = await waitForJob(queued.job.id);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  assert.match(job.result?.screenshotUrl || '', /^(?:https?:\/\/|\/)/);
  const response = await fetch(new URL(job.result.screenshotUrl, apiUrl));
  assert.equal(response.ok, true);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.ok(width >= 100 && height >= 100, `invalid screenshot dimensions ${width}x${height}`);
  const directory = path.join(evidenceRoot, 'TEST-006');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'PHONE-001.png'), bytes);
  state.screenshotJob = job;
  await evidence('TEST-006', 'PASS', {
    job,
    dimensions: { width, height },
    screenshotSha256: createHash('sha256').update(bytes).digest('hex'),
    evidence: ['docs/evidence/PHONE-001/TEST-006/result.json', 'docs/evidence/PHONE-001/TEST-006/PHONE-001.png'],
  });
});

test('TEST-007 OPEN_APP verifies selected package is running', live, async () => {
  assert.ok(process.env.TARGET_ANDROID_PACKAGE, 'TARGET_ANDROID_PACKAGE is required');
  const job = await waitForJob((await command('OPEN_APP', { packageName: process.env.TARGET_ANDROID_PACKAGE })).job.id);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  assert.equal(job.result?.verifiedRunning, true);
  await evidence('TEST-007', 'PASS', { job });
});

test('TEST-007A RESTART_APP verifies both stop and foreground start', live, async () => {
  assert.ok(process.env.TARGET_ANDROID_PACKAGE, 'TARGET_ANDROID_PACKAGE is required');
  const job = await waitForJob((await command('RESTART_APP', { packageName: process.env.TARGET_ANDROID_PACKAGE })).job.id);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  assert.equal(job.result?.verifiedStopped, true);
  assert.equal(job.result?.verifiedRunning, true);
  assert.equal(job.result?.packageName, process.env.TARGET_ANDROID_PACKAGE);
  await evidence('TEST-007A', 'PASS', { job });
});

test('TEST-008 STOP_APP verifies selected package has no process', live, async () => {
  assert.ok(process.env.TARGET_ANDROID_PACKAGE, 'TARGET_ANDROID_PACKAGE is required');
  const job = await waitForJob((await command('STOP_APP', { packageName: process.env.TARGET_ANDROID_PACKAGE })).job.id);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  assert.equal(job.result?.verifiedStopped, true);
  await evidence('TEST-008', 'PASS', { job });
});

test('TEST-009 PUSH_FILE verifies destination size and checksum', live, async () => {
  const fixture = await readFile(fixturePath);
  const expectedChecksum = createHash('sha256').update(fixture).digest('hex');
  const queued = await fileCommand('PUSH_FILE', fixturePath, { destination: "/sdcard/Download/Farm 'Phone'; (PHONE-001)/" });
  const job = await waitForJob(queued.job.id);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  assert.ok(job.result?.destination?.startsWith("/sdcard/Download/Farm 'Phone'; (PHONE-001)/"));
  assert.equal(path.posix.basename(job.result?.destination || ''), job.result?.filename);
  assert.equal(job.result?.filename, 'live_push_PHONE-001.txt');
  assert.equal(job.result?.size, fixture.length);
  assert.equal(job.result?.checksum, expectedChecksum);
  state.pushJob = job;
  await evidence('TEST-009', 'PASS', { job });
});

test('TEST-009A RUN_SINGLE_DEVICE_TEST completes and reports all 13 physical steps', live, async () => {
  assert.ok(process.env.TARGET_ANDROID_PACKAGE, 'TARGET_ANDROID_PACKAGE is required');
  const queued = await fileCommand('RUN_SINGLE_DEVICE_TEST', fixturePath, {
    packageName: process.env.TARGET_ANDROID_PACKAGE,
    destination: "/sdcard/Download/Farm 'Phone'; (PHONE-001)/",
  });
  const job = await waitForJob(queued.job.id, 300_000);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  assert.equal(job.result?.status, 'PASS');
  assert.ok(job.result?.steps?.length >= 13, `expected 13 steps, got ${job.result?.steps?.length || 0}`);
  assert.equal(job.result?.openApp?.verifiedRunning, true);
  assert.equal(job.result?.stopApp?.verifiedStopped, true);
  assert.match(job.result?.pushFile?.checksum || '', /^[a-f0-9]{64}$/);
  await evidence('TEST-009A', 'PASS', { job });
});

test('TEST-010 Job Logs persist attempt and ADB result', live, async () => {
  const job = await request(`/jobs/${state.healthJob.id}`);
  assert.ok(job.logs?.length >= 2, 'expected assigned and verified Job logs');
  assert.ok(job.logs.some((entry) => entry.attemptNumber === 1));
  await evidence('TEST-010', 'PASS', { logs: job.logs });
});

test('TEST-010A VIEW_JOB_LOG returns persisted logs through a queued Job', live, async () => {
  const queued = await command('VIEW_JOB_LOG', { targetJobId: state.healthJob.id });
  const job = await waitForJob(queued.job.id);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  const entries = job.result?.logs || job.result?.entries;
  assert.ok(Array.isArray(entries) && entries.length >= 2, 'VIEW_JOB_LOG must return persisted entries');
  assert.ok(entries.some((entry) => entry.attemptNumber === 1));
  await evidence('TEST-010A', 'PASS', { job });
});

test('TEST-011 duplicate idempotency key returns the same Job', live, async () => {
  const key = `${deviceCode}:HEALTH_CHECK:duplicate-contract:${Date.now()}`;
  const first = await command('HEALTH_CHECK', {}, key);
  const second = await command('HEALTH_CHECK', {}, key);
  assert.equal(second.job.id, first.job.id);
  assert.equal(second.duplicate, true);
  await waitForJob(first.job.id);
  await evidence('TEST-011', 'PASS', { jobId: first.job.id, idempotencyKey: key });
});

test('TEST-012/013 failed command retries exactly three times then FAILED', live, async () => {
  const missingPackage = `com.farmphone.acceptance.missing.${Date.now()}`;
  const queued = await command('OPEN_APP', { packageName: missingPackage });
  const job = await waitForJob(queued.job.id);
  assert.equal(job.status, 'FAILED');
  assert.equal(job.attempts, 3);
  assert.equal(job.maxAttempts, 3);
  assert.equal(job.logs.filter((entry) => entry.level === 'ERROR').length, 3);
  const deadLetter = await waitForDeadLetter(job.id);
  state.failedJob = job;
  await evidence('TEST-012', 'PASS', { job });
  await evidence('TEST-013', 'PASS', { job, deadLetter });
});

test('TEST-013A REBOOT_DEVICE observes disconnect, reconnect, boot completion, and uptime reset', live, async () => {
  const queued = await command('REBOOT_DEVICE');
  const job = await waitForJob(queued.job.id, 240_000);
  assert.equal(job.status, 'SUCCESS', `${job.errorCode}: ${job.errorMessage}`);
  assert.equal(job.result?.rebooted, true);
  assert.equal(job.result?.disconnectObserved, true);
  assert.equal(job.result?.bootCompleted, true);
  assert.ok(job.result?.uptimeAfter < job.result?.uptimeBefore, `uptime did not reset: ${job.result?.uptimeBefore} -> ${job.result?.uptimeAfter}`);
  await evidence('TEST-013A', 'PASS', { job });
});

test('TEST-016 WebSocket client reconnects and receives current heartbeat', live, async () => {
  const socket = io(apiOrigin, { autoConnect: false, reconnection: true });
  const connect = () => new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    const onConnect = () => { cleanup(); resolve(); };
    const onError = (error) => { cleanup(); reject(error); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('WebSocket connection timed out')); }, 12_000);
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
    socket.connect();
  });
  try {
    await connect();
    socket.disconnect();
    await connect();
    assert.equal(socket.connected, true);
    const update = await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        socket.off('deviceUpdate', onUpdate);
      };
      const onUpdate = (payload) => {
        const device = payload?.device || payload;
        if (device?.code !== deviceCode) return;
        cleanup();
        resolve(payload);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('No PHONE-001 heartbeat after WebSocket reconnect')); }, 12_000);
      socket.on('deviceUpdate', onUpdate);
    });
    await evidence('TEST-016', 'PASS', { update });
  } finally {
    socket.removeAllListeners();
    socket.disconnect();
  }
});

test('TEST-017 four AI Agent states correlate to real Job', live, async () => {
  const agents = await request('/agents');
  const expected = ['16bit.MANAGER', '16bit.DEVICE', '16bit.QA', '16bit.LOG'];
  assert.deepEqual(agents.map((agent) => agent.code).sort(), expected.sort());
  for (const agent of agents) {
    assert.ok(agent.tasks?.some((task) => task.input?.jobId === state.failedJob.id || task.input?.jobId === state.healthJob.id));
  }
  await evidence('TEST-017', 'PASS', { agents });
});

test('TEST-018 production device dashboards contain no known mock sources', async () => {
  const files = [...await sourceFiles('apps/web/src/app'), 'apps/workers/src/worker.ts'];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /\bconst\s+(?:mock|demo)[A-Za-z_]*|DEMO_|generateDemo|Mock API|mockKPI|recentActivity\s*=|Array\.from\(\{\s*length:\s*20|simulated action|device-test\/devices/i, file);
  }
  await evidence('TEST-018', 'PASS', { physicalDevice: false, notes: 'Static production-source contract; no physical device claim.' });
});

test('write live evidence manifest', live, async () => {
  await mkdir(evidenceRoot, { recursive: true });
  const manualTests = ['TEST-003', 'TEST-004', 'TEST-014', 'TEST-015'];
  const acceptedManualTests = [];
  for (const testId of manualTests) {
    const result = await readFile(path.join(evidenceRoot, testId, 'result.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (result?.status === 'PASS' && result?.physicalDevice === true) acceptedManualTests.push(testId);
  }
  const manifest = {
    deviceCode,
    generatedAt: new Date().toISOString(),
    physicalDeviceRequired: true,
    automatedTestsCovered: [
      'TEST-001', 'TEST-001A', 'TEST-002', 'TEST-005', 'TEST-006', 'TEST-007', 'TEST-007A', 'TEST-008',
      'TEST-009', 'TEST-009A', 'TEST-010', 'TEST-010A', 'TEST-011', 'TEST-012', 'TEST-013', 'TEST-013A',
      'TEST-016', 'TEST-017', 'TEST-018',
    ],
    acceptedManualTests,
    manualTestsStillRequired: manualTests.filter((testId) => !acceptedManualTests.includes(testId)),
    webUrl,
  };
  await writeFile(path.join(evidenceRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));
});

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) files.push(target);
  }
  return files;
}
