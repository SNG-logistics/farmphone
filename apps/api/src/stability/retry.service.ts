import { Injectable, Logger } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  circuitName?: string;
  retryableErrors?: (error: unknown) => boolean;
}

const DEFAULTS: Required<Omit<RetryOptions, 'circuitName' | 'retryableErrors'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
  jitter: true,
};

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  constructor(private readonly circuitBreaker: CircuitBreakerService) {}

  /**
   * Execute a function with exponential backoff retry.
   * Integrates with the circuit breaker — if a circuitName is provided,
   * the function is wrapped through the circuit breaker and retries stop
   * when the circuit opens.
   */
  async withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
    const opts = { ...DEFAULTS, ...options };
    const isRetryable = opts.retryableErrors ?? this.defaultRetryable;

    let lastError: unknown;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        const result = opts.circuitName
          ? await this.circuitBreaker.execute(opts.circuitName, fn)
          : await fn();
        return result;
      } catch (error) {
        lastError = error;

        // Don't retry if circuit is open
        if ((error as { name?: string }).name === 'CircuitOpenError') {
          this.logger.warn(`[Retry] Circuit "${opts.circuitName}" is open — aborting retries`);
          throw error;
        }

        // Don't retry if error is not retryable
        if (!isRetryable(error)) {
          throw error;
        }

        if (attempt < opts.maxRetries) {
          const delay = this.calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs, opts.jitter);
          this.logger.warn(
            `[Retry] Attempt ${attempt + 1}/${opts.maxRetries} failed${opts.circuitName ? ` (circuit: ${opts.circuitName})` : ''}. ` +
            `Retrying in ${delay}ms... Error: ${error instanceof Error ? error.message : String(error)}`,
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      `[Retry] All ${opts.maxRetries} retries exhausted${opts.circuitName ? ` (circuit: ${opts.circuitName})` : ''}`,
    );
    throw lastError;
  }

  private calculateDelay(attempt: number, baseMs: number, maxMs: number, jitter: boolean): number {
    // Exponential backoff: base * 2^attempt
    const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs);

    if (jitter) {
      // Full jitter: uniform random between 0 and exponential
      return Math.floor(Math.random() * exponential);
    }

    return exponential;
  }

  private defaultRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // Retry on transient errors
      return (
        msg.includes('timeout') ||
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('503') ||
        msg.includes('no available channel') ||
        msg.includes('rate limit') ||
        msg.includes('network') ||
        msg.includes('socket hang up')
      );
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
