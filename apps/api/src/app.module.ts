import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// Core modules
import { PrismaModule } from './prisma/prisma.module';
import { FirebaseModule } from './firebase/firebase.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationModule } from './organization/organization.module';

// Feature modules
import { AgentsModule } from './agents/agents.module';
import { AgentTasksModule } from './agents/agent-tasks.module';
import { MissionsModule } from './missions/missions.module';
import { DevicesModule } from './devices/devices.module';
import { ContentModule } from './content/content.module';
import { AccountsModule } from './accounts/accounts.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { JobsModule } from './jobs/jobs.module';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { LogsModule } from './logs/logs.module';
import { ReportsModule } from './reports/reports.module';
import { DashboardModule } from './dashboard/dashboard.module';

// WebSocket
import { EventsModule } from './events/events.module';

// AI
import { AiModule } from './ai/ai.module';
import { PlatformAutomationModule } from './platform-automation/platform-automation.module';
import { VideoProcessingModule } from './video-processing/video-processing.module';

// Stability & Health (Super Premium)
import { StabilityModule } from './stability/stability.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    ScheduleModule.forRoot(),
    StabilityModule,
    HealthModule,
    PrismaModule,
    FirebaseModule,
    AuthModule,
    UsersModule,
    OrganizationModule,
    AgentsModule,
    AgentTasksModule,
    MissionsModule,
    DevicesModule,
    ContentModule,
    AccountsModule,
    CampaignsModule,
    JobsModule,
    BillingModule,
    NotificationsModule,
    LogsModule,
    ReportsModule,
    DashboardModule,
    EventsModule,
    AiModule,
    PlatformAutomationModule,
    VideoProcessingModule,
  ],
})
export class AppModule {}
