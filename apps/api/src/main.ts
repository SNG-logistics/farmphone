import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { appConfig } from '@farm-phone/config';
import { TenantInterceptor } from './prisma/tenant.interceptor';
import { TimestampSanitizeInterceptor } from './prisma/timestamp-sanitize.interceptor';
import { RequestLoggerInterceptor } from './stability/request-logger.interceptor';
import { RedisIoAdapter } from './events/redis-io.adapter';
import express from 'express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap() {
  (BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON() {
    return this.toString();
  };
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { rawBody: true });

  if (process.env.SOCKET_REDIS_ADAPTER !== 'false') {
    const redisIoAdapter = new RedisIoAdapter(app);
    try {
      await redisIoAdapter.connectToRedis();
      app.useWebSocketAdapter(redisIoAdapter);
    } catch (error) {
      logger.warn(`Socket.IO Redis adapter unavailable; using local adapter: ${String(error)}`);
    }
  }

  app.enableCors({
    origin: [appConfig.corsOrigin, /^http:\/\/(?:localhost|127\.0\.0\.1):3000$/],
    credentials: true,
  });

  const generatedVideosDir = join(process.cwd(), 'storage', 'generated-videos');
  if (!existsSync(generatedVideosDir)) mkdirSync(generatedVideosDir, { recursive: true });
  app.use('/generated-videos', express.static(generatedVideosDir));

  let rootDir = process.cwd();
  while (rootDir && !existsSync(join(rootDir, 'turbo.json')) && existsSync(join(rootDir, '..'))) {
    const parent = join(rootDir, '..');
    if (parent === rootDir) break;
    rootDir = parent;
  }
  const outputStaticDir = join(rootDir, 'output');
  if (!existsSync(outputStaticDir)) mkdirSync(outputStaticDir, { recursive: true });
  app.use('/output', express.static(outputStaticDir));

  app.use('/', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path === '/' || req.path === '') {
      res.json({
        name: 'Automation Control API Gateway',
        version: '2.0.0',
        status: 'online',
        swaggerDocs: 'http://localhost:3001/api/docs',
        healthCheck: 'http://localhost:3001/api/v1/health',
        webDashboard: 'http://localhost:3000/devices',
      });
      return;
    }
    next();
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    })
  );

  // Global interceptors: Tenant, Timestamp Sanitization, Request Logger
  const requestLogger = app.get(RequestLoggerInterceptor);
  app.useGlobalInterceptors(
    new TenantInterceptor(),
    new TimestampSanitizeInterceptor(),
    requestLogger,
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Farm Phone AI Office API')
    .setDescription('Autonomous Multi-Device Control Platform — Super Premium Stability Edition')
    .setVersion('2.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();
  registerGracefulShutdown(app, logger);

  await app.listen(appConfig.port, '0.0.0.0');

  logger.log('');
  logger.log('╔══════════════════════════════════════════════════════════════╗');
  logger.log('║  🛡️  FARM PHONE AI OFFICE — SUPER PREMIUM BACKEND v2.0    ║');
  logger.log('╠══════════════════════════════════════════════════════════════╣');
  logger.log(`║  🚀 API Server:    http://localhost:${appConfig.port}                  ║`);
  logger.log(`║  📚 Swagger Docs:  http://localhost:${appConfig.port}/api/docs          ║`);
  logger.log(`║  🏥 Health Check:  http://localhost:${appConfig.port}/api/v1/health      ║`);
  logger.log(`║  📈 System Status: http://localhost:${appConfig.port}/api/v1/system/status║`);
  logger.log('╠══════════════════════════════════════════════════════════════╣');
  logger.log('║  🛡️ Stability Layers Active:                               ║');
  logger.log('║    L1 Health Monitoring    ✅                               ║');
  logger.log('║    L2 Circuit Breaker      ✅                               ║');
  logger.log('║    L3 Retry + Backoff      ✅                               ║');
  logger.log('║    L4 Rate Limiter         ✅                               ║');
  logger.log('║    L5 Structured Logging   ✅                               ║');
  logger.log('║    L6 Graceful Shutdown    ✅                               ║');
  logger.log('║    L7 System Dashboard     ✅                               ║');
  logger.log('╚══════════════════════════════════════════════════════════════╝');
  logger.log('');
}

function registerGracefulShutdown(app: INestApplication, logger: Logger) {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.warn('');
    logger.warn(`🔌 Received ${signal} — initiating graceful shutdown...`);
    logger.warn(`⏳ Draining in-flight requests (timeout: ${SHUTDOWN_TIMEOUT_MS / 1000}s)...`);

    const shutdownTimer = setTimeout(() => {
      logger.error(`❌ Shutdown timed out after ${SHUTDOWN_TIMEOUT_MS / 1000}s — forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
      await app.close();
      clearTimeout(shutdownTimer);
      logger.log('✅ All connections drained. Database disconnected. WebSocket rooms closed.');
      logger.log('🏁 FARM PHONE AI OFFICE backend shut down cleanly.');
      process.exit(0);
    } catch (error) {
      clearTimeout(shutdownTimer);
      logger.error(`❌ Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap();

