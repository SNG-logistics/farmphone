import { Injectable } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(
    private reportsService: ReportsService,
    private prisma: PrismaService,
  ) {}

  async getKPIs(organizationId: string) {
    return this.reportsService.getDashboardKPI(organizationId);
  }

  async getSystemStatus(organizationId: string) {
    const [devices, agents, jobs] = await Promise.all([
      this.prisma.device.count({ where: { organizationId, adbStatus: 'ONLINE' } }),
      this.prisma.aIAgent.count({ where: { organizationId } }),
      this.prisma.job.count({ where: { organizationId, status: { in: ['RUNNING', 'QUEUED', 'ASSIGNED'] } } }),
    ]);
    return {
      onlineDevices: devices,
      activeAgents: agents,
      activeJobs: jobs,
      serverTime: new Date().toISOString(),
    };
  }

  async getRecentActivity(organizationId: string) {
    const [logs, events] = await Promise.all([
      this.prisma.log.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.agentEvent.findMany({
        where: { agent: { organizationId } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    return { logs, events };
  }
}
