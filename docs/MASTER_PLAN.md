# FARM PHONE AI OFFICE — Master Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Dashboard (Next.js)                    │
│                 React + TypeScript + Tailwind                 │
│                  WebSocket / Socket.IO Client                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              API Gateway / Backend (NestJS)                  │
│          REST API + WebSocket Gateway + BullMQ Board         │
└──┬──────────┬──────────┬──────────┬──────────┬─────────────┘
   │          │          │          │          │
┌──▼──┐  ┌───▼───┐  ┌───▼───┐  ┌───▼───┐  ┌──▼──────┐
│Device│  │ Job   │  │Content│  │AI     │  │Billing  │
│Service│ │Engine │  │Service│  │Engine │  │Service  │
└──┬───┘  └───┬───┘  └───────┘  └───────┘  └─────────┘
   │          │
┌──▼──────────▼──────────┐
│   Redis Queue + PubSub  │
└─────────────────────────┘
   │
┌──▼──────────────────────┐
│  Device Workers (Node)  │
│  PHONE-001 ... PHONE-500│
└─────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Socket.IO Client |
| Backend | NestJS, TypeScript, REST API, WebSocket Gateway |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache/Queue | Redis 7 + BullMQ |
| Device Control | Node.js Device Agent + ADB |
| Storage | MinIO (S3-compatible) |
| Video | FFmpeg |
| Auth | JWT + Refresh Token + RBAC |
| Deployment | Docker + Docker Compose |

## Database Schema (Core Tables)

See `packages/database/prisma/schema.prisma`

## Module Map

### API Modules (NestJS)
- `AuthModule` — Authentication, JWT, RBAC
- `UsersModule` — User CRUD, roles, permissions
- `OrganizationModule` — Multi-tenant org management
- `AIAgentModule` — 16 AI agents, state machine
- `AgentTaskModule` — Agent task queue, mission management
- `DeviceModule` — Device management, heartbeats
- `DeviceGroupModule` — Device grouping for scaling
- `ContentModule` — Video library, captions, hashtags
- `AccountModule` — Social accounts, auth management
- `CampaignModule` — Campaign CRUD, workflow orchestration
- `JobModule` — Job engine, queue management
- `SchedulerModule` — Time-based job scheduling
- `EventBusModule` — Event-driven architecture
- `BillingModule` — Plans, credits, ledger
- `NotificationModule` — Multi-channel notifications
- `LogModule` — System logs, audit trail
- `ReportModule` — Analytics, dashboards

### Web Pages (Next.js App Router)
- `/` — Landing / redirect to dashboard
- `/dashboard` — Main KPI dashboard
- `/ai-office` — AI Office with 16 animated agents
- `/devices` — Device farm grid
- `/devices/:id` — Single device detail
- `/content` — Content library
- `/accounts` — Account management
- `/campaigns` — Campaign list
- `/campaigns/:id` — Campaign detail with workflow
- `/jobs` — Job queue monitor
- `/scheduler` — Schedule calendar
- `/reports` — Analytics reports
- `/billing` — Billing & credits
- `/settings` — System settings
- `/admin/users` — User management (admin)
- `/admin/roles` — Role management (admin)

## Event Flow

```
USER COMMAND → CEO (analyze) → MANAGER (plan) → ANALYST (check)
→ CONTENT (prepare) → SCHEDULER (schedule) → DEVICE (verify)
→ JOB EXECUTION → UPLOADER → QA → DATA → NOTIFIER → COMPLETE
```

Events: MISSION_CREATED, TASK_CREATED, TASK_ASSIGNED, AGENT_STARTED,
AGENT_COMPLETED, JOB_CREATED, JOB_STARTED, JOB_COMPLETED, JOB_FAILED,
DEVICE_ONLINE, DEVICE_OFFLINE, CAMPAIGN_STARTED, CAMPAIGN_COMPLETED

## Implementation Phases

- PHASE 0 ✅ Repository Audit
- PHASE 1 — Project Foundation
- PHASE 2 — Database + Auth + RBAC
- PHASE 3 — Dashboard Shell
- PHASE 4 — AI Office UI
- PHASE 5 — AI Agent State Engine
- PHASE 6 — Device Management
- PHASE 7 — Device Agent + ADB
- PHASE 8 — Content + Accounts
- PHASE 9 — Campaign + Job Queue
- PHASE 10 — Automation Workflow + Scheduler
- PHASE 11 — Error Recovery + Notification
- PHASE 12 — Billing + Reports
- PHASE 13 — Testing + Docker Deployment

## Risks

1. **Device Agent ADB Integration** — Requires physical Android devices or emulators. Mitigated with Device Simulator for development.
2. **Real-time WebSocket at Scale** — Socket.IO horizontal scaling needs Redis adapter.
3. **BullMQ Job Reliability** — Requires proper Redis persistence config, idempotency keys.
4. **Multi-tenant Data Isolation** — Row-level security enforced at Prisma middleware level.
5. **Video Processing** — FFmpeg spawn management, queue large files to workers.
