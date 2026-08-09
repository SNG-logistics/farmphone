const test = require('node:test');
const assert = require('node:assert/strict');
const {
  executeAutomationSequence,
  parseUiXml,
} = require('../src/automation-executor');

const safeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hierarchy rotation="0">
  <node text="" resource-id="com.example:id/root" class="android.view.View" package="com.example" content-desc="" clickable="false" enabled="true" bounds="[0,0][1080,1920]" />
  <node text="Create post" resource-id="" class="android.widget.Button" package="com.example" content-desc="Create" clickable="true" enabled="true" bounds="[400,1200][680,1400]" />
</hierarchy>`;

const otpXml = `<?xml version="1.0"?><hierarchy rotation="0">
  <node text="Verification code" resource-id="com.example:id/otp" class="android.widget.EditText" package="com.example" content-desc="OTP" clickable="true" enabled="true" bounds="[100,300][900,450]" />
</hierarchy>`;

function dependencies(xml = safeXml) {
  const calls = [];
  return {
    calls,
    shell: async (_serial, args) => {
      calls.push(args);
      if (args[0] === 'cat') return xml;
      return 'ok';
    },
    captureScreenshot: async () => ({ screenshotBase64: 'cG5n', checksum: 'test', size: 3 }),
    healthCheck: async () => ({ result: 'PASS' }),
    openApp: async () => ({ verifiedRunning: true }),
    stopApp: async () => ({ verifiedStopped: true }),
    sleep: async () => undefined,
  };
}

test('parses real uiautomator attributes and bounds', () => {
  const nodes = parseUiXml(safeXml);
  assert.equal(nodes.length, 2);
  assert.deepEqual(nodes[1].bounds, { left: 400, top: 1200, right: 680, bottom: 1400 });
  assert.equal(nodes[1].contentDescription, 'Create');
});

test('uses resourceId then contentDescription then text then coordinates', async () => {
  const deps = dependencies();
  const result = await executeAutomationSequence('REAL-SERIAL-007', {
    sequenceVersion: 1,
    recipeId: 'recipe-1',
    recipeVersion: 1,
    steps: [{
      command: 'TAP_UI',
      selectors: [
        { strategy: 'resourceId', value: 'com.example:id/missing' },
        { strategy: 'contentDescription', value: 'Create' },
        { strategy: 'text', value: 'Create post' },
        { strategy: 'coordinate', x: 10, y: 20 },
      ],
      evidence: { before: true, after: true, onFailure: true },
    }],
  }, deps);

  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(result.steps[0].output.selectorUsed, { strategy: 'contentDescription', value: 'Create' });
  assert.ok(deps.calls.some((args) => args.join(' ') === 'input tap 540 1300'));
  assert.ok(result.steps[0].evidence.before.screenshotBase64);
  assert.ok(result.steps[0].evidence.after.screenshotBase64);
});

test('stops with ACTION_REQUIRED before typing into login, CAPTCHA, OTP, consent, or account challenges', async () => {
  const deps = dependencies(otpXml);
  const result = await executeAutomationSequence('REAL-SERIAL-011', {
    steps: [{
      command: 'TYPE_TEXT',
      parameters: { text: '123456' },
      evidence: { onFailure: true },
    }],
  }, deps);

  assert.equal(result.status, 'ACTION_REQUIRED');
  assert.equal(result.failureReason.code, 'ACTION_REQUIRED');
  assert.equal(result.failureReason.actionRequired.kind, 'OTP');
  assert.equal(result.steps[0].status, 'ACTION_REQUIRED');
  assert.ok(result.steps[0].evidence.failure.screenshotBase64);
  assert.equal(deps.calls.some((args) => args[0] === 'input' && args[1] === 'text'), false);
});

test('returns a structured retryable selector failure instead of claiming completion', async () => {
  const deps = dependencies();
  const result = await executeAutomationSequence('REAL-SERIAL-007', {
    steps: [{
      id: 'missing-control',
      command: 'TAP_UI',
      selectors: [{ strategy: 'resourceId', value: 'com.example:id/not-there' }],
      evidence: { onFailure: true },
    }],
  }, deps);

  assert.equal(result.status, 'FAILED');
  assert.equal(result.failureReason.code, 'UI_SELECTOR_NOT_FOUND');
  assert.equal(result.failureReason.retryable, true);
  assert.deepEqual(result.failureReason.selectorAttempts, [
    { strategy: 'resourceId', value: 'com.example:id/not-there' },
  ]);
});
