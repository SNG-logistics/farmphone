'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, RefreshCw, Wallet } from 'lucide-react';

type Plan = { id: string; name: string; monthlyPrice: number; includedCredits: number; maxDevices: number; maxAccounts: number; features: string[]; isActive: boolean };
type Credits = { balance: number; totalAdded: number; totalUsed: number };
type Ledger = { id: string; type: string; amount: number; description: string; balanceAfter: number; createdAt: string };
type StripeStatus = { checkoutEnabled: boolean; webhookEnabled: boolean };

const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';

export default function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [stripe, setStripe] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState('');
  const [error, setError] = useState('');

  const headers = useCallback(() => {
    const token = window.localStorage.getItem('accessToken') || window.localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requestHeaders = headers();
      const responses = await Promise.all([
        fetch(`${apiUrl}/api/v1/billing/plans`, { cache: 'no-store', headers: requestHeaders }),
        fetch(`${apiUrl}/api/v1/billing/credits`, { cache: 'no-store', headers: requestHeaders }),
        fetch(`${apiUrl}/api/v1/billing/ledger`, { cache: 'no-store', headers: requestHeaders }),
        fetch(`${apiUrl}/api/v1/billing/stripe/status`, { cache: 'no-store', headers: requestHeaders }),
      ]);
      const bodies = await Promise.all(responses.map((response) => response.json()));
      const failed = responses.findIndex((response) => !response.ok);
      if (failed >= 0) throw new Error(bodies[failed]?.message || `Billing API failed (${responses[failed].status})`);
      setPlans(Array.isArray(bodies[0]) ? bodies[0] : bodies[0]?.data || []);
      setCredits(bodies[1]?.data || bodies[1]);
      setLedger(Array.isArray(bodies[2]) ? bodies[2] : bodies[2]?.data || []);
      setStripe(bodies[3]?.data || bodies[3]);
    } catch (requestError) {
      setPlans([]); setCredits(null); setLedger([]); setStripe(null);
      setError(requestError instanceof Error ? requestError.message : 'เชื่อมต่อ Billing API ไม่สำเร็จ');
    } finally { setLoading(false); }
  }, [headers]);

  useEffect(() => { void load(); }, [load]);

  async function checkout(planId: string) {
    if (!stripe?.checkoutEnabled || checkoutPlan) return;
    setCheckoutPlan(planId); setError('');
    try {
      const response = await fetch(`${apiUrl}/api/v1/billing/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(headers() || {}) },
        body: JSON.stringify({
          planId,
          successUrl: `${window.location.origin}/billing?checkout=success`,
          cancelUrl: `${window.location.origin}/billing?checkout=cancelled`,
          idempotencyKey: `checkout:${planId}:${Date.now()}`,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'สร้าง Stripe Checkout ไม่สำเร็จ');
      const url = body.url || body.data?.url;
      if (!url) throw new Error('Stripe ไม่ได้ส่ง Checkout URL');
      window.location.assign(url);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Checkout ไม่สำเร็จ');
      setCheckoutPlan('');
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="flex items-center gap-2 font-mono text-2xl font-bold text-white"><CreditCard className="h-6 w-6 text-cyber-blue" />BILLING</h1><p className="mt-1 text-sm text-gray-400">ข้อมูลเครดิต แผน และ Stripe จาก Backend จริง</p></div>
        <button className="btn-outline flex items-center gap-2" disabled={loading} onClick={() => void load()}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />รีเฟรช</button>
      </header>
      {error && <div className="card border-error-red bg-error-red/10 text-sm text-error-red">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-3">
        <Metric label="คงเหลือ" value={credits?.balance} icon={<Wallet className="h-5 w-5" />} />
        <Metric label="เพิ่มทั้งหมด" value={credits?.totalAdded} icon={<CheckCircle2 className="h-5 w-5" />} />
        <Metric label="ใช้ทั้งหมด" value={credits?.totalUsed} icon={<CreditCard className="h-5 w-5" />} />
      </section>

      <section><h2 className="mb-4 font-mono text-lg font-bold text-cyber-blue">SUBSCRIPTION PLANS</h2><div className="grid gap-4 md:grid-cols-3">{plans.filter((plan) => plan.isActive).map((plan) => <article key={plan.id} className="card"><h3 className="font-mono text-lg font-bold text-white">{plan.name}</h3><p className="mt-3 font-mono text-3xl font-bold text-cyber-blue">฿{(plan.monthlyPrice / 100).toLocaleString()}<span className="text-sm text-gray-500">/เดือน</span></p><p className="mt-2 text-sm text-gray-400">{plan.includedCredits.toLocaleString()} credits · {plan.maxDevices} devices · {plan.maxAccounts} accounts</p><ul className="my-5 space-y-2 text-sm text-gray-300">{plan.features.map((feature) => <li key={feature}><CheckCircle2 className="mr-2 inline h-4 w-4 text-status-green" />{feature}</li>)}</ul><button className="btn-primary w-full disabled:opacity-50" disabled={!stripe?.checkoutEnabled || Boolean(checkoutPlan)} onClick={() => void checkout(plan.id)}>{checkoutPlan === plan.id ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : stripe?.checkoutEnabled ? 'เปิด Stripe Checkout' : 'Stripe ยังไม่พร้อม'}</button></article>)}</div>{!loading && !plans.length && <div className="card py-10 text-center text-gray-500">ยังไม่มี Plan ในฐานข้อมูล</div>}</section>

      <section className="card p-0"><div className="border-b border-pixel-border p-4"><h2 className="font-mono font-bold text-cyber-blue">CREDIT LEDGER</h2></div><div className="divide-y divide-pixel-border">{ledger.map((entry) => <article key={entry.id} className="grid gap-2 p-4 sm:grid-cols-[150px_1fr_120px_120px]"><time className="font-mono text-xs text-gray-500">{new Date(entry.createdAt).toLocaleString()}</time><div><p className="text-sm text-white">{entry.description}</p><p className="text-xs text-gray-500">{entry.type}</p></div><span className={`font-mono text-sm ${entry.amount >= 0 ? 'text-status-green' : 'text-error-red'}`}>{entry.amount >= 0 ? '+' : ''}{entry.amount.toLocaleString()}</span><span className="font-mono text-sm text-gray-300">{entry.balanceAfter.toLocaleString()}</span></article>)}</div>{!loading && !ledger.length && <p className="py-10 text-center text-sm text-gray-500">ยังไม่มีรายการเครดิตจริง</p>}</section>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value?: number; icon: React.ReactNode }) {
  return <div className="card"><div className="flex items-center gap-2 text-cyber-blue">{icon}<span className="font-mono text-xs">{label}</span></div><p className="mt-3 font-mono text-3xl font-bold text-white">{value === undefined ? '—' : value.toLocaleString()}</p></div>;
}
