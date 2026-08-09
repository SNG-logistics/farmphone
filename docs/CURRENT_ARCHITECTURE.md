# CURRENT ARCHITECTURE DESIGN DOCUMENT

## 1. High-Level System Overview

```text
                  +-----------------------------------+
                  |   Next.js Content Creator Studio  |
                  |            (apps/web)             |
                  +-----------------+-----------------+
                                    |
                                    v
                  +-----------------+-----------------+
                  |      NestJS API Backend Server    |
                  |            (apps/api)             |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            |                       |                       |
            v                       v                       v
  +------------------+    +-------------------+   +--------------------+
  | Remotion Studio  |    | Creative QA Gate  |   | FFprobe & FFmpeg   |
  | (apps/video-studio)|  |  (Score >= 85)    |   | Video Processing   |
  +------------------+    +-------------------+   +--------------------+
```

## 2. Key Modules & Packages

- **`apps/video-studio`**: Remotion 4.0 Motion Graphic Studio for 9:16 social videos.
- **`apps/api`**: NestJS server providing REST, WebSockets, Video Queue, Creative QA.
- **`apps/web`**: Next.js 14 dashboard with live video preview & progress tracking.
- **`apps/device-agent`**: ADB worker executing device actions on physical Android devices (PHONE-001).
- **`packages/database`**: Prisma client & PostgreSQL database schema.
- **`packages/events`**: Central event bus for real-time task notifications.

## 3. Video Pipeline Specifications

- **Format**: 9:16 Vertical Format (1080x1920)
- **FPS**: 30 FPS
- **Codec**: H.264 video (`yuv420p`), AAC 48kHz audio
- **Duration**: 25.0 seconds
- **Color Palette**: Yellow (`#FFCC00`), Dark (`#111111`), White (`#FFFFFF`)
