import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import { redisConfig } from '@farm-phone/config';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private pubClient?: IORedis;
  private subClient?: IORedis;
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis() {
    try {
      this.pubClient = new IORedis(redisConfig.url, {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        retryStrategy: () => null, // Don't loop infinitely if offline
      });

      // Suppress unhandled error events
      this.pubClient.on('error', (err) => {
        this.logger.debug(`Redis Socket.IO error: ${err.message}`);
      });

      this.subClient = this.pubClient.duplicate();
      this.subClient.on('error', (err) => {
        this.logger.debug(`Redis Socket.IO sub error: ${err.message}`);
      });

      await Promise.all([this.waitUntilReady(this.pubClient), this.waitUntilReady(this.subClient)]);
      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
      this.logger.log('Socket.IO Redis adapter connected');
    } catch (error) {
      this.logger.warn(`Redis Socket.IO adapter unavailable; using in-memory local adapter: ${error instanceof Error ? error.message : String(error)}`);
      this.disconnectClients();
    }
  }

  createIOServer(port: number, options?: Record<string, unknown>) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  async close(server: any) {
    await super.close(server);
    await this.disconnectClients();
  }

  private disconnectClients() {
    try {
      this.pubClient?.disconnect();
      this.subClient?.disconnect();
    } catch {}
    this.pubClient = undefined;
    this.subClient = undefined;
    this.adapterConstructor = undefined;
  }

  private waitUntilReady(client: IORedis, timeoutMs = 2000) {
    if (client.status === 'ready') return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Redis connection timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timer);
        client.removeListener('ready', onReady);
        client.removeListener('error', onError);
      };

      client.once('ready', onReady);
      client.once('error', onError);
    });
  }
}
