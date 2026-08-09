'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, Users } from 'lucide-react';

type RoleCode = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER';
type User = { id: string; name: string; email: string; role?: string; isActive?: boolean };

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

const roles: Array<{ code: RoleCode; title: string; description: string; permissions: string[]; className: string }> = [
  { code: 'SUPER_ADMIN', title: 'ผู้ดูแลระบบสูงสุด', description: 'จัดการทุกองค์กร การตั้งค่าระบบ และสิทธิ์ทั้งหมด', permissions: ['ทุกสิทธิ์ในระบบ', 'จัดการองค์กร', 'จัดการแผนและเครดิต'], className: 'border-fuchsia-500 text-fuchsia-300' },
  { code: 'OWNER', title: 'เจ้าขององค์กร', description: 'ดูแลข้อมูลและผู้ใช้ทั้งหมดภายในองค์กร', permissions: ['ตั้งค่าองค์กร', 'จัดการสมาชิก', 'ดูรายงานและบิล'], className: 'border-purple-500 text-purple-300' },
  { code: 'ADMIN', title: 'ผู้ดูแล', description: 'จัดการงาน อุปกรณ์ ช่อง และแคมเปญขององค์กร', permissions: ['จัดการอุปกรณ์', 'จัดการช่องและคลิป', 'อนุมัติงาน'], className: 'border-cyber-blue text-cyber-blue' },
  { code: 'MANAGER', title: 'ผู้จัดการ', description: 'วางแผนและติดตามงานโดยไม่แก้ไขการตั้งค่าหลัก', permissions: ['สร้างแคมเปญ', 'ติดตามงาน', 'ดูรายงาน'], className: 'border-status-green text-status-green' },
  { code: 'OPERATOR', title: 'ผู้ปฏิบัติงาน', description: 'เตรียมคลิป ดูแลอุปกรณ์ และดำเนินงานที่ได้รับมอบหมาย', permissions: ['อัปโหลดคลิป', 'ตรวจอุปกรณ์', 'ทำงานที่ได้รับมอบหมาย'], className: 'border-warning-orange text-warning-orange' },
  { code: 'VIEWER', title: 'ผู้ดูข้อมูล', description: 'ดูข้อมูลที่ได้รับอนุญาตโดยไม่สามารถแก้ไขได้', permissions: ['ดูแดชบอร์ด', 'ดูรายงาน', 'ดูสถานะงาน'], className: 'border-gray-500 text-gray-300' },
];

function normalizeRole(value?: string): RoleCode {
  const role = value?.toUpperCase().replace(/\s+/g, '_') as RoleCode | undefined;
  return roles.some((item) => item.code === role) ? role! : 'VIEWER';
}

export default function RolesPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedRole, setSelectedRole] = useState<RoleCode>('VIEWER');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/api/v1/users`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'ไม่สามารถโหลดผู้ใช้ได้');
      setUsers(result.data || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ไม่สามารถเชื่อมต่อ API ได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const assignments = useMemo(() => roles.map((role) => ({
    ...role,
    count: users.filter((user) => normalizeRole(user.role) === role.code).length,
  })), [users]);

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUserId) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/api/v1/users/${selectedUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'บันทึกบทบาทไม่สำเร็จ');
      if (normalizeRole(result.data?.role) !== selectedRole) {
        throw new Error('API ผู้ใช้ยังไม่รองรับการบันทึกบทบาท กรุณาเปิดใช้ RBAC backend ก่อน');
      }
      setUsers((current) => current.map((user) => user.id === selectedUserId ? { ...user, role: selectedRole } : user));
      setMessage('บันทึกบทบาทผู้ใช้เรียบร้อยแล้ว');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'บันทึกบทบาทไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-mono text-2xl font-bold text-white"><ShieldCheck className="h-6 w-6 text-cyber-blue" /> จัดการบทบาทและสิทธิ์</h1>
          <p className="mt-1 text-sm text-gray-400">กำหนดระดับการเข้าถึงให้สมาชิกในองค์กรอย่างชัดเจน</p>
        </div>
        <button className="btn-outline flex items-center gap-2" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> รีเฟรช</button>
      </header>

      {message && <div className="card text-sm text-cyber-blue">{message}</div>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {assignments.map((role) => (
          <article className={`card border ${role.className}`} key={role.code}>
            <div className="flex items-start justify-between gap-3"><div><h2 className="font-mono font-bold text-white">{role.title}</h2><p className="mt-1 text-xs text-gray-400">{role.code}</p></div><span className="badge badge-online">{role.count} คน</span></div>
            <p className="mt-4 min-h-10 text-sm text-gray-300">{role.description}</p>
            <ul className="mt-4 space-y-1 text-xs text-gray-400">{role.permissions.map((permission) => <li key={permission}>• {permission}</li>)}</ul>
          </article>
        ))}
      </section>

      <section className="card">
        <h2 className="flex items-center gap-2 font-mono text-lg font-bold text-white"><Users className="h-5 w-5 text-cyber-blue" /> กำหนดบทบาทให้สมาชิก</h2>
        <p className="mt-1 text-sm text-gray-400">การเปลี่ยนบทบาทมีผลต่อสิทธิ์ครั้งถัดไปที่ผู้ใช้เข้าสู่ระบบ</p>
        <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={assignRole}>
          <label className="text-sm text-gray-300">สมาชิก<select className="input-field mt-1 w-full" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} required><option value="">เลือกสมาชิก</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email} — {user.email}</option>)}</select></label>
          <label className="text-sm text-gray-300">บทบาทใหม่<select className="input-field mt-1 w-full" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value as RoleCode)}>{roles.map((role) => <option key={role.code} value={role.code}>{role.title} ({role.code})</option>)}</select></label>
          <div className="flex items-end"><button className="btn-primary w-full" disabled={saving || loading || !selectedUserId}>{saving ? 'กำลังบันทึก...' : 'บันทึกบทบาท'}</button></div>
        </form>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-left text-sm"><thead className="border-b border-gray-700 text-xs text-gray-400"><tr><th className="p-3">สมาชิก</th><th className="p-3">อีเมล</th><th className="p-3">บทบาทปัจจุบัน</th><th className="p-3">สถานะ</th></tr></thead><tbody>{users.map((user) => <tr className="border-b border-gray-800" key={user.id}><td className="p-3 text-white">{user.name}</td><td className="p-3 text-gray-400">{user.email}</td><td className="p-3"><span className="badge badge-online">{normalizeRole(user.role)}</span></td><td className="p-3 text-gray-400">{user.isActive === false ? 'ปิดใช้งาน' : 'ใช้งานอยู่'}</td></tr>)}</tbody></table>
        {!loading && users.length === 0 && <p className="py-8 text-center text-gray-500">ยังไม่มีสมาชิกให้กำหนดบทบาท</p>}
      </section>
    </main>
  );
}
