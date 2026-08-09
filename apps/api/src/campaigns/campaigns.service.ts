import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService, private jobsService: JobsService) {}

  async findAll() {
    const campaigns = await this.prisma.campaign.findMany({
      include: {
        jobs: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return campaigns;
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        jobs: true,
      },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign with ID "${id}" not found`);
    }
    return campaign;
  }

  async create(data: { name: string; description?: string; status?: string; startDate?: string; endDate?: string; accountIds?: string[]; contentIds?: string[]; deviceGroupId?: string; schedule?: string; dailyLimit?: number; organizationId?: string }) {
    const organizationId = data.organizationId || 'default-org';
    await this.prisma.organization.upsert({ where: { id: organizationId }, update: {}, create: { id: organizationId, name: 'Local Test Organization' } });
    const campaign = await this.prisma.campaign.create({
      data: {
        organizationId,
        name: data.name,
        description: data.description || '',
        status: data.status || 'DRAFT',
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        accountIds: data.accountIds || [],
        contentIds: data.contentIds || [],
        deviceGroupId: data.deviceGroupId || null,
        schedule: data.schedule || null,
        dailyLimit: data.dailyLimit || 0,
      },
      include: {
        jobs: true,
      },
    });
    return campaign;
  }

  async update(id: string, data: { name?: string; description?: string; status?: string; startDate?: string; endDate?: string; accountIds?: string[]; contentIds?: string[]; deviceGroupId?: string; schedule?: string; dailyLimit?: number }) {
    await this.findOne(id);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
    if (data.accountIds !== undefined) updateData.accountIds = data.accountIds;
    if (data.contentIds !== undefined) updateData.contentIds = data.contentIds;
    if (data.deviceGroupId !== undefined) updateData.deviceGroupId = data.deviceGroupId || null;
    if (data.schedule !== undefined) updateData.schedule = data.schedule || null;
    if (data.dailyLimit !== undefined) updateData.dailyLimit = data.dailyLimit;

    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: updateData,
      include: {
        jobs: true,
      },
    });
    return campaign;
  }

  async updateStatus(id: string, status: string) {
    await this.findOne(id);

    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: { status },
      include: {
        jobs: true,
      },
    });
    return campaign;
  }

  async launch(id: string) {
    const campaign = await this.findOne(id);
    if (campaign.accountIds.length === 0 || campaign.contentIds.length === 0) {
      throw new BadRequestException('Campaign ต้องมีอย่างน้อย 1 Account และ 1 Content');
    }

    const scheduledAt = campaign.schedule ? new Date(campaign.schedule) : undefined;
    const jobs = [];
    for (const accountId of campaign.accountIds) {
      for (const contentId of campaign.contentIds) {
        const result = await this.jobsService.createAndEnqueue({
          organizationId: campaign.organizationId,
          name: `${campaign.name}: ${accountId} / ${contentId}`,
          type: 'UPLOAD_VIDEO',
          campaignId: campaign.id,
          accountId,
          contentId,
          scheduledAt: scheduledAt?.toISOString(),
          metadata: { requiresPostVerification: true, evidenceRequired: true },
        });
        jobs.push(result.job);
      }
    }

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: { status: scheduledAt && scheduledAt > new Date() ? 'READY' : 'RUNNING', totalJobs: jobs.length },
    });
    return { campaign: updated, jobs };
  }

  async getStats() {
    const totalCampaigns = await this.prisma.campaign.count();
    const byStatus = await this.prisma.campaign.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const totalJobs = await this.prisma.job.count();
    const activeJobs = await this.prisma.job.count({
      where: { status: 'active' },
    });

    return {
      totalCampaigns,
      byStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count.status,
      })),
      totalJobs,
      activeJobs,
    };
  }
}
