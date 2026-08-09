import { createHmac } from 'crypto';
import { BillingService, StripeWebhookEvent } from '../src/billing/billing.service';

describe('Stripe-compatible billing flows', () => {
  const originalSecret = process.env.STRIPE_SECRET_KEY;
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  const ledger: Array<Record<string, any>> = [];
  const organizations: Array<Record<string, any>> = [];
  const subscriptions: Array<Record<string, any>> = [];
  const plans = [{ id: 'plan-pro', name: 'Pro', monthlyPrice: 99000, includedCredits: 100, isActive: true }];

  const prisma = {
    plan: {
      findMany: jest.fn(async () => plans),
      findUnique: jest.fn(async ({ where }: any) => plans.find((plan) => plan.id === where.id) || null),
    },
    creditLedger: {
      aggregate: jest.fn(async ({ where }: any) => ({
        _sum: { amount: ledger.filter((entry) => entry.organizationId === where.organizationId && entry.type === where.type).reduce((total, entry) => total + entry.amount, 0) },
      })),
      findFirst: jest.fn(async ({ where }: any) => ledger.find((entry) => entry.createdBy === where.createdBy) || null),
      create: jest.fn(async ({ data }: any) => {
        const entry = { id: `ledger-${ledger.length + 1}`, ...data, createdAt: new Date() };
        ledger.push(entry);
        return entry;
      }),
      findMany: jest.fn(async () => ledger),
    },
    organization: {
      update: jest.fn(async ({ where, data }: any) => {
        const organization = { id: where.id, ...data };
        organizations.push(organization);
        return organization;
      }),
    },
    subscription: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const existing = subscriptions.find((subscription) => subscription.organizationId === where.organizationId);
        if (existing) return Object.assign(existing, update);
        subscriptions.push(create);
        return create;
      }),
    },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };

  beforeEach(() => {
    ledger.length = 0;
    organizations.length = 0;
    subscriptions.length = 0;
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalSecret;
    if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
  });

  it('reports disabled integration and rejects checkout safely without a secret', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const service = new BillingService(prisma as any);

    expect(service.getStripeStatus()).toEqual({ checkoutEnabled: false, webhookEnabled: false });
    await expect(service.createCheckoutSession({
      organizationId: 'org-1',
      planId: 'plan-pro',
      successUrl: 'http://localhost:3000/billing/success',
      cancelUrl: 'http://localhost:3000/billing/cancel',
    })).rejects.toThrow('Stripe checkout is not configured');
  });

  it('verifies a Stripe signature and credits a paid invoice once', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_only';
    const service = new BillingService(prisma as any);
    const event: StripeWebhookEvent = {
      id: 'evt_invoice_paid',
      type: 'invoice.paid',
      data: {
        object: {
          status: 'paid',
          current_period_start: 1_700_000_000,
          current_period_end: 1_700_086_400,
          subscription_details: { metadata: { organizationId: 'org-1', planId: 'plan-pro' } },
        },
      },
    };
    const payload = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    expect(service.verifyWebhookSignature(payload, `t=${timestamp},v1=${signature}`)).toBe(true);
    expect(await service.handleWebhookEvent(event)).toMatchObject({ handled: true, duplicate: false });
    expect(await service.handleWebhookEvent(event)).toMatchObject({ handled: true, duplicate: true });
    expect(ledger).toEqual([expect.objectContaining({ amount: 100, createdBy: 'stripe:evt_invoice_paid' })]);
    expect(subscriptions).toEqual([expect.objectContaining({ organizationId: 'org-1', planId: 'plan-pro' })]);
  });

  it('rejects expired and modified webhook signatures', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_only';
    const service = new BillingService(prisma as any);
    const timestamp = Math.floor(Date.now() / 1000) - 301;
    const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
      .update(`${timestamp}.{\"id\":\"evt\"}`)
      .digest('hex');

    expect(service.verifyWebhookSignature('{"id":"evt"}', `t=${timestamp},v1=${signature}`)).toBe(false);
    expect(service.verifyWebhookSignature('{"id":"changed"}', `t=${Math.floor(Date.now() / 1000)},v1=${signature}`)).toBe(false);
  });
});
