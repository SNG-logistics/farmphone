import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationService {
  constructor(private prisma: PrismaService) {}

  async create(data: { name: string; ownerId?: string }) {
    return this.prisma.organization.create({ data });
  }

  async findAll() {
    return this.prisma.organization.findMany();
  }

  async findOne(id: string) {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  async update(id: string, data: { name?: string }) {
    return this.prisma.organization.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    return this.prisma.organization.delete({ where: { id } });
  }

  async getCreditBalance(organizationId: string) {
    const ledger = await this.prisma.creditLedger.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    return { balance: ledger.length > 0 ? ledger[0].balanceAfter : 0 };
  }
}