import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BillingService, StripeWebhookEvent } from './billing.service';

type AuthenticatedRequest = Request & { user?: { id?: string; sub?: string; organizationId?: string }; rawBody?: Buffer };

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('VIEWER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all available plans' })
  findAllPlans() {
    return this.billingService.findAllPlans();
  }

  @Get('stripe/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get safe Stripe integration status' })
  getStripeStatus() {
    return this.billingService.getStripeStatus();
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Stripe Checkout session for a plan' })
  createCheckout(
    @Req() req: AuthenticatedRequest,
    @Body() body: { planId: string; successUrl: string; cancelUrl: string; idempotencyKey?: string },
  ) {
    return this.billingService.createCheckoutSession({
      organizationId: this.organizationId(req),
      ...body,
    });
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive a signed Stripe webhook' })
  async receiveWebhook(
    @Req() req: AuthenticatedRequest,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const payload = req.rawBody || JSON.stringify(req.body);
    if (!this.billingService.verifyWebhookSignature(payload, signature)) {
      throw new BadRequestException('Invalid Stripe signature');
    }
    return this.billingService.handleWebhookEvent(req.body as StripeWebhookEvent);
  }

  @Get('credits')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current organization credits balance' })
  getCredits(@Req() req: AuthenticatedRequest) {
    return this.billingService.getCredits(this.organizationId(req));
  }

  @Post('credits/add')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add credits to current organization' })
  addCredits(@Req() req: AuthenticatedRequest, @Body() body: { amount: number; description?: string }) {
    return this.billingService.addCredits(this.organizationId(req), body.amount, body.description, req.user?.id || req.user?.sub);
  }

  @Get('ledger')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current organization credit ledger' })
  getLedger(@Req() req: AuthenticatedRequest) {
    return this.billingService.getLedger(this.organizationId(req));
  }

  private organizationId(req: AuthenticatedRequest) {
    if (!req.user?.organizationId) throw new Error('Authenticated organization is required');
    return req.user.organizationId;
  }
}
