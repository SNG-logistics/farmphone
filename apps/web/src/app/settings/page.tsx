'use client';

import Link from 'next/link';
import {
  BookOpen,
  CheckCircle,
  CircleAlert,
  ExternalLink,
  KeyRound,
  Radio,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

const publicApiUrl = process.env.NEXT_PUBLIC_API_URL;
const publicWebSocketUrl = process.env.NEXT_PUBLIC_WS_URL;

type PublicConfigurationProps = {
  label: string;
  variable: string;
  value?: string;
  icon: React.ReactNode;
};

function PublicConfiguration({ label, variable, value, icon }: PublicConfigurationProps) {
  const configured = Boolean(value);

  return (
    <div className="rounded border border-gray-700 bg-navy-700/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 text-cyber-blue">{icon}</span>
          <div className="min-w-0">
            <h3 className="font-mono text-sm font-bold text-white">{label}</h3>
            <code className="mt-1 block break-all text-xs text-gray-500">{variable}</code>
            <p className={`mt-3 break-all font-mono text-sm ${configured ? 'text-gray-200' : 'text-warning-orange'}`}>
              {configured ? value : 'ไม่ได้กำหนดใน Public Environment'}
            </p>
          </div>
        </div>
        <span className={`badge shrink-0 ${configured ? 'badge-success' : 'badge-warning'}`}>
          {configured ? 'CONFIGURED' : 'NOT SET'}
        </span>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const apiDocsUrl = publicApiUrl ? `${publicApiUrl.replace(/\/$/, '')}/api/docs` : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-cyber-blue" />
          <h1 className="font-mono text-2xl font-bold text-white">PHASE 1 CONFIGURATION</h1>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-gray-400">
          หน้านี้เป็นข้อมูลแบบอ่านอย่างเดียว ระบบยังไม่มี Settings API จึงไม่มีการจำลององค์กร, API key,
          session หรือปุ่มบันทึกที่ไม่ได้เขียนข้อมูลจริง
        </p>
      </div>

      <div className="card">
        <div className="flex items-start gap-3">
          <Radio className="mt-0.5 h-5 w-5 text-status-green" />
          <div>
            <h2 className="font-mono text-lg font-bold text-white">Public Runtime Status</h2>
            <p className="mt-1 text-sm text-gray-400">
              แสดงเฉพาะตัวแปร <code>NEXT_PUBLIC_*</code> ที่ browser อ่านได้จริง ไม่มี secret หรือค่าที่สร้างขึ้นเอง
            </p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PublicConfiguration
            label="Backend API"
            variable="NEXT_PUBLIC_API_URL"
            value={publicApiUrl}
            icon={<Server className="h-5 w-5" />}
          />
          <PublicConfiguration
            label="WebSocket"
            variable="NEXT_PUBLIC_WS_URL"
            value={publicWebSocketUrl}
            icon={<Radio className="h-5 w-5" />}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 text-cyber-blue" />
            <div>
              <h2 className="font-mono text-lg font-bold text-white">PHONE-001 Setup</h2>
              <p className="mt-1 text-sm text-gray-400">ค่าต่อไปนี้เป็น server-only และต้องตรวจบนเครื่อง Device Agent</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {[
              ['ANDROID_DEVICE_SERIAL', 'กำหนดเมื่อ adb พบมากกว่าหนึ่งเครื่อง'],
              ['TARGET_ANDROID_PACKAGE', 'Package name สำหรับ OPEN_APP และ STOP_APP'],
              ['DEVICE_AGENT_TOKEN', 'Token ที่ Agent ใช้ยืนยันตัวตนกับ Backend'],
            ].map(([variable, description]) => (
              <div key={variable} className="rounded border border-gray-700 p-3">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-warning-orange" />
                  <div>
                    <code className="break-all text-sm text-white">{variable}</code>
                    <p className="mt-1 text-xs text-gray-400">{description}</p>
                    <p className="mt-1 text-xs text-gray-600">ไม่แสดงค่าใน browser เพื่อความปลอดภัย</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-status-green" />
            <div>
              <h2 className="font-mono text-lg font-bold text-white">Configuration Rules</h2>
              <p className="mt-1 text-sm text-gray-400">ข้อกำหนดสำหรับ Single Device MVP</p>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex gap-3 text-gray-300">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-green" />
              Device Code สำหรับระยะนี้คือ <code>PHONE-001</code>
            </div>
            <div className="flex gap-3 text-gray-300">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-green" />
              Frontend ส่งคำสั่งผ่าน Backend และ BullMQ เท่านั้น ไม่เรียก ADB โดยตรง
            </div>
            <div className="flex gap-3 text-gray-300">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-orange" />
              สถานะพร้อมใช้งานต้องยืนยันด้วยโทรศัพท์ Android จริงและหลักฐานจาก Acceptance Test
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-start gap-3">
          <BookOpen className="mt-0.5 h-5 w-5 text-cyber-blue" />
          <div>
            <h2 className="font-mono text-lg font-bold text-white">Setup & Verification</h2>
            <p className="mt-1 text-sm text-gray-400">ใช้เอกสารใน repository เป็นแหล่งข้อมูลหลัก</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {[
            ['docs/SINGLE_DEVICE_SETUP.md', 'ติดตั้ง Docker, ADB และ Device Agent'],
            ['docs/SINGLE_DEVICE_TEST_PLAN.md', 'ขั้นตอน TEST-001 ถึง TEST-018'],
            ['docs/SINGLE_DEVICE_RELEASE_CHECKLIST.md', 'รายการตรวจรับก่อนประกาศความพร้อม'],
            ['docs/SINGLE_DEVICE_KNOWN_LIMITATIONS.md', 'ข้อจำกัดที่ยังต้องยืนยันกับอุปกรณ์จริง'],
          ].map(([path, description]) => (
            <div key={path} className="rounded border border-gray-700 p-3">
              <code className="break-all text-sm text-cyber-blue">{path}</code>
              <p className="mt-1 text-xs text-gray-400">{description}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/devices/PHONE-001" className="btn-primary flex items-center gap-2 text-sm">
            <Smartphone className="h-4 w-4" /> เปิด PHONE-001
          </Link>
          <Link href="/notifications" className="btn-outline flex items-center gap-2 text-sm">
            <Radio className="h-4 w-4" /> ตรวจ Notifications
          </Link>
          {apiDocsUrl && (
            <a
              href={apiDocsUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-outline flex items-center gap-2 text-sm"
            >
              <ExternalLink className="h-4 w-4" /> API Documentation
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
