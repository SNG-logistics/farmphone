'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, ExternalLink, LoaderCircle, RefreshCw, Rows3, ShieldAlert } from 'lucide-react';

type Campaign = {
  id: string;
  name: string;
  status: string;
  schedule: string | null;
  accountIds: string[];
  contentIds: string[];
  dailyLimit: number;
  totalJobs: number;
  successJobs: number;
  failedJobs: number;
  createdAt: string;
};

type JobPreparation = { evidenceUrl?: string; checkpoint?: string };
type Job = {
  id: string;
  type: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  errorCode: string | null;
  errorMessage: string | null;
  campaign: { id: string; name: string } | null;
  account: { platform: string; username: string; nickname: string | null } | null;
  content: { title: string } | null;
  metadata: { preparation?: JobPreparation } | null;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const thaiDateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

function statusClass(status: string) {
  if (status === 'SUCCESS' || status === 'COMPLETED') return 'badge-success';
  if (status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') return 'badge-error';
  if (status === 'RUNNING' || status === 'VERIFYING') return 'badge-busy';
  if (status === 'ACTION_REQUIRED') return 'badge-warning';
  return 'badge-info';
}

function formatDate(value: string | null) {
  if (!value) return 'ยังไม่กำหนดเวลา';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : thaiDateTime.format(date);
}

function isFuture(value: string | null) {
  return value !== null && new Date(value).getTime() > Date.now();
}

export default function SchedulerPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [campaignResponse, jobResponse] = await Promise.all([
        fetch(`${apiUrl}/api/v1/campaigns`, { cache: 'no-store' }),
        fetch(`${apiUrl}/api/v1/jobs`, { cache: 'no-store' }),
      ]);
      const [campaignData, jobData] = await Promise.all([campaignResponse.json(), jobResponse.json()]);
      if (!campaignResponse.ok) throw new Error(campaignData.message || 'ไม่สามารถโหลด Campaigns ได้');
      if (!jobResponse.ok) throw new Error(jobData.message || 'ไม่สามารถโหลด Jobs ได้');
      setCampaigns(Array.isArray(campaignData) ? campaignData as Campaign[] : []);
      setJobs(Array.isArray(jobData) ? jobData as Job[] : []);
      setUpdatedAt(new Date());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'ไม่สามารถเชื่อมต่อระบบ Scheduler ได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 20_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const summary = useMemo(() => {
    const scheduled = jobs.filter((job) => isFuture(job.scheduledAt));
    const active = jobs.filter((job) => job.status === 'RUNNING' || job.status === 'VERIFYING');
    const awaitingReview = jobs.filter((job) => job.status === 'ACTION_REQUIRED');
    const futureCampaigns = campaigns.filter((campaign) => isFuture(campaign.schedule));
    const nextItem = [...scheduled, ...futureCampaigns]
      .sort((first, second) => new Date('scheduledAt' in first ? first.scheduledAt! : first.schedule!).getTime() - new Date('scheduledAt' in second ? second.scheduledAt! : second.schedule!).getTime())[0];
    return { scheduled, active, awaitingReview, futureCampaigns, nextItem };
  }, [campaigns, jobs]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-cyber-blue">Operations / Scheduler</p>
          <h1 className="mt-1 text-2xl font-bold font-mono text-white">ตารางงานอัตโนมัติ</h1>
          <p className="mt-1 text-sm text-gray-400">ติดตามเวลาปล่อยงาน สถานะคิว และงานที่ต้องตรวจสอบก่อนเผยแพร่</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-gray-500">อัปเดต {updatedAt ? thaiDateTime.format(updatedAt) : '—'}</span>
          <button type="button" className="btn-outline flex items-center gap-2 text-sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> รีเฟรช
          </button>
          <Link className="btn-primary flex items-center gap-2 text-sm" href="/campaigns">
            <CalendarClock className="h-4 w-4" /> จัดการ Campaign
          </Link>
        </div>
      </header>

      {error && <div className="card border-error-red text-sm text-error-red">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="kpi-card"><span className="kpi-label">กำหนดรันล่วงหน้า</span><span className="kpi-value text-cyber-blue">{summary.scheduled.length}</span><span className="kpi-sub">Jobs ที่มีเวลาในอนาคต</span></div>
        <div className="kpi-card"><span className="kpi-label">กำลังทำงาน</span><span className="kpi-value text-warning-orange">{summary.active.length}</span><span className="kpi-sub">RUNNING หรือ VERIFYING</span></div>
        <div className="kpi-card"><span className="kpi-label">ต้องตรวจสอบ</span><span className="kpi-value text-warning-orange">{summary.awaitingReview.length}</span><span className="kpi-sub">CAPTCHA, OTP หรืออนุมัติก่อนโพสต์</span></div>
        <div className="kpi-card"><span className="kpi-label">เวลาถัดไป</span><span className="kpi-value text-lg text-status-green">{summary.nextItem ? formatDate('scheduledAt' in summary.nextItem ? summary.nextItem.scheduledAt : summary.nextItem.schedule) : 'ไม่มี'}</span><span className="kpi-sub">{summary.nextItem ? ('campaign' in summary.nextItem && summary.nextItem.campaign ? summary.nextItem.campaign.name : ('name' in summary.nextItem ? summary.nextItem.name : 'Job')) : 'รอการตั้งเวลา'}</span></div>
      </section>

      <section className="card">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-cyber-blue" /><h2 className="font-mono text-lg font-bold text-white">Campaign ที่ตั้งเวลาไว้</h2></div>
          <span className="font-mono text-xs text-gray-500">{summary.futureCampaigns.length} รายการในอนาคต</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm"><thead><tr className="border-b-2 border-pixel-border bg-navy-700 font-mono text-xs uppercase tracking-wider text-gray-400"><th className="px-4 py-3">เวลา</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">เป้าหมาย</th><th className="px-4 py-3">จำกัดต่อวัน</th><th className="px-4 py-3">สถานะ</th></tr></thead>
            <tbody className="divide-y divide-gray-800">{summary.futureCampaigns.map((campaign) => <tr key={campaign.id} className="transition-colors hover:bg-navy-700/50"><td className="px-4 py-3 font-mono text-white">{formatDate(campaign.schedule)}</td><td className="px-4 py-3"><p className="font-medium text-white">{campaign.name}</p><p className="mt-1 text-xs text-gray-500">{campaign.totalJobs} Jobs ที่สร้างแล้ว</p></td><td className="px-4 py-3 text-gray-300">{campaign.accountIds.length} ช่อง × {campaign.contentIds.length} คลิป</td><td className="px-4 py-3 text-gray-300">{campaign.dailyLimit || 'ไม่จำกัด'}</td><td className="px-4 py-3"><span className={`badge ${statusClass(campaign.status)}`}>{campaign.status}</span></td></tr>)}</tbody>
          </table>
        </div>
        {!loading && summary.futureCampaigns.length === 0 && <div className="py-10 text-center text-sm text-gray-500">ยังไม่มี Campaign ที่กำหนดเวลาในอนาคต — สร้างและตั้งเวลาจากหน้า Campaigns</div>}
      </section>

      <section className="card">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><Rows3 className="h-5 w-5 text-cyber-blue" /><h2 className="font-mono text-lg font-bold text-white">คิวงานและจุดตรวจสอบ</h2></div>
          <Link className="flex items-center gap-1 text-xs font-mono text-cyber-blue hover:text-neon-cyan" href="/jobs">ดู Jobs ทั้งหมด <ExternalLink className="h-3.5 w-3.5" /></Link>
        </div>
        <div className="space-y-3">{jobs.filter((job) => isFuture(job.scheduledAt) || job.status === 'RUNNING' || job.status === 'VERIFYING' || job.status === 'ACTION_REQUIRED').sort((first, second) => (first.scheduledAt || first.createdAt).localeCompare(second.scheduledAt || second.createdAt)).map((job) => {
          const evidenceUrl = job.metadata?.preparation?.evidenceUrl;
          const isActionRequired = job.status === 'ACTION_REQUIRED';
          return <article key={job.id} className={`rounded-lg border p-4 ${isActionRequired ? 'border-warning-orange/60 bg-warning-orange/5' : 'border-pixel-border bg-navy-700/30'}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`badge ${statusClass(job.status)}`}>{job.status}</span><span className="font-mono text-xs text-gray-500">{job.type}</span><span className="font-mono text-xs text-gray-500">{formatDate(job.scheduledAt)}</span></div><h3 className="mt-2 truncate font-medium text-white">{job.content?.title || 'ไม่มี Content'} <span className="text-gray-500">→</span> {job.account?.nickname || job.account?.username || 'ไม่มี Account'}</h3><p className={`mt-1 text-sm ${isActionRequired ? 'text-warning-orange' : 'text-gray-400'}`}>{isActionRequired ? <><ShieldAlert className="mr-1 inline h-4 w-4" />{job.errorMessage || job.metadata?.preparation?.checkpoint || 'รอการตรวจสอบจากผู้ดูแล'}</> : job.campaign?.name || 'งานที่ไม่ได้ผูก Campaign'}</p></div><div className="flex shrink-0 items-center gap-2">{evidenceUrl && <a className="btn-outline flex items-center gap-2 text-xs" href={evidenceUrl} target="_blank" rel="noreferrer"><CheckCircle2 className="h-4 w-4" /> หลักฐาน</a>}{isActionRequired && <Link className="btn-primary flex items-center gap-2 text-xs" href="/jobs"><AlertTriangle className="h-4 w-4" /> ตรวจงาน</Link>}</div></div></article>;
        })}</div>
        {!loading && jobs.filter((job) => isFuture(job.scheduledAt) || job.status === 'RUNNING' || job.status === 'VERIFYING' || job.status === 'ACTION_REQUIRED').length === 0 && <div className="py-10 text-center text-sm text-gray-500"><Clock3 className="mx-auto mb-3 h-8 w-8 text-gray-600" />ไม่มีงานที่กำลังทำงาน รอเวลา หรือรอการตรวจสอบ</div>}
        {loading && <div className="flex justify-center py-10 text-cyber-blue"><LoaderCircle className="h-6 w-6 animate-spin" /></div>}
      </section>
    </div>
  );
}
