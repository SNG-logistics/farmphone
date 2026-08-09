'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Clock,
  FileVideo,
  Pause,
  Play,
  RefreshCw,
  StopCircle,
  Users,
} from 'lucide-react';

type CampaignDetail = {
  id: string;
  name: string;
  description: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  accountIds: string[];
  contentIds: string[];
  schedule: string | null;
  dailyLimit: number;
  totalJobs: number;
  successJobs: number;
  failedJobs: number;
  createdAt: string;
  updatedAt: string;
};

type JobHistory = {
  id: string;
  type: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  device: { id: string; deviceCode?: string; model?: string } | null;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const terminalJobStatuses = new Set(['SUCCESS', 'FAILED', 'CANCELLED']);

function authHeaders(json = false): HeadersInit {
  const headers: Record<string, string> = {};
  const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || `Request failed (${response.status})`);
  }
  return (payload?.data ?? payload) as T;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id);

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [jobs, setJobs] = useState<JobHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionBusy, setActionBusy] = useState('');

  const fetchCampaign = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [campaignResponse, jobsResponse] = await Promise.all([
        fetch(`${apiUrl}/api/v1/campaigns/${encodeURIComponent(id)}`, {
          headers: authHeaders(),
          cache: 'no-store',
        }),
        fetch(`${apiUrl}/api/v1/jobs?campaignId=${encodeURIComponent(id)}`, {
          headers: authHeaders(),
          cache: 'no-store',
        }),
      ]);
      const [campaignData, jobsData] = await Promise.all([
        readResponse<CampaignDetail>(campaignResponse),
        readResponse<JobHistory[]>(jobsResponse),
      ]);
      setCampaign(campaignData);
      setJobs(jobsData);
    } catch (requestError) {
      setCampaign(null);
      setJobs([]);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load campaign');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchCampaign();
  }, [fetchCampaign]);

  async function launchCampaign() {
    await runAction('launch', `${apiUrl}/api/v1/campaigns/${encodeURIComponent(id)}/launch`, 'POST');
  }

  async function changeStatus(status: 'PAUSED' | 'RUNNING' | 'CANCELLED') {
    await runAction(status, `${apiUrl}/api/v1/campaigns/${encodeURIComponent(id)}/status`, 'PATCH', { status });
  }

  async function runAction(action: string, url: string, method: 'POST' | 'PATCH', body?: object) {
    setActionBusy(action);
    setError('');
    setNotice('');
    try {
      const response = await fetch(url, {
        method,
        headers: authHeaders(Boolean(body)),
        body: body ? JSON.stringify(body) : undefined,
      });
      await readResponse<unknown>(response);
      setNotice(action === 'launch' ? 'Campaign launch request accepted.' : `Campaign status changed to ${action}.`);
      await fetchCampaign(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Campaign action failed');
    } finally {
      setActionBusy('');
    }
  }

  const progress = useMemo(() => {
    if (jobs.length === 0) return 0;
    const completed = jobs.filter((job) => terminalJobStatuses.has(job.status.toUpperCase())).length;
    return Math.round((completed / jobs.length) * 100);
  }, [jobs]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-cyber-blue" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="card border-error-red bg-error-red/10 py-12 text-center text-error-red">
        <p className="font-mono text-lg">{error || 'Campaign not found.'}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button className="btn-outline" onClick={() => router.push('/campaigns')}>
            <ArrowLeft className="mr-1 inline h-4 w-4" /> Back to Campaigns
          </button>
          <button className="btn-outline" onClick={() => void fetchCampaign()}>
            <RefreshCw className="mr-1 inline h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const normalizedStatus = campaign.status.toUpperCase();
  const canLaunch = normalizedStatus === 'DRAFT' || normalizedStatus === 'READY';
  const canPause = normalizedStatus === 'RUNNING';
  const canResume = normalizedStatus === 'PAUSED';
  const canCancel = !['COMPLETED', 'CANCELLED'].includes(normalizedStatus);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button className="btn-outline shrink-0 p-2" onClick={() => router.push('/campaigns')} title="Back to campaigns">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="break-words font-mono text-2xl font-bold text-white">{campaign.name}</h1>
            <p className="mt-1 break-words font-mono text-sm text-gray-400">{campaign.description || 'No description'}</p>
          </div>
        </div>
        <StatusBadge status={normalizedStatus} />
      </div>

      {error && <div className="card border-error-red bg-error-red/10 font-mono text-sm text-error-red">{error}</div>}
      {notice && <div className="card border-status-green bg-status-green/10 font-mono text-sm text-status-green">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Jobs" value={jobs.length} />
        <Metric label="Success" value={jobs.filter((job) => job.status.toUpperCase() === 'SUCCESS').length} tone="text-status-green" />
        <Metric label="Failed" value={jobs.filter((job) => job.status.toUpperCase() === 'FAILED').length} tone="text-error-red" />
        <Metric label="Progress" value={`${progress}%`} tone="text-cyber-blue" />
      </div>

      <div className="card">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h2 className="card-header mb-0">Execution Progress</h2>
          <span className="font-mono text-sm font-bold text-cyber-blue">{progress}%</span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded border border-pixel-border bg-navy-700">
          <div className="h-full bg-gradient-to-r from-cyber-blue to-status-green transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-xs text-gray-500">
          <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Start: {formatDate(campaign.startDate)}</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> End: {formatDate(campaign.endDate)}</span>
          <span>Schedule: {campaign.schedule || 'Not configured'}</span>
          <span>Daily limit: {campaign.dailyLimit || 'None'}</span>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="card-header mb-0">Actions</h2>
          <button className="btn-outline flex items-center gap-2 text-sm" onClick={() => void fetchCampaign(false)} disabled={Boolean(actionBusy)}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <ActionButton label="Launch" action="launch" busy={actionBusy} disabled={!canLaunch} onClick={() => void launchCampaign()} icon={<Play className="h-4 w-4" />} primary />
          <ActionButton label="Pause" action="PAUSED" busy={actionBusy} disabled={!canPause} onClick={() => void changeStatus('PAUSED')} icon={<Pause className="h-4 w-4" />} />
          <ActionButton label="Resume" action="RUNNING" busy={actionBusy} disabled={!canResume} onClick={() => void changeStatus('RUNNING')} icon={<Play className="h-4 w-4" />} />
          <ActionButton label="Cancel" action="CANCELLED" busy={actionBusy} disabled={!canCancel} onClick={() => void changeStatus('CANCELLED')} icon={<StopCircle className="h-4 w-4" />} danger />
        </div>
        {!canLaunch && normalizedStatus !== 'RUNNING' && normalizedStatus !== 'PAUSED' && (
          <p className="mt-3 font-mono text-xs text-gray-500">No additional action is available for status {normalizedStatus}.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <IdList title="Linked Account IDs" icon={<Users className="h-4 w-4" />} items={campaign.accountIds} empty="No accounts linked" />
        <IdList title="Linked Content IDs" icon={<FileVideo className="h-4 w-4" />} items={campaign.contentIds} empty="No content attached" />
      </div>

      <div className="card">
        <h2 className="card-header">Job Execution History</h2>
        {jobs.length === 0 ? (
          <p className="py-4 text-center font-mono text-sm text-gray-500">No backend jobs exist for this campaign.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left font-mono text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Job</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Device</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Finished</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-gray-800 transition-colors hover:bg-navy-700/50">
                    <td className="max-w-64 px-3 py-2">
                      <p className="truncate text-white">{jobName(job)}</p>
                      <p className="truncate text-xs text-gray-600">{job.id}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-400">{job.type}</td>
                    <td className="px-3 py-2 text-gray-400">{deviceName(job.device)}</td>
                    <td className="px-3 py-2"><JobStatusBadge status={job.status} /></td>
                    <td className="px-3 py-2 text-xs text-gray-400">{formatDateTime(job.startedAt || job.createdAt)}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{formatDateTime(job.completedAt)}</td>
                    <td className="max-w-64 px-3 py-2 text-xs text-error-red">
                      <span className="block truncate" title={job.errorMessage || undefined}>{job.errorCode || job.errorMessage || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone = 'text-white' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card p-4">
      <p className="font-mono text-xs uppercase text-gray-500">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function ActionButton({ label, action, busy, disabled, onClick, icon, primary, danger }: {
  label: string;
  action: string;
  busy: string;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  primary?: boolean;
  danger?: boolean;
}) {
  const isBusy = busy === action;
  return (
    <button
      className={`${primary ? 'btn-primary' : danger ? 'btn-danger' : 'btn-outline'} flex items-center gap-2`}
      onClick={onClick}
      disabled={Boolean(busy) || disabled}
    >
      {isBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function IdList({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: string[]; empty: string }) {
  return (
    <div className="card">
      <h2 className="card-header flex items-center gap-2">{icon}{title}</h2>
      {items.length === 0 ? (
        <p className="py-2 font-mono text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => <li key={item} className="truncate rounded border border-pixel-border bg-navy-700 px-3 py-1.5 font-mono text-sm text-gray-300" title={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const className = status === 'RUNNING' || status === 'COMPLETED'
    ? 'badge-success'
    : status === 'ERROR' || status === 'CANCELLED'
      ? 'badge-error'
      : status === 'PAUSED'
        ? 'badge-warning'
        : 'badge-info';
  return <span className={`badge shrink-0 px-3 py-1 text-sm ${className}`}>{status}</span>;
}

function JobStatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.toUpperCase();
  const className = normalizedStatus === 'SUCCESS'
    ? 'badge-success'
    : normalizedStatus === 'FAILED' || normalizedStatus === 'CANCELLED'
      ? 'badge-error'
      : normalizedStatus === 'QUEUED' || normalizedStatus === 'CREATED' || normalizedStatus === 'ASSIGNED'
        ? 'badge-warning'
        : 'badge-info';
  return <span className={`badge ${className}`}>{normalizedStatus}</span>;
}

function jobName(job: JobHistory) {
  const name = job.metadata?.name;
  return typeof name === 'string' && name ? name : job.type;
}

function deviceName(device: JobHistory['device']) {
  if (!device) return 'Unassigned';
  return device.deviceCode || device.model || device.id;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not set';
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—';
}
