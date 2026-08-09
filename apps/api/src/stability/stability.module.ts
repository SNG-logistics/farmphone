import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CircuitBreakerService } from './circuit-breaker.service';
import { RetryService } from './retry.service';
import { RateLimiterGuard } from './rate-limiter.guard';
import { RequestLoggerInterceptor } from './request-logger.interceptor';

@Global()
@Module({
  providers: [
    CircuitBreakerService,
    RetryService,
    RateLimiterGuard,
    RequestLoggerInterceptor,
    {
      provide: APP_GUARD,
      useExisting: RateLimiterGuard,
    },
  ],
  exports: [
    CircuitBreakerService,
    RetryService,
    RateLimiterGuard,
    RequestLoggerInterceptor,
  ],
})
export class StabilityModule {}
