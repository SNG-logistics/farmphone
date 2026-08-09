import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentTasksService } from './agent-tasks.service';
import { AgentTasksController } from './agent-tasks.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AgentTasksController],
  providers: [AgentTasksService],
  exports: [AgentTasksService],
})
export class AgentTasksModule {}
