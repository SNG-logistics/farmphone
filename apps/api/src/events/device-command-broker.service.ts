import { Injectable } from '@nestjs/common';

export interface DeviceCommandResponse {
  jobId: string;
  deviceId?: string;
  deviceCode?: string;
  command?: string;
  attemptNumber?: number;
  result?: Record<string, unknown>;
  error?: {
    code?: string;
    message?: string;
    adbOutput?: string;
  } | string;
  completedAt?: string;
}

@Injectable()
export class DeviceCommandBrokerService {
  private readonly pending = new Map<string, {
    resolve: (response: DeviceCommandResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
    expectedCommand?: string;
    expectedAttemptNumber?: number;
  }>();

  waitFor(jobId: string, timeoutMs = 60_000, expectedCommand?: string, expectedAttemptNumber?: number) {
    if (this.pending.has(jobId)) {
      throw new Error(`A response waiter already exists for job ${jobId}`);
    }

    return new Promise<DeviceCommandResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(jobId);
        const error = new Error(`Device Agent response timed out for job ${jobId}`);
        (error as Error & { code?: string }).code = 'DEVICE_RESPONSE_TIMEOUT';
        reject(error);
      }, timeoutMs);
      this.pending.set(jobId, { resolve, reject, timer, expectedCommand, expectedAttemptNumber });
    });
  }

  resolve(response: DeviceCommandResponse) {
    if (!response?.jobId) return false;
    const waiter = this.pending.get(response.jobId);
    if (!waiter) return false;
    if (waiter.expectedCommand && response.command && response.command !== waiter.expectedCommand) return false;
    if (
      waiter.expectedAttemptNumber !== undefined
      && response.attemptNumber !== undefined
      && response.attemptNumber !== waiter.expectedAttemptNumber
    ) return false;
    clearTimeout(waiter.timer);
    this.pending.delete(response.jobId);
    waiter.resolve(response);
    return true;
  }

  reject(jobId: string, error: Error) {
    const waiter = this.pending.get(jobId);
    if (!waiter) return false;
    clearTimeout(waiter.timer);
    this.pending.delete(jobId);
    waiter.reject(error);
    return true;
  }
}
