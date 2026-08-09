import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  isMockAutomationEnabled,
  isProductionAutomationPlatform,
  normalizeAutomationPlatform,
} from '../platform-automation/platform-automation.types';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.account.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  async create(data: any) {
    const organizationId = data.organizationId || 'default-org';
    const platform = this.validatedPlatform(data.platform);
    const username = String(data.username || '').trim();
    if (!username) throw new BadRequestException('กรุณาระบุ platform และ username');

    await this.prisma.organization.upsert({ where: { id: organizationId }, update: {}, create: { id: organizationId, name: 'Local Test Organization' } });
    const existing = await this.prisma.account.findFirst({ where: { organizationId, platform, username } });
    if (existing) throw new ConflictException(`มีบัญชี ${platform} ชื่อ ${username} อยู่แล้ว`);

    try {
      return await this.prisma.account.create({
        data: {
          ...data,
          organizationId,
          platform,
          username,
          nickname: String(data.nickname || '').trim() || null,
          assignedDeviceId: String(data.assignedDeviceId || '').trim() || null,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(`มีบัญชี ${platform} ชื่อ ${username} อยู่แล้ว`);
      }
      throw error;
    }
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    const updateData = { ...data };
    if (data.platform !== undefined) updateData.platform = this.validatedPlatform(data.platform);
    return this.prisma.account.update({ where: { id }, data: updateData });
  }

  async updateStatus(id: string, status: string) {
    await this.findOne(id);
    return this.prisma.account.update({ where: { id }, data: { status } });
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.account.delete({ where: { id } });
  }

  private validatedPlatform(value: unknown) {
    const normalized = normalizeAutomationPlatform(String(value || ''));
    if (isProductionAutomationPlatform(normalized)) return normalized;
    if (normalized === 'mock' && isMockAutomationEnabled()) return normalized;
    throw new BadRequestException(`Unsupported automation platform: ${String(value || '(empty)')}`);
  }
}
