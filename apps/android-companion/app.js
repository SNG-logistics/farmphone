(function () {
  'use strict';

  const BRIDGE_BASE_URL = 'http://localhost:3200';
  const POLL_INTERVAL_MS = 3000;

  const statusBadge = document.getElementById('statusBadge');
  const bridgeAddress = document.getElementById('bridgeAddress');
  const deviceCodeText = document.getElementById('deviceCodeText');
  const deviceIdentity = document.getElementById('deviceIdentity');
  const androidVersionText = document.getElementById('androidVersionText');
  const currentJobText = document.getElementById('currentJobText');
  const batteryText = document.getElementById('batteryText');
  const storageText = document.getElementById('storageText');
  const logsConsole = document.getElementById('logsConsole');
  const clearLogsBtn = document.getElementById('clearLogsBtn');
  const reconnectBtn = document.getElementById('reconnectBtn');

  let lastBridgeState = null;
  let lastConnectivity = null;

  function addLog(message, type = 'info') {
    const p = document.createElement('p');
    const time = new Date().toLocaleTimeString();
    p.textContent = `[${time}] ${message}`;

    if (type === 'error') p.className = 'text-red-400 font-bold';
    else if (type === 'success') p.className = 'text-emerald-400 font-bold';
    else if (type === 'warn') p.className = 'text-amber-300';
    else p.className = 'text-gray-300';

    logsConsole.appendChild(p);
    logsConsole.scrollTop = logsConsole.scrollHeight;

    // จำกัดขนาด log ไว้ 200 บรรทัด
    while (logsConsole.children.length > 200) {
      logsConsole.removeChild(logsConsole.firstChild);
    }
  }

  function setBadge(text, styleClass) {
    statusBadge.textContent = text;
    statusBadge.className = `px-3 py-1 rounded-full text-xs font-mono font-bold ${styleClass}`;
  }

  function setConnectedBadge() {
    setBadge('CONNECTED', 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse');
  }

  function formatBytes(bytes) {
    if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return '—';
    const value = Number(bytes);
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function updateDeviceIdentity(state) {
    const model = state.device?.model || state.device?.manufacturer || null;
    deviceIdentity.textContent = state.bridge?.serial
      ? (model ? `${state.bridge.serial} · ${model}` : state.bridge.serial)
      : '—';
    androidVersionText.textContent = state.device?.androidVersion || '—';
    deviceCodeText.textContent = state.bridge?.deviceCode || 'PHONE-001';
    currentJobText.textContent = state.device?.currentJobId || 'ไม่มีลำดับงาน';
    batteryText.textContent = state.device?.batteryLevel !== null && state.device?.batteryLevel !== undefined
      ? `${state.device.batteryLevel}%`
      : '—';
    const used = state.device?.storageUsed;
    const total = state.device?.storageTotal;
    storageText.textContent = (used !== null && total !== null)
      ? `${formatBytes(used)} / ${formatBytes(total)}`
      : '—';
  }

  function handleState(state) {
    const connected = state.bridge && state.bridge.connected;

    if (connected) {
      if (!lastConnectivity) {
        addLog(`เชื่อมต่อ ADB Bridge สำเร็จ (${state.bridge.serial || 'serial ไม่ทราบ'})`, 'success');
      }
      setConnectedBadge();
      lastConnectivity = true;
    } else {
      if (lastConnectivity) {
        addLog('การเชื่อมต่อกับ ADB Bridge หลุด กำลังค้นหาใหม่...', 'warn');
      }
      setBadge('DISCONNECTED', 'bg-red-500/20 text-red-400 border border-red-500/40');
      lastConnectivity = false;
    }

    updateDeviceIdentity(state);
  }

  async function pollBridge() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const healthResponse = await fetch(`${BRIDGE_BASE_URL}/health`, { signal: controller.signal });
      if (!healthResponse.ok) throw new Error(`Bridge ตอบกลับ HTTP ${healthResponse.status}`);

      const stateResponse = await fetch(`${BRIDGE_BASE_URL}/state`, { signal: controller.signal });
      clearTimeout(timeout);

      if (!stateResponse.ok) throw new Error(`Bridge state ตอบกลับ HTTP ${stateResponse.status}`);

      const state = await stateResponse.json().catch(() => ({}));
      lastBridgeState = state;
      handleState(state);
    } catch (error) {
      if (lastConnectivity) {
        addLog(`ไม่สามารถติดต่อ ADB Bridge: ${error.message}`, 'warn');
        setBadge('DISCONNECTED', 'bg-red-500/20 text-red-400 border border-red-500/40');
        lastConnectivity = false;
      }
    }
  }

  function clearLogs() {
    logsConsole.innerHTML = '';
    addLog('[SYSTEM] ล้างบันทึกการทำงานเรียบร้อย');
  }

  function reconnect() {
    clearInterval(window._bridgePollTimer);
    addLog('[SYSTEM] กำลังลองเชื่อมต่อ ADB Bridge ใหม่...', 'warn');
    setBadge('CONNECTING...', 'bg-amber-500/20 text-amber-300 border border-amber-500/40');
    const firstPoll = pollBridge();
    const timer = setInterval(() => void pollBridge(), POLL_INTERVAL_MS);
    window._bridgePollTimer = timer;

    // รอรอบแรกเสร็จก่อนสตาร์ต interval ถัดไป
    firstPoll.then(() => {
      if (window._bridgePollTimer === timer) clearInterval(timer);
      void pollBridge();
      window._bridgePollTimer = setInterval(() => void pollBridge(), POLL_INTERVAL_MS);
    });
  }

  bridgeAddress.textContent = BRIDGE_BASE_URL;
  clearLogsBtn.addEventListener('click', clearLogs);
  reconnectBtn.addEventListener('click', reconnect);

  addLog(`[SYSTEM] เริ่มต้น — ADB Bridge ที่ ${BRIDGE_BASE_URL}`);
  addLog('[SYSTEM] รอให้ Device Agent สร้าง ADB Bridge (ต้องต่อสาย USB เข้าคอมพิวเตอร์)...');

  reconnect();
})();
