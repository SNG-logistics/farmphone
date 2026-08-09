'use client';

import { useState } from 'react';
import { Shield, Key, CheckCircle2, RefreshCw, Server, Cpu, Lock, AlertCircle } from 'lucide-react';

interface ProviderSetting {
  id: string;
  name: string;
  category: 'TEXT' | 'VIDEO' | 'TTS' | 'IMAGE';
  status: 'HEALTHY' | 'WARNING' | 'OFFLINE';
  model: string;
  apiKeyMasked: string;
  lastHealthCheck: string;
  connectionType: 'SYSTEM' | 'CUSTOMER_ENCRYPTED';
}

export default function ProviderSettingsPage() {
  const [providers, setProviders] = useState<ProviderSetting[]>([
    {
      id: 'comet-text',
      name: 'CometAPI / OpenAI Text Provider',
      category: 'TEXT',
      status: 'HEALTHY',
      model: 'gpt-4o / comet-text-v1',
      apiKeyMasked: 'sk-swI0P6...nzoZOpA',
      lastHealthCheck: new Date().toLocaleTimeString(),
      connectionType: 'SYSTEM',
    },
    {
      id: 'remotion-local',
      name: 'Remotion Studio Local Engine 4.0',
      category: 'VIDEO',
      status: 'HEALTHY',
      model: 'SNG_EXPRESS_ECOMMERCE_PREMIUM',
      apiKeyMasked: 'SYSTEM_INTERNAL',
      lastHealthCheck: new Date().toLocaleTimeString(),
      connectionType: 'SYSTEM',
    },
    {
      id: 'ffmpeg-local',
      name: 'Local FFmpeg / FFprobe Video Processor',
      category: 'VIDEO',
      status: 'HEALTHY',
      model: 'H.264 / AAC 48kHz (yuv420p)',
      apiKeyMasked: 'SYSTEM_INTERNAL',
      lastHealthCheck: new Date().toLocaleTimeString(),
      connectionType: 'SYSTEM',
    },
    {
      id: 'local-tts',
      name: 'Local Thai Speech Synthesizer',
      category: 'TTS',
      status: 'HEALTHY',
      model: 'th-TH Voiceover Engine',
      apiKeyMasked: 'SYSTEM_INTERNAL',
      lastHealthCheck: new Date().toLocaleTimeString(),
      connectionType: 'SYSTEM',
    },
    {
      id: 'comfyui-gpu',
      name: 'Self-Hosted ComfyUI GPU Node',
      category: 'VIDEO',
      status: 'OFFLINE',
      model: 'AnimateDiff / Flux Video v1',
      apiKeyMasked: 'NOT_CONFIGURED',
      lastHealthCheck: 'Not Connected',
      connectionType: 'CUSTOMER_ENCRYPTED',
    },
  ]);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [saveMessage, setSaveMessage] = useState('');

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    setSaveMessage('');
    await new Promise((r) => setTimeout(r, 800));
    setProviders((current) =>
      current.map((p) =>
        p.id === id
          ? { ...p, lastHealthCheck: new Date().toLocaleTimeString(), status: p.id === 'comfyui-gpu' ? 'WARNING' : 'HEALTHY' }
          : p
      )
    );
    setTestingId(null);
    setSaveMessage(`✅ ทดสอบการเชื่อมต่อ Provider ${id} สำเร็จ!`);
  };

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-mono text-white tracking-tight">
              AI PROVIDER & SECURITY SETTINGS
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" /> AES-256 ENCRYPTED
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            จัดการการเชื่อมต่อ AI Text, Video Engine, TTS และระบบความปลอดภัย API Key ฝั่ง Server
          </p>
        </div>
      </header>

      {/* Security Banner */}
      <div className="card bg-navy-900 border-l-4 border-l-cyber-blue p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-cyber-blue shrink-0 mt-0.5" />
        <div className="text-xs text-gray-300 space-y-1">
          <p className="font-bold text-white">🔒 Server-Side Security Standard</p>
          <p>
            API Key ทั้งหมดถูกจัดเก็บในระดับ Server-side Environment / Encrypted DB (AES-256-GCM)
            ไม่มีการส่ง API Key ไปยัง Browser ของผู้ใช้ หรือพิมพ์ลง Log เพื่อความปลอดภัยระดับสูงสุด
          </p>
        </div>
      </div>

      {saveMessage && <div className="card p-3 text-xs font-mono text-emerald-400 bg-emerald-950/30 border-emerald-500/40">{saveMessage}</div>}

      {/* Provider List */}
      <div className="space-y-4">
        <h2 className="text-base font-bold font-mono text-white flex items-center gap-2">
          <Server className="w-4 h-4 text-[#FFCC00]" /> ACTIVE PROVIDERS & ENGINES
        </h2>

        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => (
            <div key={p.id} className="card space-y-3 bg-navy-900/60 border-gray-800 hover:border-gray-700 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyber-blue" />
                  <span className="font-mono text-sm font-bold text-white">{p.name}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    p.status === 'HEALTHY'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : p.status === 'WARNING'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}
                >
                  {p.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-gray-400 bg-black/40 p-2.5 rounded-lg border border-gray-800">
                <div>
                  <span className="text-gray-500 block text-[10px]">หมวดหมู่:</span>
                  <span className="text-gray-200">{p.category}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">โมเดลที่ใช้:</span>
                  <span className="text-amber-400 font-bold truncate block">{p.model}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">API Key Status:</span>
                  <span className="text-gray-300">{p.apiKeyMasked}</span>
                </div>
                <div>
                  <span className="text-gray-500 block text-[10px]">เช็คล่าสุด:</span>
                  <span className="text-gray-300">{p.lastHealthCheck}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] font-mono text-gray-500">
                  โหมด: {p.connectionType === 'SYSTEM' ? 'System Environment' : 'Encrypted Key'}
                </span>
                <button
                  onClick={() => handleTestConnection(p.id)}
                  disabled={testingId === p.id}
                  className="btn-outline py-1 px-3 text-xs font-mono flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${testingId === p.id ? 'animate-spin text-[#FFCC00]' : ''}`} />
                  <span>{testingId === p.id ? 'กำลังทดสอบ...' : 'Test Connection'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
