'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Battery,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Flame,
  HardDrive,
  Loader2,
  RefreshCw,
  Smartphone,
  Terminal,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { apiFetch, apiUrl } from '@/lib/api-client';

type JsonRecord = Record<string, unknown>;

type JobLog = {
  id: string;
  level: string;
  message: string;
  createdAt: string | null;
};

type Job = {
  id: string;
  command: string;
  status: string;
  attempts: number | null;
  maxAttempts: number | null;
  errorMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  logs: JobLog[];
};

type Device = {
  id: string;
  code: string;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  androidVersion: string | null;
  status: string;
  adbStatus: string;
  batteryLevel: number | null;
  storageUsed: number | null;
  storageTotal: number | null;
  lastHeartbeatAt: string | null;
  currentJobId: string | null;
  jobs: Job[];
  logs: JobLog[];
};

type Agent = {
  id: string;
  code: string;
  status: string;
  currentTaskId: string | null;
  lastActivityAt: string | null;
};

const DEVICE_CODE = 'PHONE-001';
const MVP_AGENT_ROLES = ['MANAGER', 'DEVICE', 'QA', 'LOG'] as const;
const ACTIVE_JOB_STATUSES = new Set(['CREATED', 'QUEUED', 'ASSIGNED', 'RUNNING', 'VERIFYING']);
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || apiUrl;

export default function DashboardPage() {
  const [device, setDevice] = useState<Device | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const [jobsError, setJobsError] = useState('');
  const [agentsError, setAgentsError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const deviceIdRef = useRef<string>();

  const requestHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const loadDashboard = useCallback(async (background = false) => {
    background ? setRefreshing(true) : setLoading(true);
    setDeviceError('');
    setJobsError('');
    setAgentsError('');

    const headers = requestHeaders();
    let loadedDevice: Device | null = null;

    try {
      const response = await apiFetch(`/api/v1/devices/${DEVICE_CODE}`, { cache: 'no-store', headers });
      const payload = await readPayload(response);
      loadedDevice = normalizeDevice(payload);
      setDevice(loadedDevice);
      setJobs(loadedDevice.jobs);
    } catch (error) {
      setDevice(null);
      setJobs([]);
      setDeviceError(errorMessage(error, `Unable to load ${DEVICE_CODE}`));
    }

    const agentsPromise = apiFetch('/api/v1/agents', { cache: 'no-store', headers })
      .then(readPayload)
      .then((payload) => setAgents(toRecords(payload).map(normalizeAgent).filter(isMvpAgent)))
      .catch((error) => {
        setAgents([]);
        setAgentsError(errorMessage(error, 'Unable to load AI agents'));
      });

    let jobsPromise: Promise<void> = Promise.resolve();
    if (loadedDevice?.id) {
      jobsPromise = apiFetch(`/api/v1/jobs?deviceId=${encodeURIComponent(loadedDevice.id)}`, { cache: 'no-store', headers })
        .then(readPayload)
        .then((payload) => setJobs(toRecords(payload).map(normalizeJob).filter((job): job is Job => Boolean(job))))
        .catch((error) => {
          setJobsError(errorMessage(error, 'Job endpoint unavailable; showing jobs included with the device record'));
        });
    }

    await Promise.all([agentsPromise, jobsPromise]);
    setLoading(false);
    setRefreshing(false);
  }, [requestHeaders]);

  useEffect(() => {
    void loadDashboard().catch((error) => {
      setDeviceError(errorMessage(error, `Unable to load ${DEVICE_CODE}`));
      setLoading(false);
      setRefreshing(false);
    });
  }, [loadDashboard]);

  useEffect(() => {
    deviceIdRef.current = device?.id;
  }, [device?.id]);

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
        const record = extractEventRecord(payload, 'device');
        if (!matchesDevice(record, deviceIdRef.current)) return;
        setDevice((current) => normalizeDevice(record, current));
        setDeviceError('');
      });
      socket.on('jobUpdate', (payload) => {
        const record = extractEventRecord(payload, 'job');
        if (!matchesJob(record, deviceIdRef.current)) return;
        const job = normalizeJob(record);
        if (!job) return;
        setJobs((current) => upsertJob(current, job));
      });
      socket.on('agentState', (payload) => {
        const agent = normalizeAgent(extractEventRecord(payload, 'agent'));
        if (!isMvpAgent(agent)) return;
        setAgents((current) => upsertAgent(current, agent));
        setAgentsError('');
      });
    }).catch(() => setSocketConnected(false));

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, []);

  const currentJob = useMemo(
    () => jobs.find((job) => job.id === device?.currentJobId) || jobs.find((job) => ACTIVE_JOB_STATUSES.has(job.status)) || null,
    [device?.currentJobId, jobs],
  );
  const lastJob = useMemo(() => jobs.find((job) => !ACTIVE_JOB_STATUSES.has(job.status)) || null, [jobs]);
  const recentLogs = useMemo(() => {
    const combined = [...(device?.logs || []), ...jobs.flatMap((job) => job.logs)];
    return uniqueById(combined).sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt)).slice(0, 12);
  }, [device?.logs, jobs]);
  const heartbeat = heartbeatState(device?.lastHeartbeatAt || null);
  const storagePercent = storageUsage(device?.storageUsed, device?.storageTotal);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-white">
              <span className="text-cyber-blue">&gt;</span> SINGLE DEVICE MVP
            </h1>
            <span className="badge badge-info">PHASE 1</span>
          </div>
          <p className="mt-1 font-mono text-sm text-gray-400">Live control and observability for {DEVICE_CODE}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionBadge connected={socketConnected} />
          <button type="button" className="btn-outline flex items-center gap-2 text-sm" onClick={() => void loadDashboard(true).catch((error) => setDeviceError(errorMessage(error, `Unable to load ${DEVICE_CODE}`)))} disabled={loading || refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link href={`/devices/${DEVICE_CODE}`} className="btn-primary flex items-center gap-2 text-sm">
            Open Device Control <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="card flex min-h-56 items-center justify-center gap-3 font-mono text-sm text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin text-cyber-blue" /> Loading live system data...
        </div>
      ) : (
        <>
          {deviceError && <ErrorPanel title={`${DEVICE_CODE} unavailable`} message={deviceError} />}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Device Status"
              value={device?.status || 'UNAVAILABLE'}
              detail={device ? `ADB: ${device.adbStatus}` : 'No device data received'}
              icon={<Smartphone className="h-5 w-5" />}
              status={device?.status}
            />
            <MetricCard
              label="Heartbeat"
              value={heartbeat.label}
              detail={device?.lastHeartbeatAt ? formatDate(device.lastHeartbeatAt) : 'No heartbeat recorded'}
              icon={<Activity className="h-5 w-5" />}
              status={heartbeat.status}
            />
            <MetricCard
              label="Jobs"
              value={device ? String(jobs.length) : 'UNAVAILABLE'}
              detail={currentJob ? `${currentJob.command}: ${currentJob.status}` : jobs.length ? 'No active job' : 'No jobs recorded'}
              icon={<Terminal className="h-5 w-5" />}
              status={currentJob?.status}
            />
            <MetricCard
              label="MVP Agents"
              value={agentsError ? 'UNAVAILABLE' : `${agents.length}/${MVP_AGENT_ROLES.length}`}
              detail={agentsError || `${agents.filter((agent) => agent.status === 'WORKING').length} working`}
              icon={<Bot className="h-5 w-5" />}
            />
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="card min-w-0 xl:col-span-3">
              <div className="card-header flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> {DEVICE_CODE}</span>
                {device && <StatusBadge status={device.status} />}
              </div>
              {!device ? (
                <EmptyState message="Device details are unavailable from the backend." />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DataField label="Serial Number" value={device.serialNumber} />
                  <DataField label="Manufacturer" value={device.manufacturer} />
                  <DataField label="Model" value={device.model} />
                  <DataField label="Android Version" value={device.androidVersion} />
                  <DataField label="Battery" value={device.batteryLevel === null ? null : `${device.batteryLevel}%`} icon={<Battery className="h-4 w-4" />} />
                  <DataField
                    label="Storage"
                    value={device.storageUsed === null || device.storageTotal === null ? null : `${formatBytes(device.storageUsed)} / ${formatBytes(device.storageTotal)}${storagePercent === null ? '' : ` (${storagePercent}%)`}`}
                    icon={<HardDrive className="h-4 w-4" />}
                  />
                  <DataField label="ADB Status" value={device.adbStatus} />
                  <DataField label="Last Heartbeat" value={device.lastHeartbeatAt ? formatDate(device.lastHeartbeatAt) : null} icon={<Clock3 className="h-4 w-4" />} />
                </div>
              )}
            </div>

            <div className="card min-w-0 xl:col-span-2">
              <div className="card-header flex items-center gap-2"><Bot className="h-4 w-4" /> AI Office MVP</div>
              {agentsError && <p className="mb-3 rounded border border-error-red/50 bg-error-red/10 p-3 font-mono text-xs text-error-red">{agentsError}</p>}
              <div className="space-y-2">
                {MVP_AGENT_ROLES.map((role) => {
                  const agent = agents.find((item) => agentRole(item.code) === role);
                  return (
                    <div key={role} className="flex min-w-0 items-center justify-between gap-3 rounded border border-pixel-border bg-navy-700/60 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm text-gray-200">16bit.{role}</p>
                        <p className="mt-1 truncate font-mono text-xs text-gray-500">
                          {agent?.currentTaskId ? `Task: ${agent.currentTaskId}` : agent ? `Last activity: ${formatDate(agent.lastActivityAt)}` : 'Not registered'}
                        </p>
                      </div>
                      <StatusBadge status={agent?.status || 'UNAVAILABLE'} />
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="card min-w-0">
              <div className="card-header flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Activity className="h-4 w-4" /> Recent Jobs</span>
                {jobsError && <span className="text-right font-mono text-[10px] text-warning-orange">Job API unavailable</span>}
              </div>
              {jobs.length ? (
                <div className="space-y-2">
                  {jobs.slice(0, 8).map((job) => (
                    <article key={job.id} className="rounded border border-pixel-border bg-navy-700/60 p-3">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm font-bold text-white">{job.command}</p>
                          <p className="mt-1 truncate font-mono text-xs text-gray-500">{job.id}</p>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-xs text-gray-500">
                        <span>Attempts: {job.attempts === null ? 'Unavailable' : `${job.attempts}${job.maxAttempts === null ? '' : `/${job.maxAttempts}`}`}</span>
                        <time>{formatDate(job.updatedAt || job.createdAt)}</time>
                      </div>
                      {job.errorMessage && <p className="mt-2 break-words font-mono text-xs text-error-red">{job.errorMessage}</p>}
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState message={device ? 'No jobs have been recorded for PHONE-001.' : 'Job data is unavailable until PHONE-001 can be loaded.'} />
              )}
            </div>

            <div className="card min-w-0">
              <div className="card-header flex items-center gap-2"><Terminal className="h-4 w-4" /> Recent Logs</div>
              {recentLogs.length ? (
                <div className="max-h-[520px] space-y-2 overflow-y-auto">
                  {recentLogs.map((log) => (
                    <article key={log.id} className="rounded border border-pixel-border bg-navy-700/60 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StatusBadge status={log.level} />
                        <time className="font-mono text-xs text-gray-500">{formatDate(log.createdAt)}</time>
                      </div>
                      <p className="mt-2 break-words font-mono text-sm text-gray-300">{log.message}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <EmptyState message={device ? 'No real device or job logs have been recorded.' : 'Logs are unavailable until PHONE-001 can be loaded.'} />
              )}
            </div>
          </section>

          <section className="card border-cyber-blue/30 bg-cyber-blue/5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-mono text-sm font-bold text-white">PHONE-001 COMMAND CENTER</h2>
                <p className="mt-1 font-mono text-xs text-gray-400">All ADB commands are created as backend jobs from the device control page.</p>
              </div>
              <Link href={`/devices/${DEVICE_CODE}`} className="btn-primary flex items-center justify-center gap-2 text-sm">
                Health Check, Screenshot and Commands <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </>
      )}
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

function normalizeDevice(raw: unknown, previous?: Device | null): Device {
  const record = asRecord(raw) || {};
  const heartbeat = firstRecord(record.heartbeats);
  const nestedJobs = record.jobs === undefined ? previous?.jobs || [] : toRecords(record.jobs).map(normalizeJob).filter((job): job is Job => Boolean(job));
  const nestedLogs = record.jobLogs === undefined ? previous?.logs || [] : toRecords(record.jobLogs).map(normalizeLog);
  return {
    id: firstString(record.id, previous?.id, DEVICE_CODE) || DEVICE_CODE,
    code: firstString(record.code, record.deviceCode, previous?.code, DEVICE_CODE) || DEVICE_CODE,
    serialNumber: nullableString(record.serialNumber, heartbeat?.serialNumber, previous?.serialNumber),
    manufacturer: nullableString(record.manufacturer, previous?.manufacturer),
    model: nullableString(record.model, heartbeat?.model, previous?.model),
    androidVersion: nullableString(record.androidVersion, record.osVersion, heartbeat?.androidVersion, previous?.androidVersion),
    status: upper(firstString(record.status, record.adbStatus, heartbeat?.status, previous?.status), 'UNKNOWN'),
    adbStatus: upper(firstString(record.adbStatus, heartbeat?.status, previous?.adbStatus), 'UNKNOWN'),
    batteryLevel: nullableNumber(record.batteryLevel, record.battery, heartbeat?.batteryLevel, previous?.batteryLevel),
    storageUsed: nullableNumber(record.storageUsed, heartbeat?.storageUsed, previous?.storageUsed),
    storageTotal: nullableNumber(record.storageTotal, heartbeat?.storageTotal, previous?.storageTotal),
    lastHeartbeatAt: nullableString(record.lastHeartbeatAt, heartbeat?.timestamp, previous?.lastHeartbeatAt),
    currentJobId: nullableString(record.currentJobId, heartbeat?.currentJobId, previous?.currentJobId),
    jobs: nestedJobs,
    logs: nestedLogs,
  };
}

function normalizeJob(raw: unknown): Job | null {
  const record = asRecord(raw);
  if (!record) return null;
  const metadata = asRecord(record.metadata);
  const parameters = asRecord(record.parameters);
  const id = firstString(record.id, record.jobId);
  if (!id) return null;
  return {
    id,
    command: upper(firstString(record.command, parameters?.command, metadata?.command, metadata?.name, record.type), 'UNKNOWN'),
    status: upper(firstString(record.status), 'UNKNOWN'),
    attempts: nullableNumber(record.attempts, record.attemptNumber, record.retryCount),
    maxAttempts: nullableNumber(record.maxAttempts, record.maxRetries),
    errorMessage: nullableString(record.errorMessage, record.error),
    createdAt: nullableString(record.createdAt),
    updatedAt: nullableString(record.updatedAt, record.completedAt, record.startedAt, record.createdAt),
    logs: toRecords(record.logs).map(normalizeLog),
  };
}

function normalizeLog(record: JsonRecord, index: number): JobLog {
  return {
    id: firstString(record.id, `${firstString(record.createdAt, record.timestamp, index)}-${index}`) || String(index),
    level: upper(firstString(record.level, record.severity), 'INFO'),
    message: firstString(record.message, record.event, record.action, record.errorMessage) || 'Log entry',
    createdAt: nullableString(record.createdAt, record.timestamp, record.updatedAt),
  };
}

function normalizeAgent(raw: unknown): Agent {
  const record = asRecord(raw) || {};
  const code = firstString(record.code, record.agentCode);
  return {
    id: firstString(record.id, code) || code,
    code,
    status: upper(firstString(record.status), 'UNKNOWN'),
    currentTaskId: nullableString(record.currentTaskId, record.currentTask, record.taskId),
    lastActivityAt: nullableString(record.lastActivityAt, record.updatedAt, record.timestamp),
  };
}

function extractEventRecord(payload: unknown, preferredKey: string): JsonRecord {
  const outer = asRecord(payload) || {};
  const data = asRecord(outer.data);
  return asRecord(outer[preferredKey]) || asRecord(data?.[preferredKey]) || data || outer;
}

function matchesDevice(record: JsonRecord, deviceId?: string) {
  const identifiers = [record.id, record.code, record.deviceCode, record.deviceId].filter((value): value is string => typeof value === 'string');
  return identifiers.length === 0 || identifiers.includes(DEVICE_CODE) || Boolean(deviceId && identifiers.includes(deviceId));
}

function matchesJob(record: JsonRecord, deviceId?: string) {
  const linkedDevice = asRecord(record.device);
  const identifiers = [record.deviceId, record.deviceCode, linkedDevice?.id, linkedDevice?.code].filter((value): value is string => typeof value === 'string');
  return identifiers.includes(DEVICE_CODE) || Boolean(deviceId && identifiers.includes(deviceId));
}

function isMvpAgent(agent: Agent) {
  return MVP_AGENT_ROLES.includes(agentRole(agent.code) as typeof MVP_AGENT_ROLES[number]);
}

function agentRole(code: string) {
  return code.toUpperCase().replace(/^16BIT\./, '');
}

function upsertJob(jobs: Job[], job: Job) {
  return [job, ...jobs.filter((item) => item.id !== job.id)]
    .sort((left, right) => timestamp(right.updatedAt || right.createdAt) - timestamp(left.updatedAt || left.createdAt));
}

function upsertAgent(agents: Agent[], agent: Agent) {
  return [agent, ...agents.filter((item) => item.id !== agent.id && item.code !== agent.code)];
}

function uniqueById(logs: JobLog[]) {
  return Array.from(new Map(logs.map((log) => [log.id, log])).values());
}

function heartbeatState(value: string | null) {
  if (!value) return { label: 'NO DATA', status: 'UNKNOWN' };
  const age = Date.now() - timestamp(value);
  if (!Number.isFinite(age) || age < 0) return { label: 'UNKNOWN', status: 'UNKNOWN' };
  if (age > 15_000) return { label: 'STALE', status: 'OFFLINE' };
  return { label: 'LIVE', status: 'ONLINE' };
}

function storageUsage(used?: number | null, total?: number | null) {
  if (used === null || used === undefined || total === null || total === undefined || total <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <span className="badge badge-online flex items-center gap-1.5">
      <Flame className="h-3.5 w-3.5 text-warning-orange" />
      Firebase Sync Live
    </span>
  );
}

function MetricCard({ label, value, detail, icon, status }: { label: string; value: string; detail: string; icon: React.ReactNode; status?: string }) {
  return (
    <div className="kpi-card min-w-0">
      <div className="flex items-center justify-between gap-3">
        <span className="kpi-label">{label}</span>
        <span className="text-cyber-blue">{icon}</span>
      </div>
      <span className="kpi-value mt-2 break-words text-2xl">{value}</span>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        {status && <StatusDot status={status} />}
        <span className="kpi-sub truncate">{detail}</span>
      </div>
    </div>
  );
}

function DataField({ label, value, icon }: { label: string; value: string | null; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded border border-pixel-border bg-navy-700/60 p-3">
      <div className="flex items-center gap-2 font-mono text-xs text-gray-500">{icon}{label}</div>
      <p className="mt-2 break-words font-mono text-sm text-gray-200">{value || 'Unavailable'}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-gray-600" />
      <p className="max-w-md font-mono text-sm text-gray-500">{message}</p>
    </div>
  );
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="card border-error-red/60 bg-error-red/10">
      <div className="flex items-start gap-3">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-error-red" />
        <div><p className="font-mono text-sm font-bold text-error-red">{title}</p><p className="mt-1 break-words font-mono text-xs text-gray-300">{message}</p></div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = upper(status, 'UNKNOWN');
  const className = ['ONLINE', 'SUCCESS', 'PASS', 'INFO'].includes(normalized) ? 'badge-online'
    : ['BUSY', 'RUNNING', 'VERIFYING', 'ASSIGNED', 'WORKING', 'THINKING'].includes(normalized) ? 'badge-info'
      : ['WARNING', 'WARN', 'QUEUED', 'CREATED', 'CONNECTING', 'WAITING'].includes(normalized) ? 'badge-warning'
        : ['ERROR', 'FAILED', 'FAIL', 'UNAUTHORIZED'].includes(normalized) ? 'badge-error'
          : 'badge-offline';
  return <span className={`badge shrink-0 ${className}`}>{normalized}</span>;
}

function StatusDot({ status }: { status: string }) {
  const normalized = upper(status, 'UNKNOWN');
  const className = ['ONLINE', 'SUCCESS', 'PASS'].includes(normalized) ? 'bg-status-green'
    : ['BUSY', 'RUNNING', 'VERIFYING', 'WORKING'].includes(normalized) ? 'bg-cyber-blue'
      : ['WARNING', 'QUEUED', 'CONNECTING', 'WAITING'].includes(normalized) ? 'bg-warning-orange'
        : 'bg-error-red';
  return <span className={`h-2 w-2 shrink-0 rounded-full ${className}`} />;
}

function formatDate(value: string | null) {
  if (!value) return 'Unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value.toLocaleString()} bytes`;
}

function timestamp(value: string | null | undefined) {
  if (!value) return 0;
  const result = new Date(value).getTime();
  return Number.isNaN(result) ? 0 : result;
}

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function toRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.map(asRecord).filter((item): item is JsonRecord => Boolean(item));
  const record = asRecord(value);
  if (!record) return [];
  for (const key of ['items', 'jobs', 'agents', 'results']) {
    if (Array.isArray(record[key])) return toRecords(record[key]);
  }
  return [];
}

function firstRecord(value: unknown) {
  return toRecords(value)[0] || null;
}

function firstString(...values: unknown[]) {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim();
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
