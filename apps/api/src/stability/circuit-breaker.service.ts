import { Injectable, Logger } from '@nestjs/common';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  halfOpenMaxProbes?: number;
}

interface CircuitRecord {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: number;
  openedAt: number;
  totalTrips: number;
  options: Required<CircuitBreakerOptions>;
}

const DEFAULTS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  halfOpenMaxProbes: 1,
};

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitRecord>();

  /** Register or get a named circuit */
  private getOrCreate(name: string, opts?: CircuitBreakerOptions): CircuitRecord {
    let circuit = this.circuits.get(name);
    if (!circuit) {
      circuit = {
        state: 'CLOSED',
        failures: 0,
        successes: 0,
        lastFailureAt: 0,
        openedAt: 0,
        totalTrips: 0,
        options: { ...DEFAULTS, ...opts },
      };
      this.circuits.set(name, circuit);
    }
    return circuit;
  }

  /** Check if the circuit allows a request through */
  isAllowed(name: string, opts?: CircuitBreakerOptions): boolean {
    const circuit = this.getOrCreate(name, opts);

    if (circuit.state === 'CLOSED') return true;

    if (circuit.state === 'OPEN') {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed >= circuit.options.cooldownMs) {
        circuit.state = 'HALF_OPEN';
        circuit.successes = 0;
        this.logger.log(`⚡ Circuit "${name}" transitioned OPEN → HALF_OPEN after ${(elapsed / 1000).toFixed(1)}s cooldown`);
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow limited probe requests
    return circuit.successes < circuit.options.halfOpenMaxProbes;
  }

  /** Record a successful call */
  recordSuccess(name: string): void {
    const circuit = this.circuits.get(name);
    if (!circuit) return;

    if (circuit.state === 'HALF_OPEN') {
      circuit.successes++;
      if (circuit.successes >= circuit.options.halfOpenMaxProbes) {
        circuit.state = 'CLOSED';
        circuit.failures = 0;
        this.logger.log(`✅ Circuit "${name}" recovered: HALF_OPEN → CLOSED`);
      }
    } else if (circuit.state === 'CLOSED') {
      // Reset consecutive failure count on success
      circuit.failures = 0;
    }
  }

  /** Record a failed call */
  recordFailure(name: string): void {
    const circuit = this.circuits.get(name);
    if (!circuit) return;

    circuit.failures++;
    circuit.lastFailureAt = Date.now();

    if (circuit.state === 'HALF_OPEN') {
      // Probe failed — re-open
      circuit.state = 'OPEN';
      circuit.openedAt = Date.now();
      circuit.totalTrips++;
      this.logger.warn(`🔴 Circuit "${name}" probe failed: HALF_OPEN → OPEN (trip #${circuit.totalTrips})`);
    } else if (circuit.state === 'CLOSED' && circuit.failures >= circuit.options.failureThreshold) {
      circuit.state = 'OPEN';
      circuit.openedAt = Date.now();
      circuit.totalTrips++;
      this.logger.warn(
        `🔴 Circuit "${name}" TRIPPED: ${circuit.failures} consecutive failures → OPEN (cooldown ${circuit.options.cooldownMs / 1000}s, trip #${circuit.totalTrips})`,
      );
    }
  }

  /**
   * Execute a function through a named circuit breaker.
   * Throws CircuitOpenError if the circuit is open.
   */
  async execute<T>(name: string, fn: () => Promise<T>, opts?: CircuitBreakerOptions): Promise<T> {
    if (!this.isAllowed(name, opts)) {
      const circuit = this.circuits.get(name)!;
      const remainingMs = circuit.options.cooldownMs - (Date.now() - circuit.openedAt);
      throw new CircuitOpenError(
        `Circuit "${name}" is OPEN — retry in ${Math.ceil(remainingMs / 1000)}s (trip #${circuit.totalTrips})`,
        name,
        remainingMs,
      );
    }

    try {
      const result = await fn();
      this.recordSuccess(name);
      return result;
    } catch (error) {
      this.recordFailure(name);
      throw error;
    }
  }

  /** Get status snapshot of all circuits */
  getAllStates(): Record<string, { state: CircuitState; failures: number; totalTrips: number; lastFailureAt: string | null }> {
    const result: Record<string, { state: CircuitState; failures: number; totalTrips: number; lastFailureAt: string | null }> = {};
    for (const [name, circuit] of this.circuits) {
      result[name] = {
        state: circuit.state,
        failures: circuit.failures,
        totalTrips: circuit.totalTrips,
        lastFailureAt: circuit.lastFailureAt ? new Date(circuit.lastFailureAt).toISOString() : null,
      };
    }
    return result;
  }

  /** Get state for a specific circuit */
  getState(name: string): CircuitState {
    return this.circuits.get(name)?.state ?? 'CLOSED';
  }
}

export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public readonly circuitName: string,
    public readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
