'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Lock,
  Mail,
  Monitor,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Video,
  Zap,
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@automationcontrol.com');
  const [password, setPassword] = useState('••••••••••••');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulating secure authentication
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('token', 'demo-automation-token');
      }
      router.push('/devices');
    }, 600);
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-dark-navy p-4 font-sans text-gray-100 sm:p-6 lg:p-8">
      {/* Dynamic Ambient Background Glow & Grid */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-navy-700/40 via-dark-navy to-dark-navy" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1e3a5f15_1px,transparent_1px),linear-gradient(to_bottom,#1e3a5f15_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      
      {/* Top Ticker Marquee */}
      <div className="absolute top-0 inset-x-0 z-10 overflow-hidden border-b border-pixel-border/50 bg-dark-navy/80 py-2 backdrop-blur-md">
        <div className="flex animate-pulse items-center justify-center gap-6 font-mono text-xs text-cyber-blue">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-green animate-ping" /> ระบบพร้อมให้บริการ 100%</span>
          <span className="hidden sm:inline">✦ สั่งงานฟาร์มมือถือ Real-Time</span>
          <span className="hidden md:inline">✦ AI สร้างวิดีโอไวรัลอัตโนมัติ</span>
          <span className="hidden lg:inline">✦ Firebase Cloud Security Active</span>
        </div>
      </div>

      {/* Main Login Glassmorphic Container */}
      <main className="relative z-20 my-10 flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-pixel-border bg-navy-800/80 shadow-2xl backdrop-blur-2xl lg:flex-row">
        
        {/* LEFT PANEL: System Highlights & Advantages (จุดดีของระบบ) */}
        <section className="flex flex-1 flex-col justify-between border-b border-pixel-border/60 bg-gradient-to-br from-navy-900/90 via-navy-800/70 to-dark-navy/90 p-6 sm:p-8 lg:border-b-0 lg:border-r lg:p-10">
          <div>
            {/* Logo & Brand Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyber-blue to-neon-cyan shadow-glow">
                <Monitor className="h-6 w-6 text-dark-navy" />
              </div>
              <div>
                <h1 className="font-mono text-xl font-bold tracking-wider text-white">AUTOMATION CONTROL</h1>
                <p className="font-mono text-xs text-cyber-blue">ระบบควบคุมโทรศัพท์ Android แบบ Fleet อัจฉริยะ</p>
              </div>
            </div>

            {/* Main Headline */}
            <div className="mt-8 space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyber-blue/30 bg-cyber-blue/10 px-3 py-1 font-mono text-xs font-bold text-cyber-blue">
                <Sparkles className="h-3.5 w-3.5" /> ระบบควบคุมมือถือเจเนอเรชันใหม่
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight text-white">
                ควบคุมทุกการทำงานของฟาร์มมือถือ <br className="hidden sm:inline" />
                <span className="bg-gradient-to-r from-cyber-blue via-neon-cyan to-status-green bg-clip-text text-transparent">
                  ง่ายขึ้น รวดเร็วขึ้น และทรงพลังกว่าที่เคย
                </span>
              </h2>
              <p className="text-sm leading-relaxed text-gray-300">
                ยกระดับการทำงานด้วยระบบอัตโนมัติเต็มรูปแบบ เชื่อมต่อมือถือ Android หลายเครื่องพร้อมกัน สั่งงาน ทำการตลาด และบริหารจัดการได้จากหน้าจอเดียว
              </p>
            </div>

            {/* 4 Core Key Advantages (จุดดีของระบบ) */}
            <div className="mt-8 space-y-4">
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-cyber-blue">จุดเด่นสำคัญของระบบ:</h3>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Feature 1 */}
                <div className="rounded-2xl border border-pixel-border/80 bg-navy-700/50 p-3.5 transition-all hover:border-cyber-blue/50 hover:bg-navy-700/80">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyber-blue/15 text-cyber-blue">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <h4 className="font-mono text-xs font-bold text-white">ดูหน้าจอสด & สัมผัสระยะไกล</h4>
                  </div>
                  <p className="mt-2 text-xs leading-normal text-gray-400">
                    Live Screen Mirroring ดูหน้าจอมือถือสดๆ กด Tap, Swipe และพิมพ์ข้อความเข้ามือถือได้ทันที
                  </p>
                </div>

                {/* Feature 2 */}
                <div className="rounded-2xl border border-pixel-border/80 bg-navy-700/50 p-3.5 transition-all hover:border-cyber-blue/50 hover:bg-navy-700/80">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
                      <Bot className="h-4 w-4" />
                    </div>
                    <h4 className="font-mono text-xs font-bold text-white">ทีมงาน AI อัจฉริยะ 24 ชม.</h4>
                  </div>
                  <p className="mt-2 text-xs leading-normal text-gray-400">
                    มี MVP AI Agents ช่วยคิดคอนเทนต์ วางแผนการโพสต์ตามช่วงเวลาทองคำ 3 ช่วงเวลาประจำวัน
                  </p>
                </div>

                {/* Feature 3 */}
                <div className="rounded-2xl border border-pixel-border/80 bg-navy-700/50 p-3.5 transition-all hover:border-cyber-blue/50 hover:bg-navy-700/80">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                      <Video className="h-4 w-4" />
                    </div>
                    <h4 className="font-mono text-xs font-bold text-white">เรนเดอร์สคริปต์วิดีโอไวรัล</h4>
                  </div>
                  <p className="mt-2 text-xs leading-normal text-gray-400">
                    แปลงภาษาพูดเป็นสคริปต์วิดีโอ 3 ท่อน (Hook 0-3s หยุดดู 100%) พร้อมเรนเดอร์ลง TikTok
                  </p>
                </div>

                {/* Feature 4 */}
                <div className="rounded-2xl border border-pixel-border/80 bg-navy-700/50 p-3.5 transition-all hover:border-cyber-blue/50 hover:bg-navy-700/80">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-status-green/15 text-status-green">
                      <Zap className="h-4 w-4" />
                    </div>
                    <h4 className="font-mono text-xs font-bold text-white">Firebase Cloud Security</h4>
                  </div>
                  <p className="mt-2 text-xs leading-normal text-gray-400">
                    ประมวลผลเร็ว ปลอดภัยด้วย Firebase Cloud Sync ไม่ต้องพึ่งพาเซิร์ฟเวอร์หนัก รองรับงานต่อเนื่อง
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* System Trust Badges */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-pixel-border/60 pt-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5 font-mono"><CheckCircle2 className="h-4 w-4 text-status-green" /> อัปเดตล่าสุด v2.0</span>
            <span className="flex items-center gap-1.5 font-mono"><ShieldCheck className="h-4 w-4 text-cyber-blue" /> ระบบความปลอดภัยระดับองค์กร</span>
          </div>
        </section>

        {/* RIGHT PANEL: Interactive Login Form (ส่วนเข้าสู่ระบบ) */}
        <section className="flex flex-1 flex-col justify-center bg-navy-800 p-6 sm:p-8 lg:p-10">
          <div className="mx-auto w-full max-w-sm">
            
            {/* Header */}
            <div className="space-y-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-cyber-blue">เข้าสู่ระบบเข้าใช้งาน</span>
              <h3 className="text-2xl font-bold text-white">เข้าสู่ระบบ Automation Control</h3>
              <p className="text-xs text-gray-400">กรอกข้อมูลบัญชีเพื่อเข้าสู่ศูนย์ควบคุมฟาร์มมือถือ</p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              
              {/* Email Input */}
              <div className="space-y-1.5">
                <label className="block font-mono text-xs font-bold text-gray-300">อีเมล / ชื่อบัญชีผู้ใช้งาน:</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field !pl-10 !bg-navy-700 !border-pixel-border !text-white focus:!border-cyber-blue"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block font-mono text-xs font-bold text-gray-300">รหัสผ่านบัญชี:</label>
                  <a href="#forgot" className="font-mono text-xs text-cyber-blue hover:underline">ลืมรหัสผ่าน?</a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field !pl-10 !bg-navy-700 !border-pixel-border !text-white focus:!border-cyber-blue"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              {/* Remember Me */}
              <div className="flex items-center justify-between py-1">
                <label className="flex items-center gap-2 font-mono text-xs text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-pixel-border bg-navy-700 text-cyber-blue focus:ring-cyber-blue"
                  />
                  จดจำการเข้าสู่ระบบ
                </label>
                <span className="font-mono text-[10px] text-status-green flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-status-green animate-pulse" /> เซิร์ฟเวอร์ออนไลน์
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm font-bold shadow-lg shadow-cyber-blue/20 transition-all hover:shadow-cyber-blue/40 active:scale-[0.99]"
              >
                {loading ? (
                  <>
                    <Activity className="h-4 w-4 animate-spin" />
                    <span>กำลังเข้าสู่ระบบ...</span>
                  </>
                ) : (
                  <>
                    <span>เข้าสู่ระบบควบคุม</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative my-4 text-center">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-pixel-border" /></div>
                <span className="relative bg-navy-800 px-3 font-mono text-[10px] uppercase text-gray-400">หรือเข้าใช้งานด้วย</span>
              </div>

              {/* Google Button */}
              <button
                type="button"
                onClick={handleLogin}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-pixel-border bg-navy-700/80 py-2.5 font-mono text-xs text-gray-200 transition-colors hover:border-gray-500 hover:bg-navy-700"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>เข้าสู่ระบบด้วย Google</span>
              </button>
            </form>

            {/* Security Guarantee Card */}
            <div className="mt-6 rounded-xl border border-pixel-border/80 bg-navy-700/40 p-3 text-center font-mono text-[11px] text-gray-400">
              <span className="text-status-green font-bold">🛡️ Firebase Secure Access</span> — ระบบรักษาความปลอดภัยข้อมูลด้วยการถอดรหัสระดับองค์กร 256-bit
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-20 font-mono text-xs text-gray-500 text-center">
        © 2026 AUTOMATION CONTROL. สงวนลิขสิทธิ์ทุกประการ. ระบบควบคุมโทรศัพท์ Android อัตโนมัติ
      </footer>
    </div>
  );
}
