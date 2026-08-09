'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Battery,
  BatteryWarning,
  CheckCircle2,
  Clock3,
  Flame,
  HardDrive,
  Loader2,
  Monitor,
  RefreshCw,
  Search,
  Smartphone,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';

type JsonRecord = Record<string, unknown>;

type DeviceView = {
  id: string;
  code: string;
  name: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  osVersion: string | null;
  status: string;
  battery: number;
  storageUsed: number;
  storageTotal: number;
  lastHeartbeatAt: string | null;
  currentJobId: string | null;
  nodeId: string | null;
};

type FleetSummary = {
  total: number;
  online: number;
  busy: number;
  warning: number;
  error: number;
  offline: number;
  connecting: number;
  avgBattery: number;
};

type StatusFilter = 'ALL' | 'ONLINE' | 'OFFLINE' | 'WARNING' | 'ERROR' | 'BUSY';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || apiUrl;

export default function FleetPage() {
  const [devices, setDevices] = useState<DeviceView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const devicesRef = useRef<DeviceView[]>([]);

  const requestHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const loadDevices = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/api/v1/devices`, {
        cache: 'no-store',
        headers: requestHeaders(),
      });
      const payload = await readPayload(response);
      const records = extractDeviceRecords(payload);
      const normalized = records.map(normalizeDevice);
      setDevices(normalized);
      devicesRef.current = normalized;
    } catch (requestError) {
      setError(errorMessage(requestError, 'ไม่สามารถโหลดข้อมูลอุปกรณ์จาก Backend API ได้'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [requestHeaders]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    let disposed = false;
    let socket: { on: (event: string, listener: (payload?: unknown) => void) => void; disconnect: () => void } | undefined;

    void import('socket.io-client').then(({ io }) => {
      if (disposed) return;
      const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
      socket = io(wsUrl, { auth: token ? { token } : undefined, reconnection: true });
      socket.on('connect', () => setSocketConnected(true));
      socket.on('disconnect', () => setSocketConnected(false));
      socket.on('connect_error', () => setSocketConnected(false));
      socket.on('deviceUpdate', (payload) => {
        const record = extractDeviceEvent(payload);
        if (!record) return;
        const updated = normalizeDevice(record);
        setDevices((current) => {
          const idx = current.findIndex((d) => d.id === updated.id || d.code === updated.code);
          if (idx >= 0) {
            const next = [...current];
            next[idx] = { ...current[idx], ...updated };
            devicesRef.current = next;
            return next;
          }
          const next = [...current, updated].sort((a, b) => a.code.localeCompare(b.code));
          devicesRef.current = next;
          return next;
        });
        setError('');
      });
    }).catch(() => setSocketConnected(false));

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, []);

  const summary: FleetSummary = {
    total: devices.length,
    online: devices.filter((d) => d.status === 'ONLINE').length,
    busy: devices.filter((d) => d.status === 'BUSY').length,
    warning: devices.filter((d) => d.status === 'WARNING').length,
    error: devices.filter((d) => d.status === 'ERROR').length,
    offline: devices.filter((d) => d.status === 'OFFLINE').length,
    connecting: devices.filter((d) => d.status === 'CONNECTING').length,
    avgBattery: devices.length > 0
      ? Math.round(devices.reduce((sum, d) => sum + d.battery, 0) / devices.length)
      : 0,
  };

  const filtered = devices.filter((d) => {
    if (filter !== 'ALL' && d.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.code.toLowerCase().includes(q) ||
        (d.model || '').toLowerCase().includes(q) ||
        (d.serialNumber || '').toLowerCase().includes(q) ||
        (d.name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Fleet Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-cyber-blue to-neon-cyan">
              <Monitor className="h-4 w-4 text-dark-navy" />
            </div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-cyber-blue">Automation Control</p>
          </div>
          <h1 className="mt-2 break-words font-mono text-2xl font-bold text-white sm:text-3xl">Android Fleet</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-400">
            ระบบควบคุมโทรศัพท์ Android แบบ Fleet — ตรวจสอบสถานะ สั่งงาน และจัดการอุปกรณ์ทั้งหมดแบบ Real-time
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-online flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 text-warning-orange" />
            Firebase Sync Live
          </span>
          <button
            type="button"
            className="btn-outline flex items-center gap-2 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void loadDevices(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh Fleet
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <section className="card border-error-red bg-error-red/10" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error-red" />
            <div className="min-w-0">
              <h2 className="font-mono font-bold text-error-red">โหลดข้อมูล Fleet ไม่สำเร็จ</h2>
              <p className="mt-1 break-words text-sm text-gray-300">{error}</p>
            </div>
          </div>
        </section>
      )}

      {/* Fleet Summary KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Total Devices" value={summary.total} icon={<Smartphone className="h-4 w-4" />} />
        <KpiCard label="Online" value={summary.online} icon={<CheckCircle2 className="h-4 w-4" />} color="text-status-green" />
        <KpiCard label="Busy" value={summary.busy} icon={<Zap className="h-4 w-4" />} color="text-cyber-blue" />
        <KpiCard label="Warning" value={summary.warning} icon={<AlertTriangle className="h-4 w-4" />} color="text-warning-orange" />
        <KpiCard label="Error" value={summary.error} icon={<AlertTriangle className="h-4 w-4" />} color="text-error-red" />
        <KpiCard label="Offline" value={summary.offline} icon={<WifiOff className="h-4 w-4" />} color="text-gray-500" />
        <KpiCard label="Connecting" value={summary.connecting} icon={<Loader2 className="h-4 w-4 animate-spin" />} color="text-warning-orange" />
        <KpiCard label="Avg Battery" value={`${summary.avgBattery}%`} icon={<Battery className="h-4 w-4" />} color="text-status-green" />
      </section>

      {/* Filter & Search Bar */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['ALL', 'ONLINE', 'BUSY', 'WARNING', 'ERROR', 'OFFLINE'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              className={`rounded border px-3 py-1.5 font-mono text-xs font-bold transition-all duration-200 ${
                filter === status
                  ? 'border-cyber-blue bg-cyber-blue/20 text-cyber-blue'
                  : 'border-pixel-border text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}
              onClick={() => setFilter(status)}
            >
              {status}
              {status !== 'ALL' && (
                <span className="ml-1 opacity-70">
                  ({devices.filter((d) => d.status === status).length})
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="ค้นหา code, model, serial..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10 sm:w-72"
          />
        </div>
      </section>

      {/* Fleet Grid */}
      {loading ? (
        <section className="card flex min-h-56 items-center justify-center">
          <div className="flex items-center gap-3 font-mono text-sm text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin text-cyber-blue" />
            กำลังโหลดข้อมูล Fleet จาก Backend…
          </div>
        </section>
      ) : filtered.length === 0 && devices.length === 0 ? (
        <EmptyFleet />
      ) : filtered.length === 0 ? (
        <section className="card flex min-h-40 items-center justify-center">
          <p className="font-mono text-sm text-gray-500">
            ไม่พบอุปกรณ์ที่ตรงกับเงื่อนไขค้นหา
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((device) => (
            <DeviceCard key={device.id || device.code} device={device} />
          ))}
        </section>
      )}
    </div>
  );
}

/* ──── Sub-components ──── */

function KpiCard({ label, value, icon, color }: { label: string; value: number | string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="card min-w-0 !p-3">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-gray-500">{icon}<span>{label}</span></div>
      <p className={`mt-1.5 font-mono text-2xl font-bold ${color || 'text-white'}`}>{value}</p>
    </div>
  );
}

function DeviceCard({ device }: { device: DeviceView }) {
  const batteryColor = device.battery > 50 ? 'bg-status-green' : device.battery > 20 ? 'bg-warning-orange' : 'bg-error-red';
  const storagePercent = device.storageTotal > 0 ? Math.min(100, Math.round((device.storageUsed / device.storageTotal) * 100)) : 0;
  const storageColor = storagePercent > 90 ? 'bg-error-red' : storagePercent > 70 ? 'bg-warning-orange' : 'bg-cyber-blue';

  return (
    <Link href={`/devices/${encodeURIComponent(device.code)}`} className="group">
      <article className="card relative overflow-hidden transition-all duration-300 hover:border-cyber-blue/60 hover:shadow-glow group-hover:scale-[1.01]">
        {/* Status Indicator Strip */}
        <div className={`absolute inset-y-0 left-0 w-1 ${statusStripColor(device.status)}`} />

        {/* Header */}
        <div className="flex items-start justify-between gap-2 pl-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusDot status={device.status} />
              <h3 className="font-mono text-sm font-bold text-white">{device.code}</h3>
            </div>
            <p className="mt-1 truncate text-xs text-gray-400">{device.model || device.name || 'Unknown Device'}</p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-gray-600">{device.serialNumber || 'No Serial'}</p>
          </div>
          <StatusBadge status={device.status} />
        </div>

        {/* Metrics */}
        <div className="mt-3 grid grid-cols-2 gap-3 pl-3">
          {/* Battery */}
          <div>
            <div className="flex items-center gap-1.5">
              {device.battery <= 20 ? (
                <BatteryWarning className="h-3 w-3 text-error-red" />
              ) : (
                <Battery className="h-3 w-3 text-gray-500" />
              )}
              <span className="font-mono text-xs text-gray-400">Battery</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-600">
                <div className={`h-full rounded-full transition-all duration-500 ${batteryColor}`} style={{ width: `${device.battery}%` }} />
              </div>
              <span className="font-mono text-xs font-bold text-white">{device.battery}%</span>
            </div>
          </div>

          {/* Storage */}
          <div>
            <div className="flex items-center gap-1.5">
              <HardDrive className="h-3 w-3 text-gray-500" />
              <span className="font-mono text-xs text-gray-400">Storage</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-600">
                <div className={`h-full rounded-full transition-all duration-500 ${storageColor}`} style={{ width: `${storagePercent}%` }} />
              </div>
              <span className="font-mono text-xs font-bold text-white">{storagePercent}%</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between border-t border-pixel-border/50 pl-3 pt-2">
          <div className="flex items-center gap-1.5">
            <Clock3 className="h-3 w-3 text-gray-600" />
            <span className="font-mono text-[10px] text-gray-500">{formatTimeAgo(device.lastHeartbeatAt)}</span>
          </div>
          {device.currentJobId && (
            <span className="badge badge-info !py-0 !text-[9px]">RUNNING JOB</span>
          )}
        </div>
      </article>
    </Link>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === 'ONLINE' ? 'bg-status-green' : status === 'BUSY' ? 'bg-cyber-blue' : ['WARNING', 'CONNECTING'].includes(status) ? 'bg-warning-orange' : status === 'ERROR' ? 'bg-error-red' : 'bg-gray-600';
  const pulse = status === 'ONLINE' || status === 'BUSY';
  return (
    <span className="relative flex h-2.5 w-2.5">
      {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${color}`} />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const className = normalized === 'ONLINE' ? 'badge-online'
    : normalized === 'BUSY' ? 'badge-info'
      : ['WARNING', 'CONNECTING'].includes(normalized) ? 'badge-warning'
        : normalized === 'ERROR' ? 'badge-error'
          : 'badge-offline';
  return <span className={`badge self-start !text-[10px] ${className}`}>{normalized}</span>;
}

function EmptyFleet() {
  return (
    <section className="card border-warning-orange/70">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-warning-orange" />
        <div className="min-w-0">
          <h2 className="font-mono text-lg font-bold text-warning-orange">ยังไม่พบอุปกรณ์ Android ใน Fleet</h2>
          <p className="mt-2 text-sm text-gray-300">
            ระบบจะตรวจจับอุปกรณ์ Android ที่เชื่อมต่อผ่าน ADB โดยอัตโนมัติ หรือสั่งลงทะเบียนผ่าน Device Agent
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-gray-400">
            <li>เปิด PostgreSQL, Redis และ Backend API</li>
            <li>เชื่อมโทรศัพท์ Android ผ่านสาย USB และเปิด USB Debugging</li>
            <li>ยอมรับ ADB Authorization บนหน้าจอโทรศัพท์</li>
            <li>ระบบจะตรวจพบและลงทะเบียนอุปกรณ์อัตโนมัติ (Auto-sync ทุก 5 วินาที)</li>
            <li>หรือเริ่ม Device Agent ด้วย <code className="text-gray-200">DEVICE_CODE</code> ที่ต้องการ</li>
          </ol>
          <div className="mt-4 rounded border border-pixel-border bg-navy-700 p-3">
            <p className="font-mono text-xs text-gray-400">เริ่ม Device Agent สำหรับแต่ละอุปกรณ์:</p>
            <pre className="mt-2 font-mono text-xs text-cyber-blue">
{`DEVICE_CODE=PHONE-001 npm run dev:agent
DEVICE_CODE=PHONE-002 ANDROID_DEVICE_SERIAL=xxxx npm run dev:agent`}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──── Utility functions ──── */

function statusStripColor(status: string): string {
  const s = status.toUpperCase();
  if (s === 'ONLINE') return 'bg-status-green';
  if (s === 'BUSY') return 'bg-cyber-blue';
  if (s === 'WARNING' || s === 'CONNECTING') return 'bg-warning-orange';
  if (s === 'ERROR') return 'bg-error-red';
  return 'bg-gray-600';
}

function formatTimeAgo(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { message: text }; }
  }
  const record = asRecord(body);
  if (!response.ok || record?.success === false) {
    const message = record?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : typeof message === 'string' ? message : `Backend API ตอบกลับ HTTP ${response.status}`);
  }
  return record && Object.prototype.hasOwnProperty.call(record, 'data') ? record.data : body;
}

function extractDeviceRecords(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload.map(asRecord).filter((record): record is JsonRecord => Boolean(record));
  const record = asRecord(payload);
  const candidates = record?.devices;
  return Array.isArray(candidates) ? candidates.map(asRecord).filter((item): item is JsonRecord => Boolean(item)) : [];
}

function extractDeviceEvent(payload: unknown): JsonRecord | null {
  const outer = asRecord(payload);
  const data = asRecord(outer?.data);
  return asRecord(outer?.device) || asRecord(data?.device) || data || outer;
}

function normalizeDevice(record: JsonRecord): DeviceView {
  return {
    id: firstString(record.id, record.deviceId) || firstString(record.code) || '',
    code: firstString(record.code, record.deviceCode) || 'UNKNOWN',
    name: firstString(record.name) || '',
    serialNumber: nullableString(record.serialNumber, record.serial),
    manufacturer: nullableString(record.manufacturer),
    model: nullableString(record.model),
    osVersion: nullableString(record.osVersion, record.androidVersion),
    status: firstString(record.adbStatus, record.status).toUpperCase() || 'UNKNOWN',
    battery: safeNumber(record.battery ?? record.batteryLevel, 0),
    storageUsed: safeNumber(record.storageUsed, 0),
    storageTotal: safeNumber(record.storageTotal, 0),
    lastHeartbeatAt: nullableString(record.lastHeartbeatAt),
    currentJobId: nullableString(record.currentJobId),
    nodeId: nullableString(record.nodeId),
  };
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function nullableString(...values: unknown[]) {
  return firstString(...values) || null;
}

function safeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
