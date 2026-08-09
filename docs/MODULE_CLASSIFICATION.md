# MODULE CLASSIFICATION & INVENTORY

## 1. Classification Overview

| Path | Module Name | Classification | In Use | Import Dependencies | Merge Strategy |
| --- | --- | --- | --- | --- | --- |
| `apps/web` | Next.js Dashboard | `CORE_ACTIVE` | Yes | API, UI | Maintain & Extend |
| `apps/api` | NestJS Backend API | `CORE_ACTIVE` | Yes | Database, Events, AI | Maintain & Extend |
| `apps/device-agent` | ADB Control Agent | `CORE_ACTIVE` | Yes | ADB CLI, Events | Maintain & Extend |
| `apps/video-studio` | Remotion Studio | `CORE_ACTIVE` | Yes | React, Remotion | Maintain & Extend |
| `packages/database` | Prisma DB Client | `CORE_ACTIVE` | Yes | Prisma Schema | Maintain & Extend |
| `packages/types` | Shared Contracts | `CORE_ACTIVE` | Yes | TypeScript | Maintain & Extend |
| `packages/events` | Event Bus | `CORE_ACTIVE` | Yes | Redis / EventEmitter | Maintain & Extend |
| `scripts/system-doctor.mjs` | System Diagnostic | `CORE_ACTIVE` | Yes | Node / FFmpeg / Font | Maintain |
| `scripts/create-premium-video.mjs` | Premium Video Generator | `CORE_ACTIVE` | Yes | Remotion, FFmpeg, QA | Maintain |
| `scripts/render-preview.mjs` | Fast Preview Renderer | `CORE_ACTIVE` | Yes | FFmpeg, Remotion | Maintain |
| `scripts/render-final.mjs` | Final Video Renderer | `CORE_ACTIVE` | Yes | FFmpeg, Remotion | Maintain |
| `scripts/test-rendered-video.mjs` | FFprobe Tester | `CORE_ACTIVE` | Yes | FFprobe | Maintain |
| `archive/legacy/` | Legacy Prototypes | `LEGACY` | No | None | Archived |

## 2. Classification Definitions

- **CORE_ACTIVE**: Production code actively used in core workflows.
- **MERGE_AND_IMPROVE**: Modules being refactored and consolidated into the main architecture.
- **EXPERIMENTAL**: Experimental components (e.g., ComfyUI self-hosted adapter).
- **LEGACY**: Archived historical code preserved for reference without breaking build pipelines.
- **GENERATED_ARTIFACT**: Ephemeral build outputs (`dist`, `.next`, `node_modules`).
