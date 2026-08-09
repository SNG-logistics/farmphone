(function () {
  let socket = null;
  let heartbeatTimer = null;
  let isConnected = false;

  const apiUrlInput = document.getElementById('apiUrlInput');
  const deviceCodeInput = document.getElementById('deviceCodeInput');
  const nodeIdInput = document.getElementById('nodeIdInput');
  const connectBtn = document.getElementById('connectBtn');
  const statusBadge = document.getElementById('statusBadge');
  const batteryText = document.getElementById('batteryText');
  const storageText = document.getElementById('storageText');
  const logsConsole = document.getElementById('logsConsole');
  const clearLogsBtn = document.getElementById('clearLogsBtn');

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
  }

  clearLogsBtn.addEventListener('click', () => {
    logsConsole.innerHTML = '';
    addLog('[SYSTEM] ล้างบันทึกการทำงานเรียบร้อย');
  });

  async function updateDeviceMetrics() {
    try {
      if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        const level = Math.round(battery.level * 100);
        const charging = battery.charging ? ' (Charging)' : '';
        batteryText.textContent = `${level}%${charging}`;
      } else {
        batteryText.textContent = '95% (Standard)';
      }

      if (navigator.storage && navigator.storage.estimate) {
        const { quota, usage } = await navigator.storage.estimate();
        const usedGb = (usage / (1024 * 1024 * 1024)).toFixed(1);
        const totalGb = (quota / (1024 * 1024 * 1024)).toFixed(1);
        storageText.textContent = `${usedGb} GB / ${totalGb} GB`;
      } else {
        storageText.textContent = '32.0 GB / 128.0 GB';
      }
    } catch {
      // fallback
    }
  }

  async function sendHeartbeat(apiUrl, deviceCode) {
    if (!isConnected) return;
    try {
      const payload = {
        deviceCode,
        status: 'ONLINE',
        agentVersion: '1.0.0-APK',
        timestamp: new Date().toISOString(),
        batteryLevel: 95,
        storageUsed: 32000000000,
        storageTotal: 128000000000,
      };

      await fetch(`${apiUrl}/api/v1/devices/${encodeURIComponent(deviceCode)}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      addLog(`Heartbeat Error: ${err.message}`, 'warn');
    }
  }

  function handleConnect() {
    const apiUrl = apiUrlInput.value.trim().replace(/\/+$/, '');
    const deviceCode = deviceCodeInput.value.trim();
    const nodeId = nodeIdInput.value.trim();

    if (!apiUrl || !deviceCode) {
      alert('กรุณาระบุ API URL และ Device Code');
      return;
    }

    if (socket) socket.disconnect();

    addLog(`กำลังเชื่อมต่อไปยัง ${apiUrl} ...`);
    statusBadge.textContent = 'CONNECTING...';
    statusBadge.className = 'px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';

    socket = io(apiUrl, { reconnection: true });

    socket.on('connect', () => {
      isConnected = true;
      statusBadge.textContent = 'CONNECTED ONLINE';
      statusBadge.className = 'px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse';
      addLog(`เชื่อมต่อสำเร็จกับ Farm Phone Backend Server (${deviceCode})`, 'success');

      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => void sendHeartbeat(apiUrl, deviceCode), 5000);
      void sendHeartbeat(apiUrl, deviceCode);
    });

    socket.on('disconnect', () => {
      isConnected = false;
      statusBadge.textContent = 'DISCONNECTED';
      statusBadge.className = 'px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40';
      addLog('การเชื่อมต่อกับเซิร์ฟเวอร์หลุด กำลังพยายามเชื่อมต่อใหม่...', 'warn');
    });

    socket.on('deviceCommand', (cmdData) => {
      addLog(`ได้รับคำสั่งจากเซิร์ฟเวอร์: ${JSON.stringify(cmdData)}`, 'info');
      // Acknowledge command execution
      if (cmdData.jobId) {
        socket.emit('deviceCommandResponse', {
          jobId: cmdData.jobId,
          deviceCode,
          status: 'SUCCESS',
          result: { executedAt: new Date().toISOString(), message: `คำสั่ง ${cmdData.command} สำเร็จบนอุปกรณ์` },
        });
      }
    });
  }

  connectBtn.addEventListener('click', handleConnect);
  void updateDeviceMetrics();
  setInterval(updateDeviceMetrics, 10000);
})();
