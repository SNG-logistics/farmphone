const http = require('http');

/**
 * ADB Bridge — local HTTP server บน host ที่โทรศัพท์เข้าถึงผ่าน `adb reverse tcp:3200 tcp:3200`
 *
 * โทรศัพท์เชื่อมมาที่ http://localhost:3200 โดยไม่ต้องรู้ IP/LAN หรือ URL ของ backend
 * Server นี้ bind เฉพาะ 127.0.0.1 เท่านั้น: ภายนอกเข้าไม่ได้, เข้าถึงได้เฉพาะโทรศัพท์
 * ที่ต่อ USB + adb reverse เท่านั้น
 */

const DEFAULT_PORT = 3200;
const DEFAULT_HOST = '127.0.0.1';

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

/**
 * @param {object} options
 * @param {object} options.config  — device-agent config object
 * @param {() => object} options.getState  — คืน state ปัจจุบันของ agent (serial, status, battery, storage, etc.)
 */
function createAdbBridge({ config, getState }) {
  const port = Number(config.bridgePort) || DEFAULT_PORT;
  const host = String(config.bridgeHost || DEFAULT_HOST);

  const server = http.createServer((request, response) => {
    if (request.method === 'GET' && (request.url === '/health' || request.url === '/api/bridge/health')) {
      const state = getState();
      sendJson(response, 200, {
        status: 'ok',
        service: 'farm-phone-adb-bridge',
        version: config.agentVersion || '1.0.0',
        deviceCode: config.deviceCode,
        timestamp: new Date().toISOString(),
        device: {
          serial: state.serial || null,
          status: state.status || 'CONNECTING',
          connected: Boolean(state.serial),
        },
      });
      return;
    }

    if (request.method === 'GET' && (request.url === '/state' || request.url === '/api/bridge/state')) {
      const state = getState();
      sendJson(response, 200, {
        status: 'ok',
        timestamp: new Date().toISOString(),
        bridge: {
          connected: Boolean(state.serial),
          deviceCode: config.deviceCode,
          serial: state.serial || null,
        },
        device: {
          status: state.status || 'CONNECTING',
          batteryLevel: state.batteryLevel ?? null,
          storageUsed: state.storageUsed ?? null,
          storageTotal: state.storageTotal ?? null,
          androidVersion: state.androidVersion || null,
          model: state.model || null,
          manufacturer: state.manufacturer || null,
          uptimeSeconds: state.uptimeSeconds ?? null,
          currentJobId: state.currentJobId || null,
        },
        updatedAt: state.lastInfoAt || null,
      });
      return;
    }

    if (request.method === 'POST' && (request.url === '/command' || request.url === '/api/bridge/command')) {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) request.destroy();
      });
      request.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(body || '{}');
        } catch {
          sendJson(response, 400, { status: 'error', message: 'Invalid JSON body' });
          return;
        }
        const action = String(parsed.action || '').trim();
        if (!action) {
          sendJson(response, 400, { status: 'error', message: 'Missing action' });
          return;
        }
        // Bridge รับได้เฉพาะคำสั่งปลอดภัยที่ขอมาจากโทรศัพท์จริง (localhost ผ่าน adb reverse)
        if (['PING'].includes(action.toUpperCase())) {
          sendJson(response, 200, { status: 'ok', pong: true, timestamp: new Date().toISOString() });
          return;
        }
        sendJson(response, 400, { status: 'error', message: `Unsupported bridge action: ${action}` });
      });
      return;
    }

    sendJson(response, 404, { status: 'error', message: 'Not found' });
  });

  function listen() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  }

  function close() {
    return new Promise((resolve) => server.close(resolve));
  }

  return { server, listen, close, port, host };
}

module.exports = { createAdbBridge, DEFAULT_PORT, DEFAULT_HOST };
