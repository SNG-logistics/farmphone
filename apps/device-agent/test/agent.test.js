const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAdbDevices,
  selectDevice,
  parseStorage,
  checksum,
  deriveStatus,
  boundedNumber,
  backendRetryAfterMs,
  quoteShellArgument,
  sanitizeFilename,
  normalizeRemoteDirectory,
  validatedPackageName,
  validatePushPayload,
  handleDeviceCommand,
  state,
} = require('../src/index');

function resetCommandState() {
  state.deviceId = 'device-1';
  state.serial = 'REAL-001';
  state.currentJobId = null;
  state.commandError = null;
  state.activeCommandJobs.clear();
  state.completedCommandResponses.clear();
  state.commandHistory.clear();
}

test('parses ADB device, unauthorized, and offline states', () => {
  const devices = parseAdbDevices([
    'List of devices attached',
    'ABC123 device product:test model:Pixel_8 transport_id:1',
    'DENIED unauthorized usb:1-2',
    'LOST offline transport_id:3',
    '',
  ].join('\n'));
  assert.deepEqual(devices.map(({ serial, state }) => ({ serial, state })), [
    { serial: 'ABC123', state: 'device' },
    { serial: 'DENIED', state: 'unauthorized' },
    { serial: 'LOST', state: 'offline' },
  ]);
  assert.equal(devices[0].model, 'Pixel 8');
});

test('selects the only authorized device without hardcoding serial', () => {
  const selected = selectDevice([{ serial: 'REAL-001', state: 'device' }], '');
  assert.equal(selected.serial, 'REAL-001');
});

test('requires ANDROID_DEVICE_SERIAL when multiple devices are ready', () => {
  assert.throws(
    () => selectDevice([{ serial: 'A', state: 'device' }, { serial: 'B', state: 'device' }], ''),
    (error) => error.code === 'CONFIGURATION_ERROR',
  );
});

test('reports unauthorized device instead of treating it as online', () => {
  assert.throws(
    () => selectDevice([{ serial: 'A', state: 'unauthorized' }], ''),
    (error) => error.code === 'ADB_UNAUTHORIZED',
  );
});

test('parses storage bytes and derives ONLINE/WARNING from real metrics', () => {
  assert.deepEqual(parseStorage('Filesystem 1K-blocks Used Available Use% Mounted on\n/data 1000 900 100 90% /data'), {
    storageTotal: 1_024_000,
    storageUsed: 921_600,
  });
  assert.equal(deriveStatus({ batteryLevel: 80, storageUsed: 10, storageTotal: 100 }), 'ONLINE');
  assert.equal(deriveStatus({ batteryLevel: 10, storageUsed: 10, storageTotal: 100 }), 'WARNING');
});

test('computes SHA-256 checksum deterministically', () => {
  assert.equal(checksum(Buffer.from('PHONE-001')), 'f83e562bbe6c8d5d6b5e8872b360ecee92e56798b06bd5f4deaf27e680e9cced');
});

test('uses bounded production defaults for invalid numeric environment values', () => {
  assert.equal(boundedNumber('', 5_000, 1_000, 300_000), 5_000);
  assert.equal(boundedNumber('not-a-number', 5_000, 1_000, 300_000), 5_000);
  assert.equal(boundedNumber('0', 5_000, 1_000, 300_000), 5_000);
  assert.equal(boundedNumber('1000', 5_000, 1_000, 300_000), 1_000);
});

test('honors a bounded backend Retry-After window for quota backoff', () => {
  assert.equal(backendRetryAfterMs({ retryAfterMs: 900_000 }), 900_000);
  assert.equal(backendRetryAfterMs({ retryAfterMs: 1 }), 5_000);
  assert.equal(backendRetryAfterMs({ retryAfterMs: 9_000_000 }), 3_600_000);
  assert.equal(backendRetryAfterMs({ retryAfterMs: 'invalid' }), 0);
});

test('quotes remote shell arguments with POSIX single quotes', () => {
  assert.equal(quoteShellArgument('/sdcard/Farm Phone/sng (2).png'), "'/sdcard/Farm Phone/sng (2).png'");
  assert.equal(quoteShellArgument("a'b;$HOME"), "'a'\\''b;$HOME'");
  assert.throws(() => quoteShellArgument('bad\0value'), (error) => error.code === 'INVALID_SHELL_ARGUMENT');
});

test('keeps legal filename spaces and metacharacters while rejecting path traversal destinations', () => {
  assert.equal(sanitizeFilename(' live push (PHONE-001).txt '), 'live push (PHONE-001).txt');
  assert.equal(sanitizeFilename('../bad\\name.txt'), '_bad_name.txt');
  assert.equal(normalizeRemoteDirectory('/sdcard/Download/Farm Phone///'), '/sdcard/Download/Farm Phone');
  assert.throws(() => normalizeRemoteDirectory('relative/path'), (error) => error.code === 'INVALID_DESTINATION');
  assert.throws(() => normalizeRemoteDirectory('/sdcard/../data'), (error) => error.code === 'INVALID_DESTINATION');
});

test('validates package names and accepts a zero-byte file with a SHA-256 checksum', () => {
  assert.equal(validatedPackageName('com.ss.android.ugc.trill'), 'com.ss.android.ugc.trill');
  assert.throws(() => validatedPackageName('com.example;reboot'), (error) => error.code === 'INVALID_PACKAGE_NAME');
  assert.deepEqual(validatePushPayload({ fileBase64: '', size: 0, checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }), {
    encoded: '',
    downloadPath: undefined,
    expectedChecksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    expectedSize: 0,
  });
});

test('deduplicates a successful job at the Agent and echoes the attempt number', async () => {
  resetCommandState();
  const emitted = [];
  const socket = { emit: (event, payload) => emitted.push({ event, payload }) };
  let executions = 0;
  const executor = async () => { executions += 1; return { verified: true }; };
  const heartbeat = async () => undefined;
  const message = { jobId: 'job-1', deviceId: 'device-1', deviceCode: 'PHONE-001', command: 'HEALTH_CHECK', attemptNumber: 2 };

  await handleDeviceCommand(socket, message, executor, heartbeat);
  await handleDeviceCommand(socket, { ...message, attemptNumber: 3 }, executor, heartbeat);

  assert.equal(executions, 1);
  assert.equal(emitted.length, 2);
  assert.equal(emitted[0].payload.attemptNumber, 2);
  assert.equal(emitted[1].payload.attemptNumber, 3);
  assert.equal(emitted[1].payload.duplicate, true);
});

test('rejects reuse of a completed job id for a different command', async () => {
  resetCommandState();
  const emitted = [];
  const socket = { emit: (event, payload) => emitted.push({ event, payload }) };
  let executions = 0;
  const executor = async () => { executions += 1; return { result: 'PASS' }; };
  await handleDeviceCommand(socket, { jobId: 'job-mismatch', deviceId: 'device-1', command: 'HEALTH_CHECK' }, executor, async () => undefined);
  await handleDeviceCommand(socket, { jobId: 'job-mismatch', deviceId: 'device-1', command: 'REBOOT_DEVICE' }, executor, async () => undefined);

  assert.equal(executions, 1);
  assert.equal(emitted[1].payload.error.code, 'JOB_COMMAND_MISMATCH');
});

test('does not cache failures so a bounded backend retry executes again', async () => {
  resetCommandState();
  const emitted = [];
  const socket = { emit: (event, payload) => emitted.push({ event, payload }) };
  let executions = 0;
  const executor = async () => {
    executions += 1;
    if (executions === 1) {
      const error = new Error('temporary failure');
      error.code = 'ADB_DISCONNECTED';
      throw error;
    }
    return { result: 'PASS' };
  };
  const message = { jobId: 'job-retry', deviceId: 'device-1', command: 'HEALTH_CHECK', attemptNumber: 1 };

  await handleDeviceCommand(socket, message, executor, async () => undefined);
  await handleDeviceCommand(socket, { ...message, attemptNumber: 2 }, executor, async () => undefined);

  assert.equal(executions, 2);
  assert.equal(emitted[0].payload.error.code, 'ADB_DISCONNECTED');
  assert.deepEqual(emitted[1].payload.result, { result: 'PASS' });
});

test('turns a resolved single-device FAIL report into an uncached retryable error', async () => {
  resetCommandState();
  const emitted = [];
  const socket = { emit: (event, payload) => emitted.push({ event, payload }) };
  let executions = 0;
  const executor = async () => {
    executions += 1;
    return executions === 1
      ? { status: 'FAIL', steps: [{ name: 'ADB_CHECK', status: 'FAIL' }] }
      : { status: 'PASS', steps: Array.from({ length: 13 }, (_, index) => ({ name: `STEP_${index + 1}`, status: 'PASS' })) };
  };
  const message = { jobId: 'job-single-test', deviceId: 'device-1', command: 'RUN_SINGLE_DEVICE_TEST', attemptNumber: 1 };

  await handleDeviceCommand(socket, message, executor, async () => undefined);
  await handleDeviceCommand(socket, { ...message, attemptNumber: 2 }, executor, async () => undefined);

  assert.equal(executions, 2);
  assert.equal(emitted[0].payload.error.code, 'SINGLE_DEVICE_TEST_FAILED');
  assert.equal(emitted[0].payload.result.status, 'FAIL');
  assert.equal(emitted[1].payload.result.status, 'PASS');
});

test('ignores a duplicate delivery while the same physical command is in progress', async () => {
  resetCommandState();
  const emitted = [];
  const socket = { emit: (event, payload) => emitted.push({ event, payload }) };
  let release;
  let executions = 0;
  const executor = async () => {
    executions += 1;
    await new Promise((resolve) => { release = resolve; });
    return { result: 'PASS' };
  };
  const message = { jobId: 'job-active', deviceId: 'device-1', command: 'HEALTH_CHECK' };

  const first = handleDeviceCommand(socket, message, executor, async () => undefined);
  await new Promise((resolve) => setImmediate(resolve));
  await handleDeviceCommand(socket, message, executor, async () => undefined);
  release();
  await first;

  assert.equal(executions, 1);
  assert.equal(emitted.length, 1);
});
