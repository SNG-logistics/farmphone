import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId?: string) {
    const where: any = {};
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return notifications;
  }

  async findOne(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }
    return notification;
  }

  async create(data: {
    organizationId?: string;
    userId?: string;
    title: string;
    message: string;
    type?: string;
    metadata?: any;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        organizationId: data.organizationId || 'default-org',
        title: data.title,
        message: data.message,
        type: data.type || 'INFO',
        isRead: false,
        metadata: { userId: data.userId, ...data.metadata },
      },
    });
    return notification;
  }

  async markAsRead(id: string) {
    const existing = await this.prisma.notification.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Notification with ID "${id}" not found`);
    }

    const notification = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return notification;
  }

  async markAllAsRead(organizationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        organizationId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return {
      success: true,
      count: result.count,
      message: `${result.count} notifications marked as read`,
    };
  }
}