import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InMemoryEventBus, SystemEvent } from './index';

interface TestEvents {
  JOB_CREATED: { jobId: string };
  JOB_COMPLETED: { jobId: string; durationMs: number };
  DEVICE_ONLINE: { deviceId: string };
}

describe('InMemoryEventBus', () => {
  it('creates a typed immutable event envelope', async () => {
    const bus = new InMemoryEventBus<TestEvents>({
      idFactory: () => 'event-1',
      now: () => new Date('2026-07-28T01:02:03.000Z'),
    });

    const event = await bus.publish(
      'JOB_CREATED',
      { jobId: 'job-1' },
      'org-1',
      {
        correlationId: 'mission-1',
        causationId: 'command-1',
        metadata: { source: 'scheduler' },
      },
    );

    assert.deepEqual(event, {
      id: 'event-1',
      type: 'JOB_CREATED',
      domain: 'job',
      payload: { jobId: 'job-1' },
      timestamp: '2026-07-28T01:02:03.000Z',
      organizationId: 'org-1',
      correlationId: 'mission-1',
      causationId: 'command-1',
      metadata: { source: 'scheduler' },
    });
    assert.equal(Object.isFrozen(event), true);
    assert.equal(Object.isFrozen(event.metadata), true);
  });

  it('dispatches exact, domain wildcard, and global wildcard subscriptions', async () => {
    const bus = new InMemoryEventBus<TestEvents>();
    const received: string[] = [];

    bus.on('JOB_CREATED', (event) => {
      received.push(`exact:${event.payload.jobId}`);
    });
    bus.on('job.*', (event) => {
      received.push(`pattern:${event.type}`);
    });
    bus.onDomain('JOB', (event) => {
      received.push(`domain:${event.type}`);
    });
    bus.on('*', (event) => {
      received.push(`any:${event.type}`);
    });

    await bus.publish('JOB_CREATED', { jobId: 'job-2' }, 'org-1');
    await bus.publish('DEVICE_ONLINE', { deviceId: 'device-1' }, 'org-1');

    assert.deepEqual(received, [
      'exact:job-2',
      'pattern:JOB_CREATED',
      'domain:JOB_CREATED',
      'any:JOB_CREATED',
      'any:DEVICE_ONLINE',
    ]);
  });

  it('supports idempotent unsubscribe callbacks and off', async () => {
    const bus = new InMemoryEventBus<TestEvents>();
    let calls = 0;
    const handler = () => {
      calls += 1;
    };

    const unsubscribe = bus.on('JOB_COMPLETED', handler);
    await bus.publish('JOB_COMPLETED', { jobId: 'job-1', durationMs: 25 }, 'org-1');
    unsubscribe();
    unsubscribe();
    await bus.publish('JOB_COMPLETED', { jobId: 'job-2', durationMs: 30 }, 'org-1');

    bus.on('JOB_COMPLETED', handler);
    bus.off('JOB_COMPLETED', handler);
    await bus.publish('JOB_COMPLETED', { jobId: 'job-3', durationMs: 35 }, 'org-1');

    assert.equal(calls, 1);
  });

  it('isolates sync and async handler failures', async () => {
    const failures: Array<{ selector: string; message: string }> = [];
    const completed: string[] = [];
    const bus = new InMemoryEventBus<TestEvents>({
      onError: ({ error, selector }) => {
        failures.push({ selector, message: (error as Error).message });
      },
    });

    bus.on('JOB_CREATED', () => {
      throw new Error('sync failure');
    });
    bus.on('JOB_CREATED', async () => {
      await Promise.resolve();
      throw new Error('async failure');
    });
    bus.on('JOB_CREATED', ({ payload }) => {
      completed.push(payload.jobId);
    });
    bus.onError(() => {
      throw new Error('error observer failure');
    });

    await assert.doesNotReject(
      bus.publish('JOB_CREATED', { jobId: 'job-safe' }, 'org-1'),
    );
    assert.deepEqual(completed, ['job-safe']);
    assert.deepEqual(failures, [
      { selector: 'JOB_CREATED', message: 'sync failure' },
      { selector: 'JOB_CREATED', message: 'async failure' },
    ]);
  });

  it('keeps the original SystemEvent shape assignable', () => {
    const legacyEvent: SystemEvent = {
      id: 'legacy-1',
      type: 'JOB_CREATED' as SystemEvent['type'],
      payload: { jobId: 'job-1' },
      timestamp: '2026-07-28T00:00:00.000Z',
      organizationId: 'org-1',
    };

    assert.equal(legacyEvent.id, 'legacy-1');
  });
});
