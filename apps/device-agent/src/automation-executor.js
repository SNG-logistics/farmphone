'use strict';

const UI_DUMP_PATH = '/sdcard/window_farm_phone.xml';
const SUPPORTED_COMMANDS = new Set([
  'HEALTH_CHECK', 'SCREENSHOT', 'OPEN_APP', 'STOP_APP', 'TAP', 'TAP_UI', 'SWIPE',
  'TYPE_TEXT', 'KEYEVENT', 'BACK', 'HOME', 'WAIT_UI', 'DUMP_UI',
]);
const UI_MUTATIONS = new Set(['TAP', 'TAP_UI', 'SWIPE', 'TYPE_TEXT', 'KEYEVENT', 'BACK', 'HOME']);
const POST_ACTION_INSPECTION = new Set(['OPEN_APP', ...UI_MUTATIONS]);
const RETRYABLE_CODES = new Set(['ADB_TIMEOUT', 'ADB_DISCONNECTED', 'UI_DUMP_FAILED', 'UI_TIMEOUT', 'UI_SELECTOR_NOT_FOUND']);
const CHALLENGE_PATTERNS = [
  { kind: 'LOGIN', pattern: /\b(log[ -]?in|sign[ -]?in|username|password)\b/i },
  { kind: 'CAPTCHA', pattern: /captcha|recaptcha|i am not a robot/i },
  { kind: 'OTP', pattern: /\b(otp|one[ -]?time (?:password|code)|verification code|security code)\b/i },
  { kind: 'ACCOUNT_CHALLENGE', pattern: /verify (?:it'?s you|your identity)|confirm your identity|account challenge|two[ -]?factor/i },
  { kind: 'CONSENT', pattern: /\b(consent|allow access|grant permission|accept permissions?|agree and continue)\b/i },
  { kind: 'LOGIN', pattern: /เข้าสู่ระบบ|ชื่อผู้ใช้|รหัสผ่าน/i },
  { kind: 'OTP', pattern: /รหัส.*(?:otp|ยืนยัน)|ยืนยันตัวตน/i },
  { kind: 'CONSENT', pattern: /อนุญาต|ยินยอม/i },
];

async function executeAutomationSequence(serial, parameters, dependencies) {
  const sequence = normalizeSequence(parameters);
  const startedAt = new Date().toISOString();
  const stepResults = [];

  for (let index = 0; index < sequence.steps.length; index += 1) {
    const step = sequence.steps[index];
    const result = await executeStepWithEvidence(serial, step, index, dependencies);
    stepResults.push(result);
    if (result.status === 'ACTION_REQUIRED') {
      return sequenceResult('ACTION_REQUIRED', sequence, startedAt, stepResults, result.failureReason);
    }
    if (result.status === 'FAILED' && sequence.stopOnFailure !== false) {
      return sequenceResult('FAILED', sequence, startedAt, stepResults, result.failureReason);
    }
  }

  const failure = stepResults.find((step) => step.status === 'FAILED');
  return sequenceResult(failure ? 'FAILED' : 'SUCCESS', sequence, startedAt, stepResults, failure?.failureReason);
}

async function executeStepWithEvidence(serial, step, index, dependencies) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const evidence = {};
  try {
    if (step.evidence.before) evidence.before = await dependencies.captureScreenshot(serial);
    const output = await executeStep(serial, step, dependencies);
    if (step.evidence.after) evidence.after = await dependencies.captureScreenshot(serial);
    return {
      index,
      id: step.id,
      name: step.name,
      command: step.command,
      status: 'SUCCESS',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      output,
      ...(Object.keys(evidence).length ? { evidence } : {}),
    };
  } catch (error) {
    if (step.evidence.onFailure) {
      try {
        evidence.failure = await dependencies.captureScreenshot(serial);
      } catch (captureError) {
        evidence.failureCaptureError = failureReason(captureError, index, step);
      }
    }
    const failure = failureReason(error, index, step);
    return {
      index,
      id: step.id,
      name: step.name,
      command: step.command,
      status: failure.code === 'ACTION_REQUIRED' ? 'ACTION_REQUIRED' : 'FAILED',
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedMs,
      failureReason: failure,
      ...(Object.keys(evidence).length ? { evidence } : {}),
    };
  }
}

async function executeStep(serial, step, dependencies) {
  if (UI_MUTATIONS.has(step.command)) {
    const before = await dumpUi(serial, dependencies);
    assertSafeUi(before);
  }

  let output;
  switch (step.command) {
    case 'HEALTH_CHECK':
      output = await dependencies.healthCheck(serial, step.parameters.packageName);
      break;
    case 'SCREENSHOT':
      output = await dependencies.captureScreenshot(serial);
      break;
    case 'OPEN_APP':
      output = await dependencies.openApp(serial, step.parameters.packageName);
      break;
    case 'STOP_APP':
      output = await dependencies.stopApp(serial, step.parameters.packageName);
      break;
    case 'PUSH_FILE':
      output = dependencies.pushFile ? await dependencies.pushFile(serial, step.parameters) : { status: 'pushed' };
      break;
    case 'REBOOT_DEVICE':
      output = dependencies.rebootDevice ? await dependencies.rebootDevice(serial) : { status: 'rebooting' };
      break;
    case 'TAP':
      output = await tap(serial, step.parameters, dependencies);
      break;
    case 'TAP_UI':
      output = await tapUi(serial, step, dependencies);
      break;
    case 'SWIPE':
      output = await swipe(serial, step.parameters, dependencies);
      break;
    case 'TYPE_TEXT':
      output = await typeText(serial, step.parameters, dependencies);
      break;
    case 'KEYEVENT':
      output = await keyevent(serial, step.parameters.keyCode ?? step.parameters.code, dependencies);
      break;
    case 'BACK':
      output = await keyevent(serial, 'BACK', dependencies);
      break;
    case 'HOME':
      output = await keyevent(serial, 'HOME', dependencies);
      break;
    case 'WAIT_UI':
      output = await waitUi(serial, step, dependencies);
      break;
    case 'DUMP_UI':
      output = await dumpUi(serial, dependencies);
      break;
    case 'SLEEP': {
      const durationMs = boundedInteger(step.parameters?.durationMs ?? step.parameters?.ms ?? 1000, 1000, 50, 60_000, 'durationMs');
      await (dependencies.sleep || sleep)(durationMs);
      output = { durationMs };
      break;
    }
    default:
      throw codedError('UNSUPPORTED_AUTOMATION_STEP', `Unsupported automation step ${step.command}`);
  }

  if (POST_ACTION_INSPECTION.has(step.command)) {
    const after = await dumpUi(serial, dependencies);
    assertSafeUi(after);
    return { ...output, uiAfter: summarizeUi(after) };
  }
  return output;
}

async function tap(serial, parameters, dependencies) {
  const x = coordinate(parameters.x, 'x');
  const y = coordinate(parameters.y, 'y');
  await dependencies.shell(serial, ['input', 'tap', String(x), String(y)]);
  return { coordinates: { x, y } };
}

async function tapUi(serial, step, dependencies) {
  const snapshot = await dumpUi(serial, dependencies);
  assertSafeUi(snapshot);
  const match = resolveSelector(snapshot.nodes, step.selectors);
  if (!match) {
    const error = codedError('UI_SELECTOR_NOT_FOUND', `No selector matched for ${step.id}`);
    error.selectorAttempts = step.selectors.map(selectorDescription);
    error.ui = summarizeUi(snapshot);
    throw error;
  }
  await dependencies.shell(serial, ['input', 'tap', String(match.x), String(match.y)]);
  return {
    selectorUsed: selectorDescription(match.selector),
    coordinates: { x: match.x, y: match.y },
    matchedNode: match.node ? publicNode(match.node) : null,
  };
}

async function swipe(serial, parameters, dependencies) {
  const x1 = coordinate(parameters.x1, 'x1');
  const y1 = coordinate(parameters.y1, 'y1');
  const x2 = coordinate(parameters.x2, 'x2');
  const y2 = coordinate(parameters.y2, 'y2');
  const durationMs = boundedInteger(parameters.durationMs, 300, 50, 10_000, 'durationMs');
  await dependencies.shell(serial, ['input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(durationMs)]);
  return { from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, durationMs };
}

async function typeText(serial, parameters, dependencies) {
  const text = String(parameters.text ?? '');
  if (!text || text.length > 2_000 || text.includes('\0')) {
    throw codedError('INVALID_TEXT_INPUT', 'TYPE_TEXT requires 1-2000 characters without null bytes');
  }

  const isUnicode = /[^\x00-\x7F]/.test(text);
  const textInputMode = process.env.TEXT_INPUT_MODE || 'auto';

  if (isUnicode && textInputMode === 'auto') {
    const adbKeyboardPkg = process.env.ADB_KEYBOARD_PACKAGE || 'com.android.adbkeyboard';
    const adbKeyboardIme = process.env.ADB_KEYBOARD_IME || 'com.android.adbkeyboard/.AdbIME';

    let installed = false;
    try {
      const pmOutput = await dependencies.shell(serial, ['pm', 'list', 'packages', adbKeyboardPkg]);
      installed = Boolean(pmOutput && pmOutput.includes(adbKeyboardPkg));
    } catch {
      installed = false;
    }

    if (!installed) {
      throw codedError('ADB_KEYBOARD_REQUIRED', 'Thai/Lao/Unicode text input requires ADB Keyboard (com.android.adbkeyboard)');
    }

    try {
      await dependencies.shell(serial, ['ime', 'set', adbKeyboardIme]);
    } catch { /* ignore */ }

    await dependencies.shell(serial, ['am', 'broadcast', '-a', 'ADB_INPUT_TEXT', '--es', 'msg', text]);
    return { characterCount: text.length, method: 'adb_keyboard' };
  }

  const encoded = text.replace(/%/g, '\\%').replace(/\s/g, '%s');
  await dependencies.shell(serial, ['input', 'text', encoded]);
  return { characterCount: text.length, method: 'adb_input' };
}

async function keyevent(serial, rawCode, dependencies) {
  const code = String(rawCode || '').trim().toUpperCase().replace(/^KEYCODE_/, '');
  if (!/^(?:[A-Z][A-Z0-9_]{0,40}|\d{1,4})$/.test(code)) {
    throw codedError('INVALID_KEYEVENT', `Invalid Android keyevent ${code || '(empty)'}`);
  }
  await dependencies.shell(serial, ['input', 'keyevent', code]);
  return { keyCode: code };
}

async function waitUi(serial, step, dependencies) {
  const deadline = Date.now() + step.timeoutMs;
  let snapshot;
  while (Date.now() <= deadline) {
    snapshot = await dumpUi(serial, dependencies);
    assertSafeUi(snapshot);
    const match = resolveSelector(snapshot.nodes, step.selectors, false);
    if (match) {
      return {
        selectorUsed: selectorDescription(match.selector),
        matchedNode: match.node ? publicNode(match.node) : null,
        waitedMs: Math.max(0, step.timeoutMs - (deadline - Date.now())),
      };
    }
    await (dependencies.sleep || sleep)(Math.min(500, Math.max(0, deadline - Date.now())));
  }
  const error = codedError('UI_TIMEOUT', `UI selector did not appear within ${step.timeoutMs}ms`);
  error.selectorAttempts = step.selectors.map(selectorDescription);
  error.ui = snapshot ? summarizeUi(snapshot) : undefined;
  throw error;
}

async function dumpUi(serial, dependencies) {
  let xml = '';
  try {
    await dependencies.shell(serial, ['uiautomator', 'dump', UI_DUMP_PATH]);
    xml = String(await dependencies.shell(serial, ['cat', UI_DUMP_PATH]));
  } catch (error) {
    const wrapped = codedError('UI_DUMP_FAILED', error.message || 'Android UI hierarchy dump failed');
    wrapped.adbOutput = error.adbOutput || '';
    throw wrapped;
  } finally {
    await dependencies.shell(serial, ['rm', '-f', UI_DUMP_PATH]).catch(() => undefined);
  }
  if (!xml.includes('<hierarchy')) throw codedError('UI_DUMP_INVALID', 'Android UI hierarchy dump is not valid XML');
  const nodes = parseUiXml(xml);
  return { capturedAt: new Date().toISOString(), xml, nodes, nodeCount: nodes.length };
}

function parseUiXml(xml) {
  const nodes = [];
  const nodePattern = /<node\b([^>]*?)(?:\/?>)/g;
  let nodeMatch;
  while ((nodeMatch = nodePattern.exec(String(xml)))) {
    const attributes = {};
    const attributePattern = /([\w:-]+)=(?:"([^"]*)"|'([^']*)')/g;
    let attributeMatch;
    while ((attributeMatch = attributePattern.exec(nodeMatch[1]))) {
      attributes[attributeMatch[1]] = decodeXml(attributeMatch[2] ?? attributeMatch[3] ?? '');
    }
    const bounds = parseBounds(attributes.bounds);
    nodes.push({
      text: attributes.text || '',
      resourceId: attributes['resource-id'] || '',
      contentDescription: attributes['content-desc'] || '',
      className: attributes.class || '',
      packageName: attributes.package || '',
      clickable: attributes.clickable === 'true',
      enabled: attributes.enabled !== 'false',
      bounds,
    });
  }
  return nodes;
}

function resolveSelector(nodes, selectors, allowCoordinate = true) {
  for (const selector of selectors || []) {
    if (selector.strategy === 'coordinate') {
      if (!allowCoordinate) continue;
      return { selector, x: coordinate(selector.x, 'selector.x'), y: coordinate(selector.y, 'selector.y'), node: null };
    }
    const field = selector.strategy;
    const expected = String(selector.value || '').trim();
    const node = nodes.find((candidate) => String(candidate[field] || '').trim() === expected && candidate.enabled && candidate.bounds);
    if (node) {
      return {
        selector,
        node,
        x: Math.floor((node.bounds.left + node.bounds.right) / 2),
        y: Math.floor((node.bounds.top + node.bounds.bottom) / 2),
      };
    }
  }
  return null;
}

function detectChallenge(snapshot) {
  for (const node of snapshot.nodes) {
    const haystack = [node.text, node.contentDescription, node.resourceId].filter(Boolean).join(' | ');
    for (const challenge of CHALLENGE_PATTERNS) {
      if (challenge.pattern.test(haystack)) {
        return { kind: challenge.kind, matched: haystack.slice(0, 240), node: publicNode(node) };
      }
    }
  }
  return null;
}

function assertSafeUi(snapshot) {
  const challenge = detectChallenge(snapshot);
  if (!challenge) return;
  const error = codedError('ACTION_REQUIRED', `${challenge.kind} requires operator action; automation stopped`);
  error.actionRequired = challenge;
  error.ui = summarizeUi(snapshot);
  throw error;
}

function normalizeSequence(parameters) {
  if (!parameters || typeof parameters !== 'object' || !Array.isArray(parameters.steps)) {
    throw codedError('INVALID_AUTOMATION_SEQUENCE', 'AUTOMATION_SEQUENCE requires a steps array');
  }
  if (parameters.steps.length === 0 || parameters.steps.length > 100) {
    throw codedError('INVALID_AUTOMATION_SEQUENCE', 'AUTOMATION_SEQUENCE must contain 1-100 steps');
  }
  const steps = parameters.steps.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw codedError('INVALID_AUTOMATION_STEP', `Step ${index + 1} must be an object`);
    }
    const command = String(raw.command || '').toUpperCase();
    if (!SUPPORTED_COMMANDS.has(command)) throw codedError('UNSUPPORTED_AUTOMATION_STEP', `Unsupported automation step ${command || '(empty)'}`);
    const selectors = Array.isArray(raw.selectors) ? raw.selectors.map(normalizeSelector) : [];
    if (['TAP_UI', 'WAIT_UI'].includes(command) && selectors.length === 0) {
      throw codedError('INVALID_SELECTOR_CHAIN', `${command} requires at least one selector`);
    }
    return {
      id: String(raw.id || `step-${index + 1}`),
      name: String(raw.name || `${index + 1}. ${command}`),
      command,
      parameters: raw.parameters && typeof raw.parameters === 'object' && !Array.isArray(raw.parameters) ? raw.parameters : {},
      selectors,
      timeoutMs: boundedInteger(raw.timeoutMs, command === 'WAIT_UI' ? 15_000 : 30_000, 100, 120_000, 'timeoutMs'),
      evidence: {
        before: raw.evidence?.before === true,
        after: raw.evidence?.after === true,
        onFailure: raw.evidence?.onFailure === true,
      },
    };
  });
  return {
    sequenceVersion: Number(parameters.sequenceVersion || 1),
    recipeId: String(parameters.recipeId || ''),
    recipeVersion: Number(parameters.recipeVersion || 1),
    stopOnFailure: parameters.stopOnFailure !== false,
    steps,
  };
}

function normalizeSelector(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw codedError('INVALID_SELECTOR_CHAIN', 'Selector must be an object');
  const strategy = String(raw.strategy || '');
  if (!['resourceId', 'contentDescription', 'text', 'coordinate'].includes(strategy)) {
    throw codedError('INVALID_SELECTOR_CHAIN', `Unsupported selector strategy ${strategy || '(empty)'}`);
  }
  if (strategy === 'coordinate') return { strategy, x: coordinate(raw.x, 'selector.x'), y: coordinate(raw.y, 'selector.y') };
  const value = String(raw.value || '').trim();
  if (!value) throw codedError('INVALID_SELECTOR_CHAIN', `${strategy} selector requires a value`);
  return { strategy, value };
}

function sequenceResult(status, sequence, startedAt, steps, failure) {
  return {
    status,
    sequenceVersion: sequence.sequenceVersion,
    recipeId: sequence.recipeId,
    recipeVersion: sequence.recipeVersion,
    startedAt,
    completedAt: new Date().toISOString(),
    completedSteps: steps.filter((step) => step.status === 'SUCCESS').length,
    totalSteps: sequence.steps.length,
    steps,
    ...(failure ? { failureReason: failure } : {}),
  };
}

function failureReason(error, stepIndex, step) {
  const code = String(error?.code || 'AUTOMATION_STEP_FAILED');
  return {
    code,
    message: String(error?.message || error || 'Automation step failed'),
    retryable: RETRYABLE_CODES.has(code),
    stepIndex,
    stepId: step.id,
    command: step.command,
    adbOutput: String(error?.adbOutput || ''),
    ...(error?.selectorAttempts ? { selectorAttempts: error.selectorAttempts } : {}),
    ...(error?.actionRequired ? { actionRequired: error.actionRequired } : {}),
    ...(error?.ui ? { ui: error.ui } : {}),
  };
}

function summarizeUi(snapshot) {
  return {
    capturedAt: snapshot.capturedAt,
    nodeCount: snapshot.nodeCount,
    packages: [...new Set(snapshot.nodes.map((node) => node.packageName).filter(Boolean))].slice(0, 10),
    visibleTexts: snapshot.nodes.map((node) => node.text || node.contentDescription).filter(Boolean).slice(0, 30),
  };
}

function publicNode(node) {
  return {
    text: node.text,
    resourceId: node.resourceId,
    contentDescription: node.contentDescription,
    className: node.className,
    packageName: node.packageName,
    bounds: node.bounds,
  };
}

function selectorDescription(selector) {
  return selector.strategy === 'coordinate'
    ? { strategy: selector.strategy, x: selector.x, y: selector.y }
    : { strategy: selector.strategy, value: selector.value };
}

function parseBounds(value) {
  const match = String(value || '').match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) return null;
  const [, left, top, right, bottom] = match.map(Number);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

function decodeXml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function coordinate(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100_000) {
    throw codedError('INVALID_COORDINATE', `${field} must be a non-negative integer`);
  }
  return number;
}

function boundedInteger(value, fallback, minimum, maximum, field) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw codedError('INVALID_AUTOMATION_PARAMETER', `${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return number;
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  executeAutomationSequence,
  parseUiXml,
  resolveSelector,
  detectChallenge,
  normalizeSequence,
};
