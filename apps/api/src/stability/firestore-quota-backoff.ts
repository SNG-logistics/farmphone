export interface FirestoreQuotaErrorLike {
  code?: unknown;
  details?: unknown;
  message?: unknown;
}

export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as FirestoreQuotaErrorLike;
  if (candidate.code === 8 || candidate.code === '8' || candidate.code === 'RESOURCE_EXHAUSTED') return true;
  const description = `${String(candidate.details || '')} ${String(candidate.message || '')}`;
  return /RESOURCE_EXHAUSTED|quota exceeded/i.test(description);
}

// Prevent quota failures in periodic workers from turning into retry storms.
export class FirestoreQuotaBackoff {
  private consecutiveFailures = 0;
  private blockedUntil = 0;

  constructor(
    private readonly baseDelayMs = 15 * 60_000,
    private readonly maxDelayMs = 60 * 60_000,
  ) {}

  canAttempt(now = Date.now()): boolean {
    return now >= this.blockedUntil;
  }

  retryAfterMs(now = Date.now()): number {
    return Math.max(0, this.blockedUntil - now);
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.blockedUntil = 0;
  }

  recordFailure(error: unknown, now = Date.now()): number | null {
    if (!isFirestoreQuotaError(error)) return null;
    this.consecutiveFailures += 1;
    const exponent = Math.min(this.consecutiveFailures - 1, 10);
    const delayMs = Math.min(this.maxDelayMs, this.baseDelayMs * (2 ** exponent));
    this.blockedUntil = now + delayMs;
    return delayMs;
  }
}

export function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
