import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const RATE_LIMIT_KEY = 'RATE_LIMIT';

/**
 * Decorator to set rate limit on a controller or method.
 * @param limit Max requests allowed in the window
 * @param windowMs Time window in milliseconds (default 60_000 = 1 minute)
 */
export const RateLimit = (limit: number, windowMs = 60_000) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs });

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

@Injectable()
export class RateLimiterGuard implements CanActivate {
  private readonly logger = new Logger(RateLimiterGuard.name);
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.reflector.getAllAndOverride<{ limit: number; windowMs: number } | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No rate limit configured — allow
    if (!config) return true;

    const request = context.switchToHttp().getRequest();
    const key = this.buildKey(request, context);

    const bucket = this.getOrCreateBucket(key, config.limit);
    this.refillBucket(bucket, config.limit, config.windowMs);

    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }

    const retryAfterSec = Math.ceil(config.windowMs / 1000);
    const response = context.switchToHttp().getResponse();
    response.setHeader('Retry-After', String(retryAfterSec));
    response.setHeader('X-RateLimit-Limit', String(config.limit));
    response.setHeader('X-RateLimit-Remaining', '0');

    this.logger.warn(`🚦 Rate limit exceeded for key="${key}" (${config.limit} req/${config.windowMs}ms)`);

    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: `Rate limit exceeded. Try again in ${retryAfterSec}s.`,
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private buildKey(request: { ip?: string; url?: string }, context: ExecutionContext): string {
    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const ip = request.ip || 'unknown';
    return `${ip}:${controller}:${handler}`;
  }

  private getOrCreateBucket(key: string, limit: number): TokenBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: limit, lastRefill: Date.now() };
      this.buckets.set(key, bucket);

      // Prevent memory leak: clean up old buckets every 5 minutes
      if (this.buckets.size > 10_000) {
        const cutoff = Date.now() - 300_000;
        for (const [k, b] of this.buckets) {
          if (b.lastRefill < cutoff) this.buckets.delete(k);
        }
      }
    }
    return bucket;
  }

  private refillBucket(bucket: TokenBucket, limit: number, windowMs: number): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;

    if (elapsed >= windowMs) {
      // Full refill
      bucket.tokens = limit;
      bucket.lastRefill = now;
    } else {
      // Partial refill: proportional to elapsed time
      const refillRate = limit / windowMs;
      const tokensToAdd = Math.floor(elapsed * refillRate);
      if (tokensToAdd > 0) {
        bucket.tokens = Math.min(limit, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
      }
    }
  }

  /** Get current rate limit stats for monitoring */
  getStats(): { totalBuckets: number; buckets: Record<string, { tokens: number }> } {
    const bucketStats: Record<string, { tokens: number }> = {};
    for (const [key, bucket] of this.buckets) {
      bucketStats[key] = { tokens: bucket.tokens };
    }
    return { totalBuckets: this.buckets.size, buckets: bucketStats };
  }
}
