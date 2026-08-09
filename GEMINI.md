# GEMINI.md — FARM PHONE AI OFFICE

Welcome to **FARM PHONE AI OFFICE** (Autonomous Multi-Device Control Platform).
This document provides guidelines and commands for **Gemini CLI** and AI agents working on this codebase.

## Repository Overview
- **Monorepo structure**: Turborepo + npm workspaces.
  - `apps/api`: NestJS Backend API with JWT Auth, WebSockets, Prisma DB, BullMQ, and AI Services.
  - `apps/device-agent`: Node.js ADB device agent for connecting and controlling physical/virtual Android smartphones.
  - `apps/web`: Web Dashboard (Next.js / Vite).
  - `apps/video-studio`: Automated video rendering engine.
  - `packages/database`: Prisma ORM schema & database migrations.
  - `packages/events`, `packages/types`, `packages/ui`: Shared packages.

---

## AI & Gemini Integration

### Environment Variables
Set the following keys in your `.env` or system environment:
```env
# Primary (CometAPI — No Google Billing required):
COMETAPI_API_KEY=your_cometapi_key_here
COMETAPI_BASE_URL=https://api.cometapi.com/v1

# Optional Direct Google API:
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_VISION_MODEL=gemini-1.5-flash
```

### NestJS Backend Services & API Endpoints
- **Service**: [GeminiService](file:///c:/Users/acer/OneDrive/%E0%B9%80%E0%B8%94%E0%B8%AA%E0%B8%81%E0%B9%8C%E0%B8%97%E0%B9%87%E0%B8%AD%E0%B8%9B/farm%20phone/apps/api/src/ai/gemini.service.ts)
- **Controller**: [AiController](file:///c:/Users/acer/OneDrive/%E0%B9%80%E0%B8%94%E0%B8%AA%E0%B8%81%E0%B9%8C%E0%B8%97%E0%B9%87%E0%B8%AD%E0%B8%9B/farm%20phone/apps/api/src/ai/ai.controller.ts)
  - `POST /api/ai/gemini/analyze-screen` — Analyze screenshot base64 for UI elements, text, and popup detection.
  - `POST /api/ai/gemini/decide-action` — Analyze screenshot base64 and generate target ADB touch coordinates (tap, swipe, input text).

---

## CLI & Automation Scripts

Run the following commands via terminal:

- **Run Gemini Screen Vision Agent**:
  ```bash
  npm run gemini:agent "Check TikTok home screen and tap profile icon"
  ```
- **System Doctor & Diagnostics**:
  ```bash
  npm run doctor
  ```
- **Typecheck Workspace**:
  ```bash
  npm run typecheck
  ```
- **Build Backend API**:
  ```bash
  npm run build --workspace @farm-phone/api
  ```

---

## ADB Command References
- Devices: `adb devices -l`
- Capture Screenshot: `adb shell screencap -p /sdcard/screen.png`
- Tap: `adb shell input tap <X> <Y>`
- Swipe: `adb shell input swipe <X1> <Y1> <X2> <Y2> [duration_ms]`
- Input Text: `adb shell input text "<text>"`
