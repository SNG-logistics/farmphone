import { Controller, Get, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdbService } from '../devices/adb.service';
import { CircuitBreakerService } from '../stability/circuit-breaker.service';
import { RequestLoggerInterceptor } from '../stability/request-logger.interceptor';
import * as os from 'os';

interface SubsystemCheck {
  status: 'pass' | 'fail' | 'degraded';
  latencyMs: number;
  message: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  subsystems: {
    database: SubsystemCheck;
    adbBridge: SubsystemCheck;
    memory: SubsystemCheck & { heapUsedMB: number; rssMB: number; heapTotalMB: number };
    system: SubsystemCheck & { cpuCount: number; platform: string; loadAvg: number[] };
  };
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly adb: AdbService,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const [database, adbBridge] = await Promise.all([
      this.checkDatabase(),
      this.checkAdb(),
    ]);

    const memory = this.checkMemory();
    const system = this.checkSystem();

    const subsystems = { database, adbBridge, memory, system };
    const allStatuses = Object.values(subsystems).map((s) => s.status);

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (allStatuses.includes('fail')) {
      status = allStatuses.filter((s) => s === 'fail').length >= 2 ? 'unhealthy' : 'degraded';
    } else if (allStatuses.includes('degraded')) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
      subsystems,
    };
  }

  private async checkDatabase(): Promise<SubsystemCheck> {
    const start = Date.now();
    try {
      // Use a lightweight findFirst to verify DB connectivity
      await this.prisma.organization.findFirst({ select: { id: true } });
      return { status: 'pass', latencyMs: Date.now() - start, message: 'Database connection OK' };
    } catch (error) {
      return {
        status: 'fail',
        latencyMs: Date.now() - start,
        message: `Database unreachable: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkAdb(): Promise<SubsystemCheck> {
    const start = Date.now();
    try {
      const diag = await this.adb.diagnose();
      const deviceCount = diag.devices.length;
      return {
        status: diag.available ? 'pass' : 'degraded',
        latencyMs: Date.now() - start,
        message: diag.available
          ? `ADB available — ${deviceCount} device(s) connected`
          : `ADB not available: ${diag.message}`,
      };
    } catch (error) {
      return {
        status: 'fail',
        latencyMs: Date.now() - start,
        message: `ADB check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private checkMemory(): SubsystemCheck & { heapUsedMB: number; rssMB: number; heapTotalMB: number } {
    const mem = process.memoryUsage();
    const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);
    const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
    const usagePercent = heapTotalMB > 0 ? (heapUsedMB / heapTotalMB) * 100 : 0;

    let status: 'pass' | 'degraded' | 'fail' = 'pass';
    if (usagePercent > 90) status = 'fail';
    else if (usagePercent > 75) status = 'degraded';

    return {
      status,
      latencyMs: 0,
      message: `Heap ${heapUsedMB}MB / ${heapTotalMB}MB (${usagePercent.toFixed(1)}%), RSS ${rssMB}MB`,
      heapUsedMB,
      rssMB,
      heapTotalMB,
    };
  }

  private checkSystem(): SubsystemCheck & { cpuCount: number; platform: string; loadAvg: number[] } {
    const cpuCount = os.cpus().length;
    const platform = os.platform();
    const loadAvg = os.loadavg();
    const totalMemGB = Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10;
    const freeMemGB = Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10;

    return {
      status: freeMemGB < 0.5 ? 'degraded' : 'pass',
      latencyMs: 0,
      message: `${platform} | ${cpuCount} CPUs | RAM ${freeMemGB}GB free / ${totalMemGB}GB total | Load [${loadAvg.map((v) => v.toFixed(2)).join(', ')}]`,
      cpuCount,
      platform,
      loadAvg,
    };
  }
}

@Controller('system')
export class SystemStatusController {
  private readonly logger = new Logger(SystemStatusController.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly requestLogger: RequestLoggerInterceptor,
  ) {}

  @Get('status')
  getStatus() {
    const mem = process.memoryUsage();

    return {
      status: 'operational',
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor((Date.now() - this.startTime) / 1000),
        human: this.formatUptime(Date.now() - this.startTime),
      },
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
      },
      os: {
        totalMemoryGB: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
        freeMemoryGB: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10,
        cpuCount: os.cpus().length,
        loadAverage: os.loadavg(),
        hostname: os.hostname(),
      },
      circuitBreakers: this.circuitBreaker.getAllStates(),
      recentErrors: this.requestLogger.getRecentErrors().slice(0, 20),
    };
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);
    return parts.join(' ');
  }
}
