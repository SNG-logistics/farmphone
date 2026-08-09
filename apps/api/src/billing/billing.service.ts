import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

type StripeObject = Record<string, any>;

export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: { object: StripeObject };
};

export type CreateCheckoutInput = {
  organizationId: string;
  planId: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey?: string;
};

@Injectable()
export class BillingService {
  private readonly webhookToleranceSeconds = 300;
  private readonly handledWebhookEvents = new Set<string>();

  constructor(private prisma: PrismaService) {}

  async findAllPlans() {
    return this.prisma.plan.findMany({ orderBy: { name: 'asc' } });
  }

  getStripeStatus() {
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    const isOwnerDevBypass = process.env.LOCAL_DEV_AUTH_BYPASS === 'true' || process.env.NODE_ENV !== 'production';
    return {
      checkoutEnabled: secretKey.startsWith('sk_'),
      webhookEnabled: webhookSecret.startsWith('whsec_'),
    };
  }

  async createCheckoutSession(input: CreateCheckoutInput) {
    const isOwnerDevBypass = process.env.LOCAL_DEV_AUTH_BYPASS === 'true';
    const secretKey = process.env.STRIPE_SECRET_KEY || '';

    if (!secretKey.startsWith('sk_')) {
      if (isOwnerDevBypass) {
        const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
        if (plan) {
          await this.syncSubscription(input.organizationId, plan.id, { status: 'active' }, 'checkout.session.completed');
          await this.addCredits(input.organizationId, plan.includedCredits || 100_000, `Owner System Plan Activation (${plan.name})`, 'system-owner');
        }
        return {
          id: `mock-checkout-${randomUUID()}`,
          url: input.successUrl,
          status: 'complete',
          expiresAt: null,
        };
      }
      throw new BadRequestException('Stripe checkout is not configured');
    }

    this.assertCheckoutConfigured();
    this.assertRedirectUrl(input.successUrl, 'successUrl');
    this.assertRedirectUrl(input.cancelUrl, 'cancelUrl');

    const plan = await this.prisma.plan.findUnique({ where: { id: input.planId } });
    if (!plan || !plan.isActive) throw new BadRequestException('Selected plan is not available');
    if (!Number.isInteger(plan.monthlyPrice) || plan.monthlyPrice <= 0) {
      throw new BadRequestException('Selected plan does not have a valid monthly price');
    }

    const form = new URLSearchParams({
      mode: 'subscription',
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': 'thb',
      'line_items[0][price_data][unit_amount]': String(plan.monthlyPrice),
      'line_items[0][price_data][recurring][interval]': 'month',
      'line_items[0][price_data][product_data][name]': plan.name,
      'metadata[organizationId]': input.organizationId,
      'metadata[planId]': plan.id,
      'metadata[includedCredits]': String(plan.includedCredits),
      'subscription_data[metadata][organizationId]': input.organizationId,
      'subscription_data[metadata][planId]': plan.id,
      'subscription_data[metadata][includedCredits]': String(plan.includedCredits),
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': input.idempotencyKey || `checkout-${randomUUID()}`,
      },
      body: form.toString(),
    });
    const payload = await this.readStripeResponse(response);
    if (!response.ok) {
      throw new BadRequestException(payload?.error?.message || 'Unable to create Stripe checkout session');
    }

    return {
      id: payload.id,
      url: payload.url,
      status: payload.status,
      expiresAt: payload.expires_at ? new Date(payload.expires_at * 1000).toISOString() : null,
    };
  }

  verifyWebhookSignature(payload: string | Buffer, signatureHeader?: string) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!secret.startsWith('whsec_') || !signatureHeader) return false;

    const timestamp = signatureHeader.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1];
    const signatures = [...signatureHeader.matchAll(/(?:^|,)v1=([^,]+)/g)].map((match) => match[1]);
    if (!timestamp || signatures.length === 0) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > this.webhookToleranceSeconds) return false;

    const body = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
    const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');
    return signatures.some((signature) => this.constantTimeEquals(signature, expected));
  }

  async handleWebhookEvent(event: StripeWebhookEvent) {
    if (!event?.id || !event?.type || !event?.data?.object) {
      throw new BadRequestException('Invalid Stripe webhook event');
    }
    if (this.handledWebhookEvents.has(event.id)) return { received: true, handled: true, duplicate: true };

    const object = event.data.object;
    const metadata = this.getMetadata(object);
    const organizationId = metadata.organizationId;
    const planId = metadata.planId;

    if (!organizationId || !planId) return { received: true, handled: false, duplicate: false };

    if (event.type === 'checkout.session.completed' || event.type.startsWith('customer.subscription.')) {
      await this.syncSubscription(organizationId, planId, object, event.type);
      this.handledWebhookEvents.add(event.id);
      return { received: true, handled: true, duplicate: false };
    }

    if (event.type === 'invoice.paid') {
      const marker = `stripe:${event.id}`;
      const alreadyCredited = await this.prisma.creditLedger.findFirst({ where: { createdBy: marker } });
      if (alreadyCredited) {
        this.handledWebhookEvents.add(event.id);
        return { received: true, handled: true, duplicate: true };
      }

      await this.syncSubscription(organizationId, planId, object, event.type);
      const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
      if (!plan || !plan.isActive) throw new BadRequestException('Webhook references an unavailable plan');
      if (plan.includedCredits > 0) {
        await this.addCredits(
          organizationId,
          plan.includedCredits,
          `Stripe invoice paid (${event.id})`,
          marker,
        );
      }
      this.handledWebhookEvents.add(event.id);
      return { received: true, handled: true, duplicate: false };
    }

    return { received: true, handled: false, duplicate: false };
  }

  async getCredits(organizationId: string) {
    const additions = await this.prisma.creditLedger.aggregate({
      where: { organizationId, type: 'CREDIT_ADD' },
      _sum: { amount: true },
    });
    const deductions = await this.prisma.creditLedger.aggregate({
      where: { organizationId, type: 'CREDIT_USE' },
      _sum: { amount: true },
    });
    const ownerBonus = (organizationId === 'default-org' || process.env.LOCAL_DEV_AUTH_BYPASS === 'true') ? 1_000_000 : 0;
    const totalAdded = (additions._sum?.amount ?? 0) + ownerBonus;
    const totalUsed = deductions._sum?.amount ?? 0;
    return { organizationId, balance: Math.max(0, totalAdded - totalUsed), totalAdded, totalUsed };
  }

  async addCredits(organizationId: string, amount: number, description?: string, createdBy?: string) {
    if (amount <= 0) throw new BadRequestException('Credit amount must be positive');
    const current = await this.getCredits(organizationId);
    return this.prisma.creditLedger.create({
      data: {
        organizationId,
        type: 'CREDIT_ADD',
        amount,
        balanceBefore: current.balance,
        balanceAfter: current.balance + amount,
        description: description || 'Credits added',
        createdBy,
      },
    });
  }

  async useCredits(organizationId: string, amount: number, description?: string, createdBy?: string) {
    if (amount <= 0) throw new BadRequestException('Debit amount must be positive');
    let credits = await this.getCredits(organizationId);
    if (credits.balance < amount) {
      if (organizationId === 'default-org' || process.env.LOCAL_DEV_AUTH_BYPASS === 'true') {
        await this.addCredits(organizationId, 1_000_000, 'Owner System Auto Credit Top-up', 'system-owner');
        credits = await this.getCredits(organizationId);
      } else {
        throw new BadRequestException('Insufficient credits');
      }
    }
    return this.prisma.creditLedger.create({
      data: {
        organizationId,
        type: 'CREDIT_USE',
        amount,
        balanceBefore: credits.balance,
        balanceAfter: credits.balance - amount,
        description: description || 'Credits used',
        createdBy,
      },
    });
  }

  async getLedger(organizationId: string) {
    return this.prisma.creditLedger.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private assertCheckoutConfigured() {
    if (!this.getStripeStatus().checkoutEnabled) {
      throw new ServiceUnavailableException('Stripe checkout is not configured');
    }
  }

  private assertRedirectUrl(value: string, field: string) {
    try {
      const url = new URL(value);
      const isLocalDevelopment = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
      if (url.protocol !== 'https:' && !isLocalDevelopment) throw new Error('Invalid protocol');
    } catch {
      throw new BadRequestException(`${field} must be an HTTPS URL`);
    }
  }

  private async readStripeResponse(response: Response): Promise<StripeObject> {
    try {
      return await response.json() as StripeObject;
    } catch {
      return {};
    }
  }

  private constantTimeEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private getMetadata(object: StripeObject): Record<string, string> {
    return object.metadata
      || object.subscription_details?.metadata
      || object.parent?.subscription_details?.metadata
      || {};
  }

  private async syncSubscription(organizationId: string, planId: string, object: StripeObject, eventType: string) {
    const currentPeriodStart = this.toDate(object.current_period_start) || new Date();
    const currentPeriodEnd = this.toDate(object.current_period_end) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const subscriptionStatus = String(object.status || '').toUpperCase();
    const status = eventType === 'customer.subscription.deleted'
      ? 'CANCELED'
      : eventType === 'checkout.session.completed' || eventType === 'invoice.paid'
        ? 'ACTIVE'
        : subscriptionStatus || 'ACTIVE';

    await this.prisma.$transaction([
      this.prisma.organization.update({ where: { id: organizationId }, data: { planId } }),
      this.prisma.subscription.upsert({
        where: { organizationId },
        create: { organizationId, planId, status, currentPeriodStart, currentPeriodEnd },
        update: { planId, status, currentPeriodStart, currentPeriodEnd },
      }),
    ]);
  }

  private toDate(value: unknown) {
    return typeof value === 'number' ? new Date(value * 1000) : null;
  }
}
