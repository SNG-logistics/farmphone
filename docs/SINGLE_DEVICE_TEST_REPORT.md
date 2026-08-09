# PHASE 1 — Single Device MVP Test Report

## 1. Summary

- Report date: 2026-07-28
- Device under test: `PHONE-001`
- Automated API result: `42/42 passed`
- Automated Device Agent result: `6/6 passed`
- `TEST-018` production mock-data contract: `PASS`
- Physical tests: `SKIPPED` / `NOT_RUN`
- Skip reason: คำสั่ง `docker` และ `adb` ไม่ได้ติดตั้งหรือเรียกใช้ไม่ได้ในเครื่องตรวจนี้ และไม่มี PHONE-001 evidence
- Physical mandatory tests passed: `0/17`
- Overall mandatory tests with accepted evidence: `1/18` (`TEST-018` only)
- Fresh Docker Deployment: `NOT_RUN`
- Final Verdict: `SINGLE_DEVICE_NOT_READY`

Passing mocked/unit/static tests confirms implementation contracts but does not replace evidence from a physical phone

## 2. Automated Results

| Suite | Result | Notes |
|---|---:|---|
| API E2E | `42/42 passed` | Includes Single Device broker, queued HEALTH_CHECK verification, timeout protection, idempotency and offline watchdog contracts รวมกับ API regression suites |
| Device Agent | `6/6 passed` | ADB parser, one-device selection, required serial for ambiguity, unauthorized handling, real telemetry status and deterministic SHA-256 |
| Live one-device contract with physical mode disabled | `TEST-018 passed`; physical cases skipped | Static production Dashboard scan runs without Docker/ADB; physical cases require `RUN_LIVE_ONE_DEVICE=1` |

Commands represented by these results:

```powershell
npm run test:e2e:mock --workspace=@farm-phone/api
npm test --workspace=@farm-phone/device-agent
node --test tests/live-one-device.contract.mjs
```

## 3. Implementation Confirmed by Review

- Device Agent fixes identity to `DEVICE_CODE=PHONE-001`, discovers serial through ADB and supports `ANDROID_DEVICE_SERIAL`
- Ambiguous multi-device selection returns `CONFIGURATION_ERROR`
- Simulator mode is rejected and Compose config sets `SIMULATOR_MODE=false`
- Agent heartbeat default is 5 seconds with real telemetry and current Job
- Backend persists heartbeat rows and watchdog marks stale PHONE-001 offline after default 15 seconds
- `POST /api/v1/devices/PHONE-001/commands` persists command/job/log/file records and enqueues BullMQ
- Queue has bounded 3-attempt exponential retry, timeout handling and DLQ
- HEALTH_CHECK, SCREENSHOT, OPEN_APP, STOP_APP, PUSH_FILE and REBOOT_DEVICE include result verification
- Dashboard and AI Office use API/WebSocket records; known production mocks/direct device-test calls were removed from the scoped pages
- Prisma migration creates required Single Device tables/fields
- Docker API startup executes `prisma migrate deploy`

## 4. Mandatory Test Results

| Test | Status | Evidence status |
|---|---|---|
| TEST-001 Device detection | `SKIPPED` | Contract code/tests pass; no real `adb devices -l` or PHONE-001 registration evidence |
| TEST-002 Heartbeat Dashboard update | `SKIPPED` | 5-second implementation exists; no live phone/WebSocket capture |
| TEST-003 USB removal -> OFFLINE | `NOT_RUN` | Requires physical cable removal and timed watchdog evidence |
| TEST-004 USB reconnect -> ONLINE | `NOT_RUN` | Requires physical reconnect/RSA recovery evidence |
| TEST-005 Health Check | `SKIPPED` | Queue/verification contract covered; no physical metrics/result |
| TEST-006 Real screenshot | `SKIPPED` | Implementation stores PNG evidence; no PHONE-001 PNG supplied |
| TEST-007 Open App | `SKIPPED` | Verification implemented; no physical app/video evidence |
| TEST-008 Stop App | `SKIPPED` | Verification implemented; no physical app/video evidence |
| TEST-009 Push File/checksum | `SKIPPED` | End-to-end checksum implementation exists; no remote file evidence |
| TEST-010 Job Log | `SKIPPED` | Persistence contract exists; no physical command Job Log export |
| TEST-011 Duplicate protection | `SKIPPED` | Automated API contract passes; no live Agent execution count evidence |
| TEST-012 Retry count | `SKIPPED` | Automated contract verifies bounded retry logic; no physical failure run |
| TEST-013 Exhausted retry -> FAILED | `SKIPPED` | FAILED/DLQ implementation exists; no physical/live environment evidence |
| TEST-014 Backend restart persistence | `NOT_RUN` | Docker unavailable; before/after PostgreSQL comparison absent |
| TEST-015 Agent restart reconnect | `NOT_RUN` | ADB/Agent unavailable; timed reconnect evidence absent |
| TEST-016 WebSocket reconnect | `SKIPPED` | Client reconnection implemented; no live phone event after reconnect |
| TEST-017 AI state correlation | `SKIPPED` | Four-agent Job binding implemented; no physical Job correlation export |
| TEST-018 Dashboard no mock data | `PASS` | Static live-contract scan passed for dashboard, devices list/detail and AI Office |

## 5. Failure Injection Results

All physical/runtime failure injections are `NOT_RUN`: USB removal, USB debugging disabled, RSA denied, Agent stop, Backend restart, Redis restart, invalid installed package on phone, corrupted transfer, insufficient storage and duplicate live click

Reason: Docker and ADB commands are unavailable in the current environment and no physical PHONE-001 evidence was provided

## 6. Evidence Inventory

| Evidence | Status |
|---|---|
| API automated output | Result recorded: `42/42 passed` |
| Device Agent automated output | Result recorded: `6/6 passed` |
| TEST-018 static result | `PASS` |
| `adb devices -l` output | Missing |
| PHONE-001 registration/heartbeat logs | Missing |
| Per-test physical `result.json` | Missing for TEST-001..017 |
| Real screenshot PNG/checksum | Missing |
| Database exports before/after restart | Missing |
| Docker compose/migration evidence | Missing |
| Device/API/queue/WebSocket logs | Missing |
| Video demonstration | Missing |

## 7. Next Acceptance Run

1. Install/start Docker Desktop and Android Platform Tools
2. Set `DEVICE_CODE=PHONE-001`, `SIMULATOR_MODE=false`, optional `ANDROID_DEVICE_SERIAL` and real `TARGET_ANDROID_PACKAGE`
3. Start Docker core services and host Device Agent
4. Run physical live contract with `RUN_LIVE_ONE_DEVICE=1`
5. Perform manual TEST-003, 004, 014 and 015
6. Run all failure injections and Fresh Docker Deployment
7. Store evidence and recalculate verdict

## 8. Final Verdict

`SINGLE_DEVICE_NOT_READY`
