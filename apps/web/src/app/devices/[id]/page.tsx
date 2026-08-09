'use client';

import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, apiUrl, UPLOAD_TIMEOUT_MS } from '@/lib/api-client';
import ScreenMirror from '@/components/ScreenMirror';
import {
  Activity,
  AlertTriangle,
  AppWindow,
  ArrowLeft,
  Battery,
  Camera,
  CheckCircle2,
  Clock3,
  FileUp,
  Flame,
  HardDrive,
  HeartPulse,
  ImageIcon,
  Loader2,
  Power,
  RefreshCw,
  Smartphone,
  Square,
  Terminal,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';

type JsonRecord = Record<string, unknown>;
type Command = 'HEALTH_CHECK' | 'SCREENSHOT' | 'OPEN_APP' | 'STOP_APP' | 'RESTART_APP' | 'PUSH_FILE' | 'REBOOT_DEVICE';
type ActionPhase = 'idle' | 'loading' | 'success' | 'error';

type JobView = {
  id: string;
  command: string;
  status: string;
  attempts: number | null;
  maxAttempts: number | null;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  result: unknown;
  createdAt: string | null;
};

type LogView = {
  id: string;
  level: string;
  message: string;
  timestamp: string | null;
  adbOutput: string | null;
};

type ScreenshotView = {
  url: string;
  createdAt: string | null;
  jobId: string | null;
};

type DeviceView = {
  id: string;
  code: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  androidVersion: string | null;
  adbStatus: string;
  status: string;
  batteryLevel: number | null;
  storageUsed: number | null;
  storageTotal: number | null;
  lastHeartbeatAt: string | null;
  currentJob: JobView | null;
  lastJob: JobView | null;
  latestScreenshot: ScreenshotView | null;
  recentLogs: LogView[];
};

type ActionState = { phase: ActionPhase; message: string };

const wsUrl = process.env.NEXT_PUBLIC_WS_URL || apiUrl;
const ACTIVE_JOB_STATUSES = new Set(['CREATED', 'QUEUED', 'ASSIGNED', 'RUNNING', 'VERIFYING']);
const ACTIVE_FALLBACK_POLL_MS = 15_000;
const IDLE_FALLBACK_POLL_MS = 60_000;
const COMMANDS: Array<{ command: Exclude<Command, 'PUSH_FILE'>; label: string; icon: ReactNode; danger?: boolean }> = [
  { command: 'HEALTH_CHECK', label: 'Health Check', icon: <HeartPulse className="h-4 w-4" /> },
  { command: 'SCREENSHOT', label: 'Screenshot', icon: <Camera className="h-4 w-4" /> },
  { command: 'OPEN_APP', label: 'Open App', icon: <AppWindow className="h-4 w-4" /> },
  { command: 'STOP_APP', label: 'Stop App', icon: <Square className="h-4 w-4" /> },
  { command: 'RESTART_APP', label: 'Restart App', icon: <RefreshCw className="h-4 w-4" /> },
  { command: 'REBOOT_DEVICE', label: 'Reboot', icon: <Power className="h-4 w-4" />, danger: true },
];

export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const deviceCode = decodeURIComponent(params.id);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deviceIdRef = useRef<string>();
  const actionLocksRef = useRef(new Set<Command>());
  const pendingJobsRef = useRef<Partial<Record<Command, string>>>({});
  const [device, setDevice] = useState<DeviceView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [activeCommand, setActiveCommand] = useState<Command | null>(null);
  const [actions, setActions] = useState<Partial<Record<Command, ActionState>>>({});

  const requestHeaders = useCallback((json = false) => {
    const headers: Record<string, string> = {};
    if (json) headers['Content-Type'] = 'application/json';
    const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const fetchDevice = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setLoadError('');
    try {
      const response = await apiFetch(`/api/v1/devices/${encodeURIComponent(deviceCode)}`, {
        cache: 'no-store',
        headers: requestHeaders(),
      });
      const payload = await readPayload(response);
      setDevice(normalizeDevice(payload, deviceCode));
    } catch (error) {
      setLoadError(errorMessage(error, 'Unable to load device'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [deviceCode, requestHeaders]);

  useEffect(() => {
    void fetchDevice();
  }, [fetchDevice]);

  useEffect(() => {
    deviceIdRef.current = device?.id;
  }, [device?.id]);

  useEffect(() => {
    let disposed = false;
    let connectedOnce = false;
    let socket: { on: (event: string, listener: (payload?: unknown) => void) => void; disconnect: () => void } | undefined;

    void import('socket.io-client').then(({ io }) => {
      if (disposed) return;
      const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
      socket = io(wsUrl, { auth: token ? { token } : undefined, reconnection: true });
      socket.on('connect', () => {
        setSocketConnected(true);
        if (connectedOnce) void fetchDevice(true);
        connectedOnce = true;
      });
      socket.on('disconnect', () => setSocketConnected(false));
      socket.on('connect_error', () => setSocketConnected(false));
      socket.on('deviceUpdate', (payload) => {
        const rawDevice = extractEventRecord(payload, 'device');
        if (!matchesDevice(rawDevice, deviceCode, deviceIdRef.current)) return;
        setDevice((current) => normalizeDevice(rawDevice, deviceCode, current));
      });
      socket.on('jobUpdate', (payload) => {
        const rawJob = extractEventRecord(payload, 'job');
        if (!matchesJob(rawJob, deviceCode, deviceIdRef.current)) return;
        const job = normalizeJob(rawJob);
        if (!job) return;
        setDevice((current) => current ? applyJobUpdate(current, job, rawJob) : current);
        if (isCommand(job.command) && !ACTIVE_JOB_STATUSES.has(job.status)) {
          const succeeded = job.status === 'SUCCESS';
          actionLocksRef.current.delete(job.command);
          if (pendingJobsRef.current[job.command] === job.id) delete pendingJobsRef.current[job.command];
          setActions((current) => ({
            ...current,
            [job.command]: { phase: succeeded ? 'success' : 'error', message: succeeded ? 'Command completed' : job.errorMessage || `Job ${job.status}` },
          }));
        }
      });
    }).catch(() => setSocketConnected(false));

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [deviceCode, fetchDevice]);

  const jobInProgress = Boolean(device?.currentJob && ACTIVE_JOB_STATUSES.has(device.currentJob.status));
  const actionInProgress = Object.values(actions).some((state) => state?.phase === 'loading');
  const commandDisabled = !device || !['ONLINE', 'WARNING'].includes(device.status) || Boolean(activeCommand) || actionInProgress || jobInProgress;

  useEffect(() => {
    if (!device) return;
    const visibleJobs = [device.currentJob, device.lastJob].filter((job): job is JobView => Boolean(job));
    setActions((current) => {
      let next = current;
      for (const [commandName, state] of Object.entries(current)) {
        if (state?.phase !== 'loading' || !isCommand(commandName)) continue;
        const pendingJobId = pendingJobsRef.current[commandName];
        if (!pendingJobId) continue;
        const job = visibleJobs.find((candidate) => candidate.id === pendingJobId);
        if (!job || ACTIVE_JOB_STATUSES.has(job.status)) continue;
        const succeeded = job.status === 'SUCCESS';
        actionLocksRef.current.delete(commandName);
        delete pendingJobsRef.current[commandName];
        if (next === current) next = { ...current };
        next[commandName] = {
          phase: succeeded ? 'success' : 'error',
          message: succeeded ? 'Command completed' : job.errorMessage || `Job ${job.status}`,
        };
      }
      return next;
    });
  }, [device]);

  useEffect(() => {
    if (socketConnected) return;

    const pollMs = actionInProgress || jobInProgress ? ACTIVE_FALLBACK_POLL_MS : IDLE_FALLBACK_POLL_MS;
    let disposed = false;
    let timer: number | undefined;
    const poll = async () => {
      await fetchDevice(true);
      if (!disposed) timer = window.setTimeout(() => void poll(), pollMs);
    };

    timer = window.setTimeout(() => void poll(), pollMs);
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [actionInProgress, fetchDevice, jobInProgress, socketConnected]);

  const storagePercent = useMemo(() => {
    if (device?.storageUsed === null || device?.storageTotal === null || !device?.storageTotal) return null;
    return Math.min(100, Math.round((device.storageUsed / device.storageTotal) * 100));
  }, [device]);

  async function runCommand(command: Exclude<Command, 'PUSH_FILE'>) {
    if (commandDisabled || actionLocksRef.current.size > 0) return;
    actionLocksRef.current.add(command);
    const idempotencyKey = createIdempotencyKey(deviceCode, command);
    setActiveCommand(command);
    setActions((current) => ({ ...current, [command]: { phase: 'loading', message: 'Creating job…' } }));
    try {
      const response = await apiFetch(`/api/v1/devices/${encodeURIComponent(deviceCode)}/commands`, {
        method: 'POST',
        headers: { ...requestHeaders(true), 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ command, parameters: {}, idempotencyKey }),
      });
      const payload = await readPayload(response);
      const rawJob = extractEventRecord(payload, 'job');
      const job = normalizeJob(rawJob);
      if (!job) {
        const record = asRecord(payload);
        const msg = typeof record?.message === 'string' ? record.message : `ไม่สามารถสร้างงานคำสั่ง ${command} ได้`;
        throw new Error(msg);
      }
      pendingJobsRef.current[command] = job.id;
      setDevice((current) => current ? applyJobUpdate(current, job, rawJob) : current);
      const terminal = !ACTIVE_JOB_STATUSES.has(job.status);
      const succeeded = job.status === 'SUCCESS';
      const duplicate = asRecord(payload)?.duplicate === true;
      if (terminal) {
        actionLocksRef.current.delete(command);
        delete pendingJobsRef.current[command];
      }
      setActions((current) => ({
        ...current,
        [command]: terminal
          ? { phase: succeeded ? 'success' : 'error', message: succeeded ? 'Command completed' : job.errorMessage || `Job ${job.status}` }
          : { phase: 'loading', message: duplicate ? `Existing job ${job.id} is already active` : `Job ${job.id} queued` },
      }));
      await fetchDevice(true);
    } catch (error) {
      actionLocksRef.current.delete(command);
      delete pendingJobsRef.current[command];
      setActions((current) => ({ ...current, [command]: { phase: 'error', message: errorMessage(error, 'Unable to create command') } }));
    } finally {
      setActiveCommand(null);
    }
  }

  function chooseFile() {
    if (!commandDisabled && actionLocksRef.current.size === 0) fileInputRef.current?.click();
  }

  async function pushFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || commandDisabled || actionLocksRef.current.size > 0) return;

    const command: Command = 'PUSH_FILE';
    if (file.size === 0) {
      setActions((current) => ({ ...current, [command]: { phase: 'error', message: 'ไฟล์ว่าง ไม่สามารถส่งเข้าโทรศัพท์ได้' } }));
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      setActions((current) => ({ ...current, [command]: { phase: 'error', message: 'ไฟล์มีขนาดเกิน 500 MB' } }));
      return;
    }
    const safeFilename = deviceSafeFilename(file.name);
    const uploadFile = safeFilename === file.name
      ? file
      : new File([file], safeFilename, { type: file.type, lastModified: file.lastModified });
    const idempotencyKey = createIdempotencyKey(deviceCode, command, `${safeFilename}:${file.size}:${file.lastModified}`);
    const form = new FormData();
    form.append('command', command);
    form.append('parameters', JSON.stringify({ destination: '/sdcard/Download/FarmPhone/' }));
    form.append('idempotencyKey', idempotencyKey);
    form.append('file', uploadFile);
    actionLocksRef.current.add(command);
    setActiveCommand(command);
    setActions((current) => ({ ...current, [command]: { phase: 'loading', message: safeFilename === file.name ? `ตรวจไฟล์แล้ว กำลังส่ง ${file.name}…` : `เปลี่ยนชื่อเป็น ${safeFilename} แล้วกำลังส่ง…` } }));
    try {
      const response = await apiFetch(`/api/v1/devices/${encodeURIComponent(deviceCode)}/commands`, {
        method: 'POST',
        headers: { ...requestHeaders(), 'Idempotency-Key': idempotencyKey },
        body: form,
      }, UPLOAD_TIMEOUT_MS);
      const payload = await readPayload(response);
      const rawJob = extractEventRecord(payload, 'job');
      const job = normalizeJob(rawJob);
      if (!job) throw new Error('Backend response did not include a Job ID');
      pendingJobsRef.current[command] = job.id;
      setDevice((current) => current ? applyJobUpdate(current, job, rawJob) : current);
      const terminal = !ACTIVE_JOB_STATUSES.has(job.status);
      const succeeded = job.status === 'SUCCESS';
      const duplicate = asRecord(payload)?.duplicate === true;
      if (terminal) {
        actionLocksRef.current.delete(command);
        delete pendingJobsRef.current[command];
      }
      setActions((current) => ({
        ...current,
        [command]: terminal
          ? { phase: succeeded ? 'success' : 'error', message: succeeded ? 'File verified on device' : job.errorMessage || `Job ${job.status}` }
          : { phase: 'loading', message: duplicate ? `Existing job ${job.id} is already active` : `Job ${job.id} queued` },
      }));
      await fetchDevice(true);
    } catch (error) {
      actionLocksRef.current.delete(command);
      delete pendingJobsRef.current[command];
      setActions((current) => ({ ...current, [command]: { phase: 'error', message: errorMessage(error, 'Unable to push file') } }));
    } finally {
      setActiveCommand(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-cyber-blue" /></div>;
  }

  if (!device) {
    return (
      <div className="card mx-auto max-w-2xl border-error-red bg-error-red/10 py-12 text-center">
        <XCircle className="mx-auto h-10 w-10 text-error-red" />
        <h1 className="mt-4 font-mono text-lg font-bold text-white">Unable to load {deviceCode}</h1>
        <p className="mt-2 break-words text-sm text-error-red">{loadError}</p>
        <div className="mt-5 flex justify-center gap-3">
          <button className="btn-outline" onClick={() => router.push('/devices')}><ArrowLeft className="mr-2 inline h-4 w-4" />Devices</button>
          <button className="btn-primary" onClick={() => void fetchDevice()}><RefreshCw className="mr-2 inline h-4 w-4" />Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <header className="flex flex-col gap-4 rounded-lg border border-pixel-border bg-navy-800 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button className="btn-outline shrink-0 p-2" onClick={() => router.push('/devices')} aria-label="Back to devices"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Smartphone className="h-6 w-6 text-cyber-blue" />
              <h1 className="break-all font-mono text-xl font-bold text-white sm:text-2xl">{device.code}</h1>
              <StatusBadge status={device.status} />
            </div>
            <p className="mt-1 break-all font-mono text-xs text-gray-400">{device.serialNumber || 'Serial number unavailable'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge badge-online flex items-center gap-1">
            <Flame className="h-3.5 w-3.5 text-warning-orange" />
            Firebase Sync
          </span>
          <button className="btn-outline flex items-center gap-2 text-sm" onClick={() => void fetchDevice(true)} disabled={refreshing}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
      </header>

      {loadError && <div className="card border-warning-orange bg-warning-orange/10 text-sm text-warning-orange"><AlertTriangle className="mr-2 inline h-4 w-4" />{loadError}</div>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Manufacturer / Model" value={[device.manufacturer, device.model].filter(Boolean).join(' ') || 'Unavailable'} icon={<Smartphone className="h-4 w-4" />} />
        <InfoCard label="Android Version" value={device.androidVersion || 'Unavailable'} icon={<Activity className="h-4 w-4" />} />
        <InfoCard label="ADB Status" value={device.adbStatus || 'UNKNOWN'} icon={<Terminal className="h-4 w-4" />} />
        <InfoCard label="Last Heartbeat" value={formatDate(device.lastHeartbeatAt)} icon={<Clock3 className="h-4 w-4" />} />
        <InfoCard label="Battery" value={device.batteryLevel === null ? 'Unavailable' : `${device.batteryLevel}%`} icon={<Battery className="h-4 w-4" />} />
        <InfoCard label="Storage Used" value={formatStorage(device.storageUsed)} icon={<HardDrive className="h-4 w-4" />} />
        <InfoCard label="Storage Total" value={formatStorage(device.storageTotal)} icon={<HardDrive className="h-4 w-4" />} />
        <InfoCard label="Storage Usage" value={storagePercent === null ? 'Unavailable' : `${storagePercent}%`} icon={<HardDrive className="h-4 w-4" />} />
      </section>

      {/* Interactive Live Screen Mirror */}
      <ScreenMirror deviceCode={device.code} deviceStatus={device.status} />

      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-header mb-0">Device Commands</h2>
          {jobInProgress && <span className="badge badge-warning">Job in progress — commands disabled</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {COMMANDS.map((item) => (
            <CommandButton key={item.command} {...item} state={actions[item.command]} disabled={commandDisabled} busy={activeCommand === item.command || actions[item.command]?.phase === 'loading'} onClick={() => void runCommand(item.command)} />
          ))}
          <CommandButton command="PUSH_FILE" label="Push File" icon={<FileUp className="h-4 w-4" />} state={actions.PUSH_FILE} disabled={commandDisabled} busy={activeCommand === 'PUSH_FILE' || actions.PUSH_FILE?.phase === 'loading'} onClick={chooseFile} />
          <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => void pushFile(event)} />
        </div>
        {Object.entries(actions).some(([, state]) => state?.message) && (
          <div className="mt-4 grid gap-2 border-t border-pixel-border pt-4 md:grid-cols-2">
            {Object.entries(actions).map(([command, state]) => state?.message ? <ActionMessage key={command} command={command} state={state} /> : null)}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <JobCard title="Current Job" job={device.currentJob} empty="No active job" />
        <JobCard title="Last Job" job={device.lastJob} empty="No completed job recorded" />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="card xl:col-span-2">
          <h2 className="card-header">Latest Screenshot</h2>
          {device.latestScreenshot ? (
            <div className="space-y-3">
              <a href={resolveUrl(device.latestScreenshot.url)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded border border-pixel-border bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveUrl(device.latestScreenshot.url)} alt={`Latest screenshot from ${device.code}`} className="max-h-[520px] w-full object-contain" />
              </a>
              <div className="flex flex-wrap justify-between gap-2 font-mono text-xs text-gray-500">
                <span>Job: {device.latestScreenshot.jobId || 'Unavailable'}</span>
                <span>{formatDate(device.latestScreenshot.createdAt)}</span>
              </div>
            </div>
          ) : (
            <EmptyState icon={<ImageIcon className="h-8 w-8" />} message="No screenshot evidence recorded" />
          )}
        </div>

        <div className="card min-w-0 xl:col-span-3">
          <h2 className="card-header">Recent Logs</h2>
          {device.recentLogs.length ? (
            <div className="max-h-[520px] space-y-2 overflow-y-auto">
              {device.recentLogs.map((log) => (
                <article key={log.id} className="rounded border border-pixel-border bg-navy-700 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={`badge ${log.level === 'ERROR' ? 'badge-error' : log.level === 'WARNING' || log.level === 'WARN' ? 'badge-warning' : 'badge-info'}`}>{log.level}</span>
                    <time className="font-mono text-xs text-gray-500">{formatDate(log.timestamp)}</time>
                  </div>
                  <p className="mt-2 break-words font-mono text-sm text-gray-200">{log.message}</p>
                  {log.adbOutput && <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 text-xs text-gray-400">{log.adbOutput}</pre>}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Terminal className="h-8 w-8" />} message="No device logs recorded" />
          )}
        </div>
      </section>
    </div>
  );
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
    throw new Error(Array.isArray(message) ? message.join(', ') : typeof message === 'string' ? message : `Request failed (${response.status})`);
  }
  return record && Object.prototype.hasOwnProperty.call(record, 'data') ? record.data : body;
}

function normalizeDevice(raw: unknown, fallbackCode: string, previous?: DeviceView | null): DeviceView {
  const record = asRecord(raw) || {};
  const metadata = asRecord(record.metadata) || {};
  const heartbeat = asRecord(record.latestHeartbeat) || asRecord(record.heartbeat) || toRecords(record.heartbeats)[0] || {};
  const hasJobsSnapshot = record.jobs !== undefined;
  const jobs = toRecords(record.jobs).map(normalizeJob).filter((job): job is JobView => Boolean(job));
  const currentJob = normalizeJob(record.currentJob)
    || jobs.find((job) => ACTIVE_JOB_STATUSES.has(job.status))
    || (hasJobsSnapshot ? null : previous?.currentJob)
    || null;
  const lastJob = normalizeJob(record.lastJob)
    || jobs.find((job) => !ACTIVE_JOB_STATUSES.has(job.status))
    || (hasJobsSnapshot ? null : previous?.lastJob)
    || null;
  const logsSource = record.recentLogs ?? record.jobLogs ?? record.logs;
  const recentLogs = logsSource === undefined ? previous?.recentLogs || [] : toRecords(logsSource).map(normalizeLog);
  const screenshotFromHistory = jobs.map(screenshotFromJob).find(Boolean);
  const screenshot = normalizeScreenshot(record.latestScreenshot ?? record.screenshot ?? record.evidence)
    || screenshotFromJob(currentJob)
    || screenshotFromJob(lastJob)
    || screenshotFromHistory
    || previous?.latestScreenshot
    || null;
  const adbStatus = upper(firstString(record.adbStatus, heartbeat.adbStatus, metadata.adbStatus, record.state), 'UNKNOWN');
  const status = upper(firstString(record.status, heartbeat.status, adbStatus), 'UNKNOWN');

  return {
    id: firstString(record.id, previous?.id, fallbackCode) || fallbackCode,
    code: firstString(record.code, record.deviceCode, previous?.code, fallbackCode) || fallbackCode,
    serialNumber: nullableString(record.serialNumber, record.serial, heartbeat.serialNumber, metadata.serialNumber, metadata.serial, previous?.serialNumber),
    manufacturer: nullableString(record.manufacturer, heartbeat.manufacturer, metadata.manufacturer, previous?.manufacturer),
    model: nullableString(record.model, heartbeat.model, metadata.model, previous?.model),
    androidVersion: nullableString(record.androidVersion, record.osVersion, heartbeat.androidVersion, metadata.androidVersion, previous?.androidVersion),
    adbStatus,
    status,
    batteryLevel: nullableNumber(record.batteryLevel, record.battery, heartbeat.batteryLevel, metadata.batteryLevel, previous?.batteryLevel),
    storageUsed: nullableNumber(record.storageUsed, heartbeat.storageUsed, metadata.storageUsed, previous?.storageUsed),
    storageTotal: nullableNumber(record.storageTotal, record.storage, heartbeat.storageTotal, metadata.storageTotal, previous?.storageTotal),
    lastHeartbeatAt: nullableString(record.lastHeartbeatAt, heartbeat.timestamp, previous?.lastHeartbeatAt),
    currentJob,
    lastJob,
    latestScreenshot: screenshot,
    recentLogs,
  };
}

function normalizeJob(raw: unknown): JobView | null {
  const record = asRecord(raw);
  if (!record) return null;
  const metadata = asRecord(record.metadata) || {};
  const parameters = asRecord(record.parameters) || {};
  const result = record.result ?? metadata.result ?? metadata.verification ?? null;
  const id = firstString(record.id, record.jobId);
  if (!id) return null;
  return {
    id,
    command: upper(firstString(record.command, parameters.command, metadata.command, record.type, metadata.name), 'UNKNOWN'),
    status: upper(firstString(record.status), 'UNKNOWN'),
    attempts: nullableNumber(record.attempts, record.attemptNumber, record.retryCount),
    maxAttempts: nullableNumber(record.maxAttempts, record.maxRetries),
    startedAt: nullableString(record.startedAt),
    completedAt: nullableString(record.completedAt, record.finishedAt),
    errorCode: nullableString(record.errorCode),
    errorMessage: nullableString(record.errorMessage, record.error),
    result,
    createdAt: nullableString(record.createdAt),
  };
}

function normalizeLog(record: JsonRecord, index: number): LogView {
  const metadata = asRecord(record.metadata) || {};
  return {
    id: firstString(record.id, `${firstString(record.createdAt, record.timestamp, index)}-${index}`) || String(index),
    level: upper(firstString(record.level, record.severity), 'INFO'),
    message: firstString(record.message, record.event, record.action, record.errorMessage) || 'Log entry',
    timestamp: nullableString(record.timestamp, record.createdAt, record.updatedAt),
    adbOutput: nullableString(record.adbOutput, metadata.adbOutput, metadata.stdout, metadata.stderr),
  };
}

function normalizeScreenshot(raw: unknown): ScreenshotView | null {
  const list = Array.isArray(raw) ? raw : [raw];
  for (const item of list) {
    if (typeof item === 'string' && item) return { url: item, createdAt: null, jobId: null };
    const record = asRecord(item);
    if (!record) continue;
    const url = firstString(record.url, record.screenshotUrl, record.previewUrl, record.fileUrl);
    if (url) return { url, createdAt: nullableString(record.createdAt, record.capturedAt, record.timestamp), jobId: nullableString(record.jobId) };
  }
  return null;
}

function screenshotFromJob(job: JobView | null) {
  const result = asRecord(job?.result);
  const metadata = asRecord(result?.metadata);
  const screenshot = normalizeScreenshot(result?.latestScreenshot ?? result?.screenshot ?? result?.screenshotUrl ?? result?.evidence ?? metadata?.evidence);
  return screenshot && job ? {
    ...screenshot,
    createdAt: screenshot.createdAt || job.completedAt || job.createdAt,
    jobId: screenshot.jobId || job.id,
  } : null;
}

function applyJobUpdate(device: DeviceView, job: JobView, rawJob: JsonRecord): DeviceView {
  const active = ACTIVE_JOB_STATUSES.has(job.status);
  const log = normalizeLog({
    id: `${job.id}-${job.status}-${job.completedAt || job.startedAt || job.createdAt || ''}`,
    level: job.status === 'FAILED' ? 'ERROR' : 'INFO',
    message: job.errorMessage || `${job.command} ${job.status}`,
    timestamp: job.completedAt || job.startedAt || job.createdAt,
    adbOutput: rawJob.adbOutput,
  }, 0);
  return {
    ...device,
    currentJob: active ? job : device.currentJob?.id === job.id ? null : device.currentJob,
    lastJob: active ? device.lastJob : job,
    latestScreenshot: normalizeScreenshot(rawJob.latestScreenshot ?? rawJob.screenshot ?? rawJob.screenshotUrl ?? rawJob.evidence) || screenshotFromJob(job) || device.latestScreenshot,
    recentLogs: [log, ...device.recentLogs.filter((entry) => entry.id !== log.id)].slice(0, 50),
  };
}

function extractEventRecord(payload: unknown, preferredKey: string): JsonRecord {
  const outer = asRecord(payload) || {};
  const data = asRecord(outer.data);
  return asRecord(outer[preferredKey]) || asRecord(data?.[preferredKey]) || data || outer;
}

function matchesDevice(record: JsonRecord, code: string, id?: string) {
  const identifiers = [record.id, record.code, record.deviceCode, record.deviceId].filter((value): value is string => typeof value === 'string');
  return identifiers.includes(code) || Boolean(id && identifiers.includes(id));
}

function matchesJob(record: JsonRecord, code: string, id?: string) {
  const device = asRecord(record.device);
  const identifiers = [record.deviceId, record.deviceCode, device?.id, device?.code].filter((value): value is string => typeof value === 'string');
  return identifiers.includes(code) || Boolean(id && identifiers.includes(id));
}

function CommandButton({ label, icon, state, busy, disabled, danger, onClick }: {
  command: Command;
  label: string;
  icon: ReactNode;
  state?: ActionState;
  busy: boolean;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  const successful = state?.phase === 'success';
  const failed = state?.phase === 'error';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded border px-3 py-3 font-mono text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${failed ? 'border-error-red bg-error-red/10 text-error-red' : successful ? 'border-status-green bg-status-green/10 text-status-green' : danger ? 'border-error-red/70 text-error-red hover:bg-error-red/10' : 'border-pixel-border text-gray-200 hover:border-cyber-blue hover:text-cyber-blue'}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : failed ? <XCircle className="h-4 w-4" /> : successful ? <CheckCircle2 className="h-4 w-4" /> : icon}
      <span>{label}</span>
    </button>
  );
}

function ActionMessage({ command, state }: { command: string; state: ActionState }) {
  return (
    <div className={`flex items-start gap-2 rounded border p-2 font-mono text-xs ${state.phase === 'error' ? 'border-error-red/50 text-error-red' : state.phase === 'success' ? 'border-status-green/50 text-status-green' : 'border-cyber-blue/50 text-cyber-blue'}`}>
      {state.phase === 'loading' ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" /> : state.phase === 'error' ? <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span className="break-words"><strong>{command}:</strong> {state.message}</span>
    </div>
  );
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return <div className="card min-w-0"><div className="flex items-center gap-2 font-mono text-xs text-gray-500">{icon}{label}</div><p className="mt-2 break-words font-mono text-sm font-bold text-white">{value}</p></div>;
}

function JobCard({ title, job, empty }: { title: string; job: JobView | null; empty: string }) {
  return (
    <div className="card min-w-0">
      <h2 className="card-header">{title}</h2>
      {!job ? <EmptyState icon={<Activity className="h-8 w-8" />} message={empty} /> : (
        <div className="space-y-3 font-mono text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="break-all font-bold text-white">{job.command}</p><p className="mt-1 break-all text-xs text-gray-500">{job.id}</p></div><StatusBadge status={job.status} /></div>
          <dl className="grid grid-cols-2 gap-3 border-t border-pixel-border pt-3 text-xs">
            <JobField label="Attempts" value={job.attempts === null ? 'Unavailable' : `${job.attempts}${job.maxAttempts === null ? '' : ` / ${job.maxAttempts}`}`} />
            <JobField label="Created" value={formatDate(job.createdAt)} />
            <JobField label="Started" value={formatDate(job.startedAt)} />
            <JobField label="Completed" value={formatDate(job.completedAt)} />
            <JobField label="Error Code" value={job.errorCode || '—'} />
            <JobField label="Error Message" value={job.errorMessage || '—'} />
          </dl>
          {job.result !== null && job.result !== undefined && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-black/40 p-3 text-xs text-gray-400">{formatResult(job.result)}</pre>}
        </div>
      )}
    </div>
  );
}

function JobField({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-gray-500">{label}</dt><dd className="mt-1 break-words text-gray-200">{value}</dd></div>;
}

function EmptyState({ icon, message }: { icon: ReactNode; message: string }) {
  return <div className="flex min-h-32 flex-col items-center justify-center gap-3 text-center font-mono text-sm text-gray-500">{icon}<p>{message}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = upper(status, 'UNKNOWN');
  const className = ['ONLINE', 'SUCCESS', 'PASS'].includes(normalized) ? 'badge-online'
    : ['BUSY', 'RUNNING', 'VERIFYING', 'ASSIGNED'].includes(normalized) ? 'badge-info'
      : ['WARNING', 'QUEUED', 'CREATED', 'CONNECTING'].includes(normalized) ? 'badge-warning'
        : ['ERROR', 'FAILED', 'FAIL', 'UNAUTHORIZED'].includes(normalized) ? 'badge-error'
          : 'badge-offline';
  return <span className={`badge ${className}`}>{normalized}</span>;
}

function createIdempotencyKey(deviceCode: string, command: Command, suffix = '') {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${deviceCode}:${command}:${suffix ? `${suffix}:` : ''}${random}`;
}

function deviceSafeFilename(filename: string) {
  const normalized = filename
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/_+\./g, '.')
    .replace(/^\.+/, '')
    .slice(0, 180);
  return normalized || `upload-${Date.now()}.bin`;
}

function isCommand(value: string): value is Command {
  return ['HEALTH_CHECK', 'SCREENSHOT', 'OPEN_APP', 'STOP_APP', 'RESTART_APP', 'PUSH_FILE', 'REBOOT_DEVICE'].includes(value);
}

function resolveUrl(url: string) {
  try { return new URL(url, apiUrl).toString(); } catch { return url; }
}

function formatDate(value: string | null) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatStorage(value: number | null) {
  if (value === null) return 'Unavailable';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${value.toLocaleString()} bytes`;
}

function formatResult(value: unknown) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function toRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is JsonRecord => Boolean(item)) : [];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const secs = (value as { _seconds?: number; seconds?: number })._seconds ?? (value as { _seconds?: number; seconds?: number }).seconds;
      if (typeof secs === 'number') return new Date(secs * 1000).toISOString();
    }
  }
  return '';
}

function nullableString(...values: unknown[]) {
  return firstString(...values) || null;
}

function nullableNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function upper(value: string, fallback: string) {
  return (value || fallback).toUpperCase();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
