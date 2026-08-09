import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MissionsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.mission.findMany();
  }

  async findOne(id: string) {
    const mission = await this.prisma.mission.findUnique({ where: { id } });
    if (!mission) throw new NotFoundException(`Mission ${id} not found`);
    return mission;
  }

  async create(data: { workflowSteps?: any[] } & any) {
    const { workflowSteps, ...missionData } = data;
    return this.prisma.mission.create({
      data: {
        ...missionData,
        ...(workflowSteps?.length
          ? { workflowSteps: { create: workflowSteps } }
          : {}),
      },
      include: { workflowSteps: true },
    });
  }

  async updateStatus(id: string, status: string) {
    await this.findOne(id);
    return this.prisma.mission.update({ where: { id }, data: { status } });
  }

  async getWorkflowSteps(missionId: string) {
    await this.findOne(missionId);
    return this.prisma.workflowStep.findMany({ where: { missionId } });
  }
}