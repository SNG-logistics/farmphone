import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContentService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const items = await this.prisma.content.findMany({ orderBy: { createdAt: 'desc' } });
    return items.map((item: unknown) => this.serialize(item as { fileSize: bigint | null }));
  }

  async findOne(id: string) {
    const content = await this.prisma.content.findUnique({ where: { id } });
    if (!content) throw new NotFoundException(`Content ${id} not found`);
    return this.serialize(content);
  }

  async create(data: any) {
    const organizationId = data.organizationId || 'default-org';
    await this.ensureOrganization(organizationId);
    const content = await this.prisma.content.create({ data: { ...data, organizationId } });
    return this.serialize(content);
  }

  async update(id: string, data: any) {
    await this.findOne(id);
    return this.prisma.content.update({ where: { id }, data }).then((item) => this.serialize(item));
  }

  async updateStatus(id: string, status: string) {
    await this.findOne(id);
    return this.prisma.content.update({ where: { id }, data: { status } }).then((item) => this.serialize(item));
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.content.delete({ where: { id } });
  }

  private async ensureOrganization(id: string) {
    await this.prisma.organization.upsert({ where: { id }, update: {}, create: { id, name: 'Local Test Organization' } });
  }

  private serialize<T extends { fileSize: bigint | null }>(item: T) {
    return { ...item, fileSize: item.fileSize?.toString() || null };
  }
}
