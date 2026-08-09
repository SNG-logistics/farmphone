# PHASE 1 — Single Device Release Checklist

## 1. Release Rule

- `[x]` PHASE 1 scope is fixed to `PHONE-001`
- `[x]` Simulator is disabled by configuration and rejected by Device Agent
- `[x]` Multi-device legacy worker is excluded from default Compose startup
- `[ ]` TEST-001..018 all have accepted evidence
- `[ ]` Fresh Docker Deployment passed
- `[ ]` Critical bugs = 0 and High severity bugs = 0 established from physical run
- `[ ]` Final verdict may be changed to `SINGLE_DEVICE_READY`

Current verdict: `SINGLE_DEVICE_NOT_READY`

## 2. Implemented Architecture

- `[x]` Web Dashboard -> Backend API flow
- `[x]` PostgreSQL/Prisma persistence models and migration
- `[x]` Redis + BullMQ command queue
- `[x]` Backend worker dispatches commands over WebSocket
- `[x]` Device Agent executes through ADB only
- `[x]` Agent response correlates by Job ID
- `[x]` Backend persists result/log/evidence metadata
- `[x]` Dashboard receives device/job/agent events
- `[x]` Host Device Agent documented as recommended setup

## 3. Device and Heartbeat

- `[x]` `DEVICE_CODE=PHONE-001`
- `[x]` Serial discovered from `adb devices -l`; no hardcoded serial
- `[x]` `ANDROID_DEVICE_SERIAL` supported
- `[x]` Multiple ready devices without serial return `CONFIGURATION_ERROR`
- `[x]` Unauthorized/offline states are distinguishable
- `[x]` Manufacturer, model, Android, battery, storage and uptime collected
- `[x]` Heartbeat interval default is 5 seconds
- `[x]` Heartbeat history and `lastHeartbeatAt` persisted
- `[x]` Backend watchdog default timeout is 15 seconds
- `[x]` `deviceUpdate` emitted for heartbeat/offline changes
- `[ ]` Real PHONE-001 heartbeat cadence captured
- `[ ]` Physical unplug/reconnect transition captured

## 4. Commands and Queue

- `[x]` `POST /api/v1/devices/PHONE-001/commands`
- `[x]` `HEALTH_CHECK`
- `[x]` `SCREENSHOT`
- `[x]` `OPEN_APP`
- `[x]` `STOP_APP`
- `[x]` `PUSH_FILE`
- `[x]` `REBOOT_DEVICE`
- `[x]` Frontend does not call production ADB endpoints directly
- `[x]` Job and DeviceCommand created before execute
- `[x]` Idempotency key returns existing Job
- `[x]` Same active command is protected from duplicate execution
- `[x]` Maximum 3 attempts
- `[x]` Exponential backoff starts at 5 seconds
- `[x]` Attempt/error/ADB output logging
- `[x]` Final failure changes status to FAILED and creates DLQ entry
- `[x]` Command timeout prevents permanent RUNNING state
- `[ ]` All six commands verified on PHONE-001
- `[ ]` Retry/DLQ verified with live failure injection

## 5. Verification and Evidence

- `[x]` HEALTH_CHECK result contract is PASS/WARNING/FAIL
- `[x]` SCREENSHOT validates PNG and checksum before storage
- `[x]` OPEN_APP verifies package PID/activity
- `[x]` STOP_APP verifies process absence
- `[x]` PUSH_FILE verifies source and destination size/SHA-256
- `[x]` REBOOT_DEVICE verifies reconnect and boot completion
- `[x]` Uploaded files and screenshots link to Job records
- `[ ]` Real screenshot PNG from PHONE-001 stored under evidence path
- `[ ]` Real push destination/hash evidence captured
- `[ ]` Real app foreground/stop video captured
- `[ ]` Real reboot/reconnect evidence captured

## 6. Dashboard and AI Office

- `[x]` `/devices` uses API data and displays only PHONE-001
- `[x]` `/devices/PHONE-001` uses API/WebSocket data
- `[x]` Device detail displays identity, telemetry, heartbeat, jobs, logs and latest screenshot
- `[x]` Six command controls have loading/disabled/success/error state
- `[x]` PUSH_FILE uses multipart upload
- `[x]` `/dashboard` has no fake 20-device KPI/activity data
- `[x]` `/ai-office` shows MANAGER, DEVICE, QA and LOG MVP agents
- `[x]` Agent state is linked to real task/job/event records
- `[x]` Automated TEST-018 static scan passed
- `[ ]` Runtime UI fields reconciled with live API/database values
- `[ ]` WebSocket reconnect demonstrated without refresh

## 7. Database and Docker

- `[x]` Baseline Prisma migration exists
- `[x]` Single Device migration exists
- `[x]` `devices`, `device_heartbeats`, `device_commands`, `jobs`, `job_logs`, `uploaded_files` modeled
- `[x]` `ai_agents`, `agent_tasks`, `agent_events`, `audit_logs` modeled
- `[x]` Storage values use bytes with `BigInt`
- `[x]` API container runs `prisma migrate deploy` before startup
- `[x]` Default Compose starts PostgreSQL, Redis, MinIO, API and Web
- `[x]` Device Agent Compose profile sets PHONE-001 and simulator false
- `[ ]` Docker command available on acceptance host
- `[ ]` Migrations applied from a clean database and status captured
- `[ ]` Backend restart persistence verified
- `[ ]` Redis restart behavior verified

## 8. Automated Results

- `[x]` API E2E `42/42 passed`
- `[x]` Device Agent `6/6 passed`
- `[x]` TEST-018 static contract passed
- `[ ]` Physical live contract run with `RUN_LIVE_ONE_DEVICE=1`
- `[ ]` TEST-003 manual USB removal passed
- `[ ]` TEST-004 manual USB reconnect passed
- `[ ]` TEST-014 manual Backend restart passed
- `[ ]` TEST-015 manual Agent restart passed
- `[ ]` Failure injection matrix passed

## 9. Exact Acceptance Commands

```powershell
docker compose -f docker/docker-compose.yml up -d --build postgres redis minio api web
docker compose -f docker/docker-compose.yml ps
npx prisma migrate status --schema packages/database/prisma/schema.prisma
adb devices -l
npm run start --workspace=@farm-phone/device-agent
```

```powershell
$env:RUN_LIVE_ONE_DEVICE = "1"
$env:API_URL = "http://localhost:3001/api/v1"
$env:WEB_URL = "http://localhost:3000"
$env:TARGET_ANDROID_PACKAGE = "com.example.target"
$env:LIVE_PUSH_FILE_PATH = "C:\path\to\test-file.bin"
node --test tests/live-one-device.contract.mjs
```

## 10. Required Evidence Before Release

- `[ ]` `docs/evidence/PHONE-001/manifest.json`
- `[ ]` `TEST-001` through `TEST-018` result folders
- `[ ]` `adb devices -l` and system version output
- `[ ]` Docker Compose status and API migration logs
- `[ ]` Device Agent, API, Queue and WebSocket logs
- `[ ]` Database device/job/log/file exports
- `[ ]` Latest real PHONE-001 screenshot and SHA-256
- `[ ]` Push-file source/destination checksums
- `[ ]` Dashboard/AI Office screenshots
- `[ ]` `PHONE-001-single-device-demo.mp4`
- `[ ]` Evidence checksums validated

## 11. Sign-off

- `[ ]` Operator confirms physical device is not a simulator
- `[ ]` QA confirms mandatory tests = 18 PASS
- `[ ]` QA confirms Fresh Docker Deployment = PASS
- `[ ]` QA confirms Critical = 0, High = 0
- `[ ]` Release owner approves `SINGLE_DEVICE_READY`

Until every unchecked mandatory item is complete, the only valid verdict is:

`SINGLE_DEVICE_NOT_READY`
