'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  XCircle,
  Clock,
  Play,
  CheckCircle,
  AlertTriangle,
  Search,
  Filter,
  Layers,
  Cpu,
  Wifi,
  WifiOff,
  Copy,
  Check
} from 'lucide-react';

type Job = {
  id: string;
  type: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt?: string;
  account: { platform: string; username: string } | null;
  content: { title: string; caption: string | null } | null;
  metadata: { preparation?: { evidenceUrl?: string; checkpoint?: string } } | null;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL || apiUrl;

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/jobs`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'โหลด Jobs ไม่สำเร็จ');
      setJobs(result || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'โหลด Jobs ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Real-time WebSocket synchronization
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
      socket.on('jobUpdate', () => {
        void load();
      });
    }).catch(() => setSocketConnected(false));

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [load]);

  // KPI Calculations
  const stats = useMemo(() => {
    const total = jobs.length;
    const running = jobs.filter((j) => ['RUNNING', 'IN_PROGRESS', 'AWAITING_DEVICE_WORKER'].includes(j.status)).length;
    const actionRequired = jobs.filter((j) => j.status === 'ACTION_REQUIRED').length;
    const completed = jobs.filter((j) => ['SUCCESS', 'COMPLETED', 'PUBLISHED'].includes(j.status)).length;
    const failed = jobs.filter((j) => ['FAILED', 'CANCELLED', 'ERROR'].includes(j.status)).length;
    return { total, running, actionRequired, completed, failed };
  }, [jobs]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const matchStatus =
        statusFilter === 'ALL'
          ? true
          : statusFilter === 'RUNNING'
          ? ['RUNNING', 'IN_PROGRESS', 'AWAITING_DEVICE_WORKER'].includes(j.status)
          : statusFilter === 'COMPLETED'
          ? ['SUCCESS', 'COMPLETED', 'PUBLISHED'].includes(j.status)
          : j.status === statusFilter;

      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        j.id.toLowerCase().includes(q) ||
        (j.content?.title || '').toLowerCase().includes(q) ||
        (j.account?.username || '').toLowerCase().includes(q) ||
        j.type.toLowerCase().includes(q);

      return matchStatus && matchSearch;
    });
  }, [jobs, statusFilter, searchQuery]);

  async function review(job: Job, decision: 'APPROVE' | 'REJECT' | 'RESUME') {
    const note = window.prompt(decision === 'REJECT' ? 'ระบุเหตุผลที่ปฏิเสธ' : 'หมายเหตุ (ถ้ามี)', '') ?? '';
    await action(job.id, 'review', { decision, note, actor: 'local-operator' });
  }

  async function verify(job: Job) {
    const permalink = window.prompt('วางลิงก์โพสต์หลังเผยแพร่ (หรือเว้นว่างแล้วใส่ Post ID)', '') || '';
    const postId = permalink ? '' : window.prompt('Post ID', '') || '';
    if (!permalink && !postId) return;
    const accountIdentifier = window.prompt('ยืนยัน Username/Channel ที่โพสต์', job.account?.username || '') || '';
    const caption = window.prompt('ยืนยัน Caption ที่พบในโพสต์', job.content?.caption || '') || '';
    await action(job.id, 'verify', {
      uiTexts: ['published', 'your video is live', 'post published'],
      screenshotUrl: job.metadata?.preparation?.evidenceUrl,
      accountIdentifier,
      caption,
      permalink: permalink || undefined,
      postId: postId || undefined,
      actor: 'local-operator',
    });
  }

  async function action(jobId: string, path: string, body: unknown) {
    setBusy(jobId);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/api/v1/jobs/${jobId}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'ดำเนินการไม่สำเร็จ');
      setMessage(`อัปเดต Job ${jobId.slice(0, 8)} สำเร็จ`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  }

  const copyToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Status Indicator */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-mono text-white tracking-tight">JOB EXECUTION ENGINE</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyber-blue/20 text-cyber-blue border border-cyber-blue/40 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5" /> REAL-TIME WORKER QUEUE
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">คิวรันงานอัตโนมัติ จุดอนุมัติ Human-in-the-Loop และการตรวจสอบสถิติแบบ Real-time</p>
        </div>

        <div className="flex items-center gap-3">
          <span className={`badge ${socketConnected ? 'badge-online' : 'badge-offline'}`}>
            {socketConnected ? <Wifi className="mr-1 h-3.5 w-3.5" /> : <WifiOff className="mr-1 h-3.5 w-3.5" />}
            WebSocket {socketConnected ? 'Synced' : 'Disconnected'}
          </span>
          <button className="btn-outline flex items-center gap-2 text-xs" onClick={() => void load()}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>รีเฟรช API</span>
          </button>
        </div>
      </header>

      {/* KPI Cards Banner */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-3 border-pixel-border bg-navy-800/80">
          <div className="flex items-center justify-between text-gray-400 text-xs font-mono">
            <span>TOTAL JOBS</span>
            <Layers className="w-4 h-4 text-cyber-blue" />
          </div>
          <p className="text-2xl font-bold font-mono text-white mt-1">{stats.total}</p>
        </div>

        <div className="card p-3 border-blue-500/30 bg-blue-950/20">
          <div className="flex items-center justify-between text-blue-300 text-xs font-mono">
            <span>RUNNING</span>
            <Play className="w-4 h-4 text-blue-400 animate-pulse" />
          </div>
          <p className="text-2xl font-bold font-mono text-blue-200 mt-1">{stats.running}</p>
        </div>

        <div className="card p-3 border-amber-500/30 bg-amber-950/20">
          <div className="flex items-center justify-between text-amber-300 text-xs font-mono">
            <span>ACTION REQ.</span>
            <AlertTriangle className="w-4 h-4 text-amber-400 animate-bounce" />
          </div>
          <p className="text-2xl font-bold font-mono text-amber-200 mt-1">{stats.actionRequired}</p>
        </div>

        <div className="card p-3 border-emerald-500/30 bg-emerald-950/20">
          <div className="flex items-center justify-between text-emerald-300 text-xs font-mono">
            <span>COMPLETED</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-200 mt-1">{stats.completed}</p>
        </div>

        <div className="card p-3 border-red-500/30 bg-red-950/20">
          <div className="flex items-center justify-between text-red-300 text-xs font-mono">
            <span>FAILED</span>
            <XCircle className="w-4 h-4 text-red-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-red-200 mt-1">{stats.failed}</p>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="card p-4 space-y-3 border-pixel-border">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <span className="text-xs font-mono text-gray-400 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-cyber-blue" /> สถานะ:
            </span>
            {['ALL', 'RUNNING', 'ACTION_REQUIRED', 'COMPLETED', 'FAILED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-mono font-bold rounded-lg transition-colors ${
                  statusFilter === st
                    ? 'bg-cyber-blue text-slate-950 shadow-md'
                    : 'bg-navy-900 text-gray-400 hover:text-white border border-pixel-border'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาตาม Job ID, Content, User..."
              className="input-field pl-9 text-xs w-full font-mono"
            />
          </div>
        </div>
      </section>

      {message && <div className="card text-sm text-cyber-blue border-cyber-blue/40">{message}</div>}

      {/* Job List Cards */}
      <div className="space-y-4">
        {filteredJobs.map((job) => {
          const evidence = job.metadata?.preparation?.evidenceUrl;
          const challenge = job.status === 'ACTION_REQUIRED' && job.errorCode !== 'PRE_PUBLISH_REVIEW';
          const needsReview = job.status === 'ACTION_REQUIRED' && job.errorCode === 'PRE_PUBLISH_REVIEW';
          const canVerify = ['AWAITING_DEVICE_WORKER', 'VERIFYING', 'RUNNING'].includes(job.status);

          return (
            <article className="card border-pixel-border hover:border-cyber-blue/40 transition-all p-5 space-y-4" key={job.id}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={badgeStyle(job.status)}>{job.status}</span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-navy-900 text-gray-300 border border-pixel-border">
                      {job.type}
                    </span>
                    <button
                      onClick={() => copyToClipboard(job.id)}
                      className="text-[11px] font-mono text-gray-500 hover:text-cyber-blue flex items-center gap-1 transition-colors"
                      title="คัดลอก Job ID"
                    >
                      <span>ID: {job.id.slice(0, 12)}...</span>
                      {copiedId === job.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>

                  <h2 className="text-base font-bold text-white tracking-wide truncate mt-1">
                    {job.content?.title || 'ไม่มี Content'} <span className="text-cyber-blue">→</span> {job.account?.username || 'ไม่มี Account'}
                  </h2>

                  {job.errorMessage && (
                    <div className="p-2 bg-red-950/40 border border-red-800/40 rounded-lg text-xs text-red-300 font-mono flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <span>[{job.errorCode || 'ERROR'}] {job.errorMessage}</span>
                    </div>
                  )}
                </div>

                {/* Human-in-the-Loop Control Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {evidence && (
                    <a className="btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3" href={evidence} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>หลักฐาน (Screenshot)</span>
                    </a>
                  )}

                  {challenge && (
                    <button className="btn-outline flex items-center gap-1.5 text-xs py-1.5 px-3" disabled={busy === job.id} onClick={() => void review(job, 'RESUME')}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>แก้แล้วตรวจใหม่</span>
                    </button>
                  )}

                  {needsReview && (
                    <button className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold" disabled={busy === job.id} onClick={() => void review(job, 'APPROVE')}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>อนุมัติก่อนโพสต์</span>
                    </button>
                  )}

                  {(challenge || needsReview) && (
                    <button className="btn-danger flex items-center gap-1.5 text-xs py-1.5 px-3" disabled={busy === job.id} onClick={() => void review(job, 'REJECT')}>
                      <XCircle className="h-3.5 w-3.5" />
                      <span>ปฏิเสธ</span>
                    </button>
                  )}

                  {canVerify && (
                    <button className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3" disabled={busy === job.id} onClick={() => void verify(job)}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>บันทึกผลโพสต์</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Execution Workflow Step Timeline Node Visualizer */}
              <div className="pt-3 border-t border-gray-800/80">
                <div className="flex items-center justify-between text-[10px] font-mono text-gray-500 mb-1.5">
                  <span>WORKFLOW PROGRESS</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(job.createdAt).toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-mono">
                  {['CREATED', 'QUEUED', 'RUNNING', 'VERIFYING', 'SUCCESS'].map((stepName, stepIdx) => {
                    const stepPassed = isStepPassed(job.status, stepName);
                    return (
                      <div
                        key={stepIdx}
                        className={`p-1.5 rounded border transition-colors ${
                          stepPassed
                            ? 'bg-cyber-blue/20 border-cyber-blue text-cyber-blue font-bold'
                            : 'bg-navy-900/60 border-gray-800 text-gray-600'
                        }`}
                      >
                        {stepName}
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && filteredJobs.length === 0 && (
        <div className="card py-16 text-center text-gray-500 font-mono text-sm space-y-2">
          <Layers className="w-10 h-10 mx-auto text-gray-600 animate-pulse" />
          <p>ไม่พบรายการ Job ที่ตรงกับเงื่อนไขการค้นหา</p>
        </div>
      )}
    </div>
  );
}

function badgeStyle(status: string) {
  if (['SUCCESS', 'COMPLETED', 'PUBLISHED'].includes(status)) return 'badge badge-online';
  if (['FAILED', 'CANCELLED', 'ERROR'].includes(status)) return 'badge badge-offline';
  if (status === 'ACTION_REQUIRED') return 'badge badge-warning';
  return 'badge badge-info';
}

function isStepPassed(currentStatus: string, stepName: string): boolean {
  const flow = ['CREATED', 'QUEUED', 'RUNNING', 'VERIFYING', 'SUCCESS'];
  const currentIndex = flow.indexOf(currentStatus === 'AWAITING_DEVICE_WORKER' ? 'RUNNING' : currentStatus);
  const stepIndex = flow.indexOf(stepName);
  if (currentIndex === -1) {
    if (['SUCCESS', 'COMPLETED', 'PUBLISHED'].includes(currentStatus)) return true;
    return false;
  }
  return stepIndex <= currentIndex;
}

