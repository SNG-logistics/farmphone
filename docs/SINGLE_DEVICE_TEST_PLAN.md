# PHASE 1 — Single Device MVP Test Plan

Current verdict: `SINGLE_DEVICE_NOT_READY`

## 1. Test Policy

- Automated contract tests ตรวจ logic, persistence contract, retry, idempotency, watchdog และ production mock scan
- Mandatory acceptance ต้องใช้โทรศัพท์ Android จริงที่ลงทะเบียนเป็น `PHONE-001`; simulator ไม่ถือเป็นหลักฐาน
- `TEST-003`, `TEST-004`, `TEST-014` และ `TEST-015` ต้องมี manual action/restart แม้มีส่วน assertion อัตโนมัติ
- Tests อื่นสามารถใช้ live contract ช่วย automate ได้ แต่ต้องรันใน physical mode และเก็บ evidence
- Final verdict เปลี่ยนเป็น `SINGLE_DEVICE_READY` ได้เมื่อ TEST-001..018, failure injection ที่บังคับ และ Fresh Docker Deployment ผ่านทั้งหมดเท่านั้น

## 2. Automated Contract Baseline

| Suite | Command | Latest result | What it proves |
|---|---|---:|---|
| API E2E | `npm run test:e2e:mock --workspace=@farm-phone/api` | `42/42 passed` | API/queue/device broker/watchdog/RBAC/storage contracts ด้วย mocks/in-memory dependencies |
| Device Agent unit/contract | `npm test --workspace=@farm-phone/device-agent` | `6/6 passed` | ADB parsing, serial selection, ambiguity/unauthorized handling, telemetry status และ checksum |
| Live contract, physical disabled | `node --test tests/live-one-device.contract.mjs` | `TEST-018 passed`; physical tests skipped | Dashboard production source ไม่มี known mock patterns; ไม่พิสูจน์ ADB/phone |

Automated baseline ไม่สามารถแทน USB, ADB authorization, real screenshot, app state, filesystem checksum หรือ restart evidence จาก PHONE-001 ได้

## 3. Physical Test Preconditions

- `DEVICE_CODE=PHONE-001`
- `SIMULATOR_MODE=false`
- `ANDROID_DEVICE_SERIAL` ว่างเมื่อมีอุปกรณ์พร้อมใช้หนึ่งเครื่อง หรือเท่ากับ serial จริงเมื่อมีหลายเครื่อง
- `TARGET_ANDROID_PACKAGE` เป็นแอปที่ติดตั้งจริง
- Docker services, migrations, API, Web และ host Device Agent ทำงาน
- `adb devices -l` แสดง serial ที่เลือกเป็น `device`
- เตรียม `LIVE_PUSH_FILE_PATH` และบันทึก SHA-256 ต้นทาง
- เปิด browser ที่ `/devices/PHONE-001` และเครื่องมือบันทึกหน้าจอ/วิดีโอ

## 4. Mandatory Tests 001–018

| ID | Execution | Procedure and pass criteria | Evidence |
|---|---|---|---|
| TEST-001 | Live automated + physical | Start Agent; ADB detects selected serial; API has one `PHONE-001`; serial/manufacturer/model/version are real and serial is not simulated | Agent log, `adb devices -l`, device JSON, dashboard screenshot |
| TEST-002 | Live automated + UI | Observe at least three heartbeats approximately 5 seconds apart; `lastHeartbeatAt` and Dashboard update through `deviceUpdate` without refresh | heartbeat rows, WebSocket log/video |
| TEST-003 | Manual failure injection | Unplug USB/stop ADB path; within heartbeat timeout plus watchdog interval device becomes `OFFLINE`; no job remains stuck `RUNNING` | timed video, API/device events, DB row |
| TEST-004 | Manual recovery | Reconnect USB and authorize; Agent resumes; same Device record returns to `ONLINE`/`WARNING`, not a duplicate device | before/after device JSON and logs |
| TEST-005 | Live automated + physical | Queue `HEALTH_CHECK`; verify ADB, authorization, Android, battery, storage, uptime, app installation and Agent socket; terminal `SUCCESS` with `PASS` or accepted `WARNING` | Job/result/log JSON |
| TEST-006 | Live automated + visual | Queue `SCREENSHOT`; returned PNG must be captured from phone, stored in MinIO, linked to Job and visible on Dashboard | PNG, SHA-256, uploaded_file row, phone/dashboard comparison |
| TEST-007 | Live automated + visual | Queue `OPEN_APP`; target package exists and Agent confirms PID/activity; app is visibly foreground | Job result and video |
| TEST-008 | Live automated + visual | Queue `STOP_APP`; Agent force-stops and confirms no PID; app no longer running | Job result and video |
| TEST-009 | Live automated + physical filesystem | Upload file by Dashboard/API; Agent pushes under `/sdcard/Download/FarmPhone/`; source/destination size and SHA-256 match | source/remote hashes, Job and uploaded_file JSON |
| TEST-010 | Live automated | Completed command has persisted Job Logs including attempt number, transitions, errors/ADB output where applicable and timestamps | DB/API logs export |
| TEST-011 | Live automated | Submit same command twice with same `Idempotency-Key`; both responses reference one Job and one ADB execution | responses, queue/job records, Agent log |
| TEST-012 | Live automated failure | Use nonexistent package; BullMQ performs exactly 3 attempts with exponential backoff and logs each attempt | Job/log timing export |
| TEST-013 | Live automated failure | After attempt 3 Job and DeviceCommand become `FAILED`, error fields persist and DLQ entry exists; no automatic fourth attempt | Job, command and DLQ export |
| TEST-014 | Manual restart | Record IDs/results, restart Backend container, query again; PostgreSQL data and evidence metadata remain and no duplicate execution occurs | before/after exports and API logs |
| TEST-015 | Manual restart | Stop Agent, wait for `OFFLINE`, restart host Agent; same `PHONE-001` reconnects and heartbeat resumes | Agent logs, timed device events, DB comparison |
| TEST-016 | Live automated + network observation | Disconnect/reconnect Socket.IO client; connection recovers, persisted state refetches and later heartbeat/job events arrive | socket log and browser video |
| TEST-017 | Live automated + UI | A real Job creates/correlates only MVP display agents `16bit.MANAGER`, `16bit.DEVICE`, `16bit.QA`, `16bit.LOG`; states match Job outcome | Agent/task/event/job exports and AI Office screenshot |
| TEST-018 | Static automated + runtime reconciliation | Source has no known mock data/direct `/device-test` use; Dashboard values reconcile with API/database and controls use queued command endpoint | static output, API/DB comparison, dashboard screenshot |

Current mandatory status: TEST-018 automated static contract passed; TEST-001..017 have no accepted PHONE-001 physical evidence in this environment

## 5. Live Contract Command

```powershell
$env:RUN_LIVE_ONE_DEVICE = "1"
$env:API_URL = "http://localhost:3001/api/v1"
$env:WEB_URL = "http://localhost:3000"
$env:TARGET_ANDROID_PACKAGE = "com.example.target"
$env:LIVE_PUSH_FILE_PATH = "C:\path\to\test-file.bin"
node --test tests/live-one-device.contract.mjs
```

Live script currently automates TEST-001, 002, 005–013, 016, 017, 018 และสร้าง evidence manifest ส่วน TEST-003, 004, 014, 015 ต้องรันตาม procedure ด้านบนและเพิ่ม `result.json` เอง

## 6. Failure Injection Matrix

| Injection | Expected result | Pass condition |
|---|---|---|
| Unplug USB | `OFFLINE` / understandable disconnect error | Device changes within bounded timeout; active Job does not remain RUNNING indefinitely |
| Disable USB debugging | `ADB_UNAUTHORIZED` or ADB error | Agent/API show actionable error and never report ONLINE/SUCCESS incorrectly |
| Deny RSA authorization | `ADB_UNAUTHORIZED`, `ERROR` | No command executes and error is visible in logs/UI |
| Stop Device Agent | `OFFLINE` after timeout | Restart reconnects same device |
| Restart Backend | temporary WebSocket disconnect | PostgreSQL data persists and clients reconnect/refetch |
| Restart Redis | bounded queue failure/recovery | Accepted Job is not silently lost or duplicated |
| Invalid package | `FAILED` after bounded retries | No false OPEN_APP success; error code/message persist |
| Corrupted PUSH_FILE payload | checksum/size failure | No false success and destination discrepancy is logged |
| Insufficient destination storage | ADB/storage failure | No false success; Job exits RUNNING |
| Duplicate command/key | existing Job returned | Exactly one Queue item and one ADB execution |

## 7. Fresh Docker Deployment

1. Preserve existing evidence and record build identifier
2. Start PostgreSQL, Redis, MinIO, API and Web from repository images
3. Confirm API startup applies `prisma migrate deploy`
4. Confirm migration status includes baseline and `20260728000200_single_device_mvp`
5. Start one host Device Agent with simulator false
6. Register only `PHONE-001`
7. Run live contract and manual TEST-003, 004, 014, 015
8. Inspect `docker compose ps`, logs, database persistence and Dashboard
9. Record critical bugs, high bugs and mandatory failures

Do not start the `legacy-multi-device` profile during PHASE 1

## 8. Evidence Format

Store under `docs/evidence/PHONE-001/TEST-XXX/`. Each `result.json` must include:

```json
{
  "testId": "TEST-001",
  "status": "PASS",
  "deviceCode": "PHONE-001",
  "physicalDevice": true,
  "startedAt": "<ISO-8601>",
  "completedAt": "<ISO-8601>",
  "buildId": "<identifier>",
  "evidence": ["relative/path"],
  "notes": ""
}
```

Allowed status: `PASS`, `FAIL`, `BLOCKED`, `SKIPPED`, `NOT_RUN`. Only physical/manual-required tests with `physicalDevice=true` count toward final acceptance

Until every mandatory result is accepted, the verdict remains `SINGLE_DEVICE_NOT_READY`
