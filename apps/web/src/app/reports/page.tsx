'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Download, FileWarning, Image as ImageIcon, LoaderCircle, RefreshCw, XCircle } from 'lucide-react';

type JobMetadata = {
  preparation?: { evidenceUrl?: string; checkpoint?: string };
  evidenceUrl?: string;
  screenshotUrl?: string;
};

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
  campaign: { name: string } | null;
  account: { platform: string; username: string; nickname: string | null } | null;
  content: { title: string } | null;
  metadata: JobMetadata | null;
};

type Campaign = { id: string; name: string; status: string; totalJobs: number; successJobs: number; failedJobs: number; createdAt: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const thaiDateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

function evidenceUrl(metadata: JobMetadata | null) {
  return metadata?.preparation?.evidenceUrl || metadata?.evidenceUrl || metadata?.screenshotUrl || null;
}

function statusClass(status: string) {
  if (status === 'SUCCESS') return 'badge-success';
  if (status === 'FAILED' || status === 'CANCELLED') return 'badge-error';
  if (status === 'ACTION_REQUIRED') return 'badge-warning';
  if (status === 'RUNNING' || status === 'VERIFYING') return 'badge-busy';
  return 'badge-info';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : thaiDateTime.format(date);
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

export default function ReportsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [jobResponse, campaignResponse] = await Promise.all([
        fetch(`${apiUrl}/api/v1/jobs`, { cache: 'no-store' }).catch(() => null),
        fetch(`${apiUrl}/api/v1/campaigns`, { cache: 'no-store' }).catch(() => null),
      ]);
      if (!jobResponse || !campaignResponse) {
        setError('⚠️ ไม่พบการเชื่อมต่อกับ Backend API (http://localhost:3001) — กรุณารันคำสั่ง "npm run dev --workspace @farm-phone/api" ใน Terminal');
        return;
      }
      const [jobData, campaignData] = await Promise.all([jobResponse.json(), campaignResponse.json()]);
      if (!jobResponse.ok) throw new Error(jobData.message || 'ไม่สามารถโหลดรายงาน Jobs ได้');
      if (!campaignResponse.ok) throw new Error(campaignData.message || 'ไม่สามารถโหลดรายงาน Campaigns ได้');
      setJobs(Array.isArray(jobData) ? jobData as Job[] : []);
      setCampaigns(Array.isArray(campaignData) ? campaignData as Campaign[] : []);
      setUpdatedAt(new Date());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'ไม่สามารถเชื่อมต่อระบบ Reports ได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const report = useMemo(() => {
    const successful = jobs.filter((job) => job.status === 'SUCCESS');
    const failed = jobs.filter((job) => job.status === 'FAILED');
    const actionRequired = jobs.filter((job) => job.status === 'ACTION_REQUIRED');
    const withEvidence = jobs.filter((job) => evidenceUrl(job.metadata));
    const resolved = successful.length + failed.length;
    const byStatus = jobs.reduce<Record<string, number>>((counts, job) => {
      counts[job.status] = (counts[job.status] || 0) + 1;
      return counts;
    }, {});
    return { successful, failed, actionRequired, withEvidence, resolved, successRate: resolved ? (successful.length / resolved) * 100 : 0, byStatus };
  }, [jobs]);

  function downloadCsv() {
    const headers = ['Job ID', 'Campaign', 'Content', 'Account', 'Platform', 'Status', 'Scheduled At', 'Completed At', 'Error Code', 'Error Message', 'Evidence URL'];
    const rows = jobs.map((job) => [job.id, job.campaign?.name, job.content?.title, job.account?.nickname || job.account?.username, job.account?.platform, job.status, job.scheduledAt, job.completedAt, job.errorCode, job.errorMessage, evidenceUrl(job.metadata)]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `farm-phone-jobs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const statusRows = Object.entries(report.byStatus).sort((first, second) => second[1] - first[1]);

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><p className="font-mono text-xs uppercase tracking-widest text-cyber-blue">Operations / Reports</p><h1 className="mt-1 text-2xl font-bold font-mono text-white">รายงานการปฏิบัติงาน</h1><p className="mt-1 text-sm text-gray-400">สรุปผลสำเร็จ ความผิดพลาด หลักฐาน และงานที่รอผู้ดูแลดำเนินการ</p></div>
        <div className="flex flex-wrap items-center gap-3"><span className="font-mono text-xs text-gray-500">อัปเดต {updatedAt ? thaiDateTime.format(updatedAt) : '—'}</span><button type="button" className="btn-outline flex items-center gap-2 text-sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> รีเฟรช</button><button type="button" className="btn-primary flex items-center gap-2 text-sm" onClick={downloadCsv} disabled={jobs.length === 0}><Download className="h-4 w-4" /> ส่งออก CSV</button></div>
      </header>

      {error && <div className="card border-error-red text-sm text-error-red">{error}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="kpi-card"><span className="kpi-label">Jobs ทั้งหมด</span><span className="kpi-value">{jobs.length}</span><span className="kpi-sub">จาก {campaigns.length} Campaigns</span></div>
        <div className="kpi-card"><span className="kpi-label">สำเร็จ</span><span className="kpi-value text-status-green">{report.successful.length}</span><span className="kpi-sub">Success rate {report.successRate.toFixed(1)}%</span></div>
        <div className="kpi-card"><span className="kpi-label">ล้มเหลว</span><span className="kpi-value text-error-red">{report.failed.length}</span><span className="kpi-sub">ต้องตรวจสาเหตุและแก้ไข</span></div>
        <div className="kpi-card"><span className="kpi-label">รอการดำเนินการ</span><span className="kpi-value text-warning-orange">{report.actionRequired.length}</span><span className="kpi-sub">CAPTCHA, OTP หรืออนุมัติก่อนโพสต์</span></div>
        <div className="kpi-card"><span className="kpi-label">มีหลักฐาน</span><span className="kpi-value text-cyber-blue">{report.withEvidence.length}</span><span className="kpi-sub">Screenshot หรือ URL ที่บันทึกไว้</span></div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_1.35fr]">
        <div className="card"><div className="mb-5 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-cyber-blue" /><h2 className="font-mono text-lg font-bold text-white">สถานะ Jobs</h2></div><div className="space-y-4">{statusRows.map(([status, count]) => <div key={status}><div className="mb-1 flex items-center justify-between text-sm"><span className={`badge ${statusClass(status)}`}>{status}</span><span className="font-mono text-gray-300">{count}</span></div><div className="h-2 overflow-hidden rounded bg-navy-700"><div className="h-full rounded bg-cyber-blue" style={{ width: `${jobs.length ? (count / jobs.length) * 100 : 0}%` }} /></div></div>)}{!loading && statusRows.length === 0 && <p className="py-8 text-center text-sm text-gray-500">ยังไม่มีข้อมูล Job สำหรับสรุปรายงาน</p>}</div></div>
        <div className="card"><div className="mb-5 flex items-center gap-2"><ImageIcon className="h-5 w-5 text-cyber-blue" /><h2 className="font-mono text-lg font-bold text-white">หลักฐานและการตรวจสอบ</h2></div><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg border border-pixel-border bg-navy-700/40 p-4"><CheckCircle2 className="h-5 w-5 text-status-green" /><p className="mt-3 text-2xl font-bold font-mono text-white">{report.successful.length}</p><p className="mt-1 text-xs text-gray-400">งานยืนยันสำเร็จ</p></div><div className="rounded-lg border border-pixel-border bg-navy-700/40 p-4"><ImageIcon className="h-5 w-5 text-cyber-blue" /><p className="mt-3 text-2xl font-bold font-mono text-white">{report.withEvidence.length}</p><p className="mt-1 text-xs text-gray-400">ไฟล์หลักฐานที่เข้าดูได้</p></div><div className="rounded-lg border border-warning-orange/50 bg-warning-orange/5 p-4"><AlertTriangle className="h-5 w-5 text-warning-orange" /><p className="mt-3 text-2xl font-bold font-mono text-white">{report.actionRequired.length}</p><p className="mt-1 text-xs text-gray-400">ต้องให้คนยืนยันต่อ</p></div></div><p className="mt-5 text-sm leading-6 text-gray-400">หลักฐานจะปรากฏเมื่อ Device Worker จับภาพหน้าจอและเก็บ URL ไว้กับ Job หากพบ CAPTCHA, OTP หรือจุดอนุมัติ ระบบจะคงสถานะ <span className="font-mono text-warning-orange">ACTION_REQUIRED</span> เพื่อป้องกันการโพสต์ต่อโดยอัตโนมัติ</p></div>
      </section>

      <section className="card"><div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><FileWarning className="h-5 w-5 text-warning-orange" /><h2 className="font-mono text-lg font-bold text-white">งานที่ต้องติดตาม</h2></div><span className="font-mono text-xs text-gray-500">แสดง ACTION_REQUIRED และ FAILED ล่าสุด</span></div><div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead><tr className="border-b-2 border-pixel-border bg-navy-700 font-mono text-xs uppercase tracking-wider text-gray-400"><th className="px-4 py-3">งาน</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">รายละเอียด</th><th className="px-4 py-3">เวลา</th><th className="px-4 py-3">หลักฐาน</th></tr></thead><tbody className="divide-y divide-gray-800">{jobs.filter((job) => job.status === 'ACTION_REQUIRED' || job.status === 'FAILED').slice(0, 12).map((job) => { const url = evidenceUrl(job.metadata); return <tr key={job.id} className="transition-colors hover:bg-navy-700/50"><td className="px-4 py-3"><p className="font-medium text-white">{job.content?.title || 'ไม่มี Content'}</p><p className="mt-1 text-xs text-gray-500">{job.account?.nickname || job.account?.username || 'ไม่มี Account'} · {job.campaign?.name || 'ไม่ผูก Campaign'}</p></td><td className="px-4 py-3"><span className={`badge ${statusClass(job.status)}`}>{job.status}</span></td><td className="max-w-sm px-4 py-3 text-sm text-gray-300">{job.errorMessage || job.metadata?.preparation?.checkpoint || job.errorCode || 'ต้องตรวจสอบข้อมูล Job'}</td><td className="px-4 py-3 font-mono text-xs text-gray-400">{formatDate(job.completedAt || job.startedAt || job.createdAt)}</td><td className="px-4 py-3">{url ? <a className="text-xs font-mono text-cyber-blue hover:text-neon-cyan" href={url} target="_blank" rel="noreferrer">เปิด Screenshot</a> : <span className="text-xs text-gray-600">ไม่มี</span>}</td></tr>; })}</tbody></table></div>{!loading && report.actionRequired.length + report.failed.length === 0 && <div className="py-10 text-center text-sm text-status-green"><CheckCircle2 className="mx-auto mb-3 h-8 w-8" />ไม่มีงานที่ล้มเหลวหรือรอการตรวจสอบ</div>}{loading && <div className="flex justify-center py-10 text-cyber-blue"><LoaderCircle className="h-6 w-6 animate-spin" /></div>}</section>

      <section className="card"><div className="mb-4 flex items-center gap-2"><XCircle className="h-5 w-5 text-error-red" /><h2 className="font-mono text-lg font-bold text-white">Jobs ล่าสุด</h2></div><div className="grid gap-3 md:grid-cols-2">{jobs.slice(0, 8).map((job) => <article key={job.id} className="rounded-lg border border-pixel-border bg-navy-700/30 p-4"><div className="flex items-center justify-between gap-3"><span className={`badge ${statusClass(job.status)}`}>{job.status}</span><span className="font-mono text-xs text-gray-500">{formatDate(job.completedAt || job.createdAt)}</span></div><p className="mt-3 truncate font-medium text-white">{job.content?.title || 'ไม่มี Content'} → {job.account?.nickname || job.account?.username || 'ไม่มี Account'}</p><p className="mt-1 truncate text-xs text-gray-500">{job.campaign?.name || job.type}</p></article>)}</div>{!loading && jobs.length === 0 && <p className="py-8 text-center text-sm text-gray-500">ยังไม่มี Job</p>}</section>
    </div>
  );
}
