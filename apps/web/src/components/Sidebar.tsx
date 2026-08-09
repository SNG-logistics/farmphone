'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Bot, Smartphone, FileVideo, Users,
  Megaphone, ListTodo, Clock, BarChart3, CreditCard,
  Settings, Bell, FileText, UserCog, Menu, X, LogIn
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devices', label: 'Device Farm', icon: Smartphone },
  { href: '/jobs', label: 'Jobs', icon: ListTodo },
  { href: '/accounts', label: 'Accounts', icon: Users },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/content', label: 'Content', icon: FileVideo },
  { href: '/ai-office', label: 'AI Office', icon: Bot },
  { href: '/scheduler', label: 'Scheduler', icon: Clock },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/notifications', label: 'Alerts', icon: Bell },
  { href: '/logs', label: 'Logs', icon: FileText },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin/users', label: 'Admin', icon: UserCog },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b-2 border-pixel-border bg-navy-800/95 px-4 backdrop-blur md:hidden">
        <Brand compact />
        <button
          type="button"
          className="absolute right-4 top-3 rounded border border-pixel-border bg-navy-700 p-2 text-cyber-blue transition-colors hover:bg-navy-600"
          aria-label={isOpen ? 'ปิดเมนู' : 'เปิดเมนู'}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {isOpen && (
        <button
          type="button"
          aria-label="ปิดเมนู"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col border-r-2 border-pixel-border bg-navy-800 transition-transform duration-200 md:static md:h-full md:w-56 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Logo */}
      <div className="p-4 border-b-2 border-pixel-border">
        <Brand />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 pixel-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t-2 border-pixel-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-status-green animate-pulse" />
            <span className="text-xs font-mono text-gray-400">System Online</span>
          </div>
          <Link
            href="/login"
            className="font-mono text-[11px] font-bold text-cyber-blue hover:underline flex items-center gap-1"
          >
            <LogIn className="h-3 w-3" /> เข้าสู่ระบบ
          </Link>
        </div>
      </div>
      </aside>
    </>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded bg-gradient-to-br from-cyber-blue to-neon-cyan">
        <span className="font-mono text-xs font-bold text-dark-navy">AC</span>
      </div>
      <div>
        <p className="font-mono text-xs font-bold tracking-wider text-cyber-blue">AUTOMATION CONTROL</p>
        {!compact && <p className="font-mono text-[10px] text-gray-500">Android Fleet Control</p>}
      </div>
    </div>
  );
}
