import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';

export const metadata: Metadata = {
  title: 'Automation Control — Android Fleet Management',
  description: 'Automation Control — ระบบควบคุมโทรศัพท์ Android แบบ Fleet | Autonomous Multi-Device Control Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <div className="flex min-h-dvh bg-dark-navy md:h-dvh md:overflow-hidden">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-x-hidden md:overflow-y-auto md:pixel-scrollbar">
            <div className="p-4 pt-20 sm:p-5 sm:pt-20 md:p-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
