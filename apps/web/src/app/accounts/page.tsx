'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Link2, Pencil, RefreshCw, Save, UserRoundPlus, Wifi, WifiOff, X } from 'lucide-react';
import Link from 'next/link';
import { apiFetch, apiUrl } from '@/lib/api-client';

type Account = {
  id: string;
  platform: string;
  username: string;
  nickname: string | null;
  status: string;
  authStatus: string;
  assignedDeviceId: string | null;
  createdAt: string;
};

type Device = {
  id: string;
  code: string;
  name: string | null;
  model: string | null;
  serialNumber: string | null;
  adbStatus: string;
  lastHeartbeatAt: string | null;
};

type ApiPayload<T> = { success?: boolean; data?: T; message?: string };

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [editDeviceId, setEditDeviceId] = useState('');

  const devicesById = useMemo(() => new Map(devices.map((device) => [device.id, device])), [devices]);
  const phone = useMemo(() => devices.find((device) => device.code === 'PHONE-001'), [devices]);
  const phoneOnline = Boolean(phone && ['ONLINE', 'BUSY', 'WARNING'].includes(phone.adbStatus));

  const requestHeaders = useCallback((json = false) => {
    const headers: Record<string, string> = {};
    if (json) headers['Content-Type'] = 'application/json';
    const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsResponse, devicesResponse] = await Promise.all([
        apiFetch('/api/v1/accounts', { cache: 'no-store', headers: requestHeaders() }),
        apiFetch('/api/v1/devices', { cache: 'no-store', headers: requestHeaders() }),
      ]);
      const [accountsPayload, devicesPayload] = await Promise.all([
        readPayload<Account[]>(accountsResponse),
        readPayload<Device[]>(devicesResponse),
      ]);
      setAccounts(accountsPayload);
      setDevices(devicesPayload);
    } catch (error) {
      setMessage(errorMessage(error, 'โหลดข้อมูลไม่สำเร็จ'));
    } finally {
      setLoading(false);
    }
  }, [requestHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setSubmitting(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/v1/accounts', {
        method: 'POST',
        headers: requestHeaders(true),
        body: JSON.stringify({ ...values, status: 'ACTIVE', authStatus: 'MANUAL_CHECK_REQUIRED' }),
      });
      await readPayload<Account>(response);
      form.reset();
      setMessage('เพิ่มช่องสำเร็จ สามารถแก้ไขหรือผูก Device ภายหลังได้');
      await load();
    } catch (error) {
      setMessage(errorMessage(error, 'สร้างช่องไม่สำเร็จ'));
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(account: Account) {
    setEditingAccount(account);
    setEditNickname(account.nickname || '');
    setEditDeviceId(account.assignedDeviceId || '');
    setMessage('');
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAccount) return;
    setSubmitting(true);
    setMessage('');
    try {
      const response = await apiFetch(`/api/v1/accounts/${editingAccount.id}`, {
        method: 'PATCH',
        headers: requestHeaders(true),
        body: JSON.stringify({ nickname: editNickname.trim() || null, assignedDeviceId: editDeviceId || null }),
      });
      await readPayload<Account>(response);
      setMessage(`บันทึก ${editingAccount.nickname || editingAccount.username} สำเร็จ`);
      setEditingAccount(null);
      await load();
    } catch (error) {
      setMessage(errorMessage(error, 'บันทึกการแก้ไขไม่สำเร็จ'));
    } finally {
      setSubmitting(false);
    }
  }

  async function verify(account: Account) {
    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/v1/accounts/${account.id}`, {
        method: 'PATCH',
        headers: requestHeaders(true),
        body: JSON.stringify({ authStatus: 'VERIFIED' }),
      });
      await readPayload<Account>(response);
      setMessage(`ยืนยัน ${account.nickname || account.username} แล้ว`);
      await load();
    } catch (error) {
      setMessage(errorMessage(error, 'ยืนยันไม่สำเร็จ'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-bold text-white">ACCOUNTS</h1>
          <p className="text-sm text-gray-400">ทะเบียนช่องและการผูกโทรศัพท์</p>
        </div>
        <button className="btn-outline" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <section className={`card flex flex-col gap-4 border ${phoneOnline ? 'border-status-green/60' : 'border-error-red/60'} lg:flex-row lg:items-center lg:justify-between`}>
        <div className="flex items-start gap-3">
          {phoneOnline ? <Wifi className="mt-0.5 h-5 w-5 text-status-green" /> : <WifiOff className="mt-0.5 h-5 w-5 text-error-red" />}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono font-bold text-white">PHONE-001</h2>
              <span className={`badge ${phoneOnline ? 'badge-online' : 'badge-error'}`}>{phone?.adbStatus || 'NOT REGISTERED'}</span>
            </div>
            <p className="mt-1 text-sm text-gray-400">
              {phoneOnline
                ? `เชื่อมต่อแล้ว${phone?.serialNumber ? ` — ${phone.serialNumber}` : ''}`
                : 'ถ้าโทรศัพท์ยังเสียบสายอยู่ แสดงว่า Device Agent อาจหยุดทำงาน ให้เปิด Agent แล้วกดตรวจใหม่'}
            </p>
            <p className="mt-1 text-xs text-gray-500">Heartbeat ล่าสุด: {formatDate(phone?.lastHeartbeatAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline flex items-center gap-2" disabled={loading} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />ตรวจการเชื่อมต่อ</button>
          <Link className="btn-outline flex items-center gap-2" href="/devices/PHONE-001"><ExternalLink className="h-4 w-4" />ดูรายละเอียดเครื่อง</Link>
        </div>
      </section>

      <form className="card grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
        <select className="input-field" name="platform" required defaultValue="">
          <option value="" disabled>เลือกแพลตฟอร์ม</option>
          <option>TikTok</option><option>YouTube</option><option>Facebook</option><option>Instagram</option>
        </select>
        <input className="input-field" name="username" required placeholder="Username / Channel ID" />
        <input className="input-field" name="nickname" placeholder="ชื่อเรียก เช่น ช่อง 1" />
        <DeviceSelect devices={devices} name="assignedDeviceId" defaultValue="" />
        <button className="btn-primary flex items-center justify-center gap-2 md:col-span-2 xl:col-span-4" disabled={submitting}>
          <UserRoundPlus className="h-4 w-4" />{submitting ? 'กำลังบันทึก...' : 'เพิ่มช่อง'}
        </button>
      </form>

      {editingAccount && (
        <form className="card space-y-4 border-cyber-blue" onSubmit={saveEdit}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-mono font-bold text-white">แก้ไข {editingAccount.username}</h2>
              <p className="text-xs text-gray-400">เลือก PHONE-001 ได้โดยไม่ต้องคัดลอก Device ID</p>
            </div>
            <button type="button" className="btn-outline p-2" onClick={() => setEditingAccount(null)}><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <input className="input-field" value={editNickname} onChange={(event) => setEditNickname(event.target.value)} placeholder="ชื่อเรียก" />
            <DeviceSelect devices={devices} value={editDeviceId} onChange={setEditDeviceId} />
          </div>
          <button className="btn-primary flex items-center gap-2" disabled={submitting}><Save className="h-4 w-4" />บันทึกการแก้ไข</button>
        </form>
      )}

      {message && <div className="card text-sm text-cyber-blue">{message}</div>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-navy-700 text-gray-400"><tr><th className="p-3">Platform</th><th className="p-3">Channel</th><th className="p-3">Device</th><th className="p-3">Auth</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead>
          <tbody>{accounts.map((account) => {
            const assignedDevice = account.assignedDeviceId ? devicesById.get(account.assignedDeviceId) : undefined;
            return (
              <tr className="border-t border-pixel-border" key={account.id}>
                <td className="p-3 text-cyber-blue">{account.platform}</td>
                <td className="p-3 text-white"><div>{account.nickname || account.username}</div><div className="text-xs text-gray-500">{account.username}</div></td>
                <td className="p-3">{assignedDevice ? <div><div className="flex items-center gap-2 text-white"><span>{assignedDevice.code}</span><span className={`text-xs ${['ONLINE', 'BUSY', 'WARNING'].includes(assignedDevice.adbStatus) ? 'text-status-green' : 'text-error-red'}`}>{assignedDevice.adbStatus}</span></div><div className="text-xs text-gray-500">{assignedDevice.serialNumber || assignedDevice.name}</div></div> : <span className="text-warning-yellow">ยังไม่ผูก Device</span>}</td>
                <td className="p-3">{account.authStatus === 'VERIFIED' ? <span className="text-status-green">VERIFIED</span> : <button className="btn-outline px-2 py-1 text-xs" disabled={submitting} onClick={() => void verify(account)}>ยืนยัน Login แล้ว</button>}</td>
                <td className="p-3"><span className="badge badge-online">{account.status}</span></td>
                <td className="p-3"><button className="btn-outline flex items-center gap-2 px-3 py-2 text-xs" onClick={() => startEdit(account)}>{account.assignedDeviceId ? <Pencil className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}{account.assignedDeviceId ? 'แก้ไข' : 'ผูกอุปกรณ์'}</button></td>
              </tr>
            );
          })}</tbody>
        </table>
        {!loading && accounts.length === 0 && <p className="p-10 text-center text-gray-500">ยังไม่มีช่อง</p>}
      </div>
    </div>
  );
}

function DeviceSelect({ devices, name, defaultValue, value, onChange }: { devices: Device[]; name?: string; defaultValue?: string; value?: string; onChange?: (value: string) => void }) {
  return (
    <select className="input-field" name={name} defaultValue={defaultValue} value={value} onChange={onChange ? (event) => onChange(event.target.value) : undefined}>
      <option value="">ยังไม่ผูก Device</option>
      {devices.map((device) => <option key={device.id} value={device.id}>{device.code} — {device.model || device.name || device.serialNumber || device.id} ({device.adbStatus})</option>)}
    </select>
  );
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({})) as ApiPayload<T>;
  if (!response.ok || payload.success === false) throw new Error(payload.message || `API error ${response.status}`);
  return (payload.data ?? payload) as T;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDate(value?: string | null) {
  if (!value) return 'ยังไม่มีข้อมูล';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('th-TH');
}
