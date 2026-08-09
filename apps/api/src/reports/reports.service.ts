// @ts-nocheck
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardKPI(organizationId: string) {
    const [
      totalDevices,
      onlineDevices,
      totalAccounts,
      activeAccounts,
      totalJobs,
      successJobs,
      failedJobs,
      org,
    ] = await Promise.all([
      this.prisma.device.count({ where: { organizationId } }),
      this.prisma.device.count({ where: { organizationId, adbStatus: 'ONLINE' } }),
      this.prisma.account.count({ where: { organizationId } }),
      this.prisma.account.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.prisma.job.count({ where: { organizationId } }),
      this.prisma.job.count({ where: { organizationId, status: 'SUCCESS' } }),
      this.prisma.job.count({ where: { organizationId, status: 'FAILED' } }),
      this.prisma.organization.findUnique({ where: { id: organizationId } }),
    ]);

    return {
      totalDevices,
      onlineDevices,
      totalAccounts,
      activeAccounts,
      totalJobs,
      successJobs,
      failedJobs,
      successRate: totalJobs > 0 ? Math.round((successJobs / totalJobs) * 10000) / 100 : 0,
      creditBalance: org?.creditBalance ?? 0,
    };
  }

  async getDeviceReport(organizationId: string) {
    const devices = await this.prisma.device.findMany({
      where: { organizationId },
    });

    const byStatus = devices.reduce((acc: Record<string, number>, d: any) => {
      acc[d.adbStatus] = (acc[d.adbStatus] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgBattery =
      devices.length > 0
        ? Math.round(devices.reduce((sum, d) => sum + d.battery, 0) / devices.length)
        : 0;

    return { total: devices.length, byStatus, avgBattery, devices };
  }

  async getJobReport(organizationId: string) {
    const jobs = await this.prisma.job.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const byStatus = jobs.reduce((acc, j) => {
      acc[j.status] = (acc[j.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total: jobs.length, byStatus, jobs };
  }

  async getCampaignReport(organizationId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    const byStatus = campaigns.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total: campaigns.length, byStatus, campaigns };
  }

  async getAgentReport(organizationId: string) {
    const agents = await this.prisma.aIAgent.findMany({
      where: { organizationId },
      orderBy: { code: 'asc' },
    });

    const byStatus = agents.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total: agents.length, byStatus, agents };
  }
}
