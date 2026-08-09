# PHASE 1 — Single Device MVP Architecture

## 1. Scope and Current Verdict

- ระบบระยะนี้รองรับโทรศัพท์ Android จริงเพียงหนึ่งเครื่อง โดยใช้ `deviceCode` เท่ากับ `PHONE-001`
- ห้ามเปิดขอบเขตหลายเครื่องจนกว่า `TEST-001` ถึง `TEST-018` และ Fresh Docker Deployment จะผ่าน
- Simulator ถูกปิดสำหรับ PHASE 1 และใช้เป็นหลักฐานตรวจรับไม่ได้
- Automated contract tests ยืนยันโครงสร้างและ logic สำคัญแล้ว แต่ยังไม่มีหลักฐานจากโทรศัพท์จริง
- Final Verdict ปัจจุบัน: `SINGLE_DEVICE_NOT_READY`

## 2. Runtime Flow

```text
Web Dashboard
  -> Backend API
  -> PostgreSQL
  -> Redis + BullMQ
  -> Device Agent ผ่าน WebSocket
  -> ADB
  -> PHONE-001

PHONE-001
  -> ADB result
  -> Device Agent
  -> Backend API / WebSocket
  -> PostgreSQL + MinIO
  -> WebSocket events
  -> Dashboard
```

| Component | Implementation |
|---|---|
| Web Dashboard | Next.js ใน `apps/web`; `/dashboard`, `/devices`, `/devices/PHONE-001` และ `/ai-office` โหลด API จริงและรับ WebSocket โดยไม่มี production mock data |
| Backend API | NestJS ใน `apps/api`; global prefix `/api/v1`; Swagger ที่ `/api/docs` |
| Database | PostgreSQL + Prisma; baseline migration และ `20260728000200_single_device_mvp` |
| Queue | BullMQ queue `farm-phone-jobs`; worker อยู่ใน API; attempts สูงสุด 3, exponential backoff 5 วินาที และ DLQ `farm-phone-dead-letter` |
| Storage | MinIO เก็บไฟล์ PUSH_FILE และ screenshot evidence พร้อม metadata/checksum |
| Device Agent | Node.js ใน `apps/device-agent`; แนะนำรันบน host ที่ต่อ USB/ADB โดยตรง |
| WebSocket | Socket.IO ส่ง command ไป Agent และส่ง `deviceUpdate`, `jobUpdate`, `agentState` กลับ UI |
| Offline monitor | Backend ใช้ scheduler tick ทุก 5 วินาที, sync ADB ทุก 60 วินาที และตั้ง `OFFLINE` เมื่อ heartbeat เก่ากว่า `DEVICE_OFFLINE_TIMEOUT_MS` ซึ่ง default 180 วินาที |

## 3. Single Device Identity

Device Agent ทำงานดังนี้:

1. เรียก `adb version` และ `adb devices -l`
2. เก็บสถานะ `device`, `unauthorized`, `offline` เพื่อรายงานข้อผิดพลาดจริง
3. ถ้ากำหนด `ANDROID_DEVICE_SERIAL` จะเลือก serial นั้นเท่านั้น
4. ถ้าไม่กำหนด serial และพบอุปกรณ์พร้อมใช้หนึ่งเครื่อง จะเลือกเครื่องนั้น
5. ถ้าพบอุปกรณ์พร้อมใช้มากกว่าหนึ่งเครื่อง จะหยุดด้วย `CONFIGURATION_ERROR`
6. ไม่สร้าง serial ปลอมและไม่ hardcode serial
7. ลงทะเบียนอุปกรณ์ด้วย `DEVICE_CODE=PHONE-001`
8. อ่าน manufacturer, model, Android version, battery, storage และ uptime จาก ADB
9. เรียก `POST /api/v1/devices` เพื่อ upsert record
10. เริ่ม heartbeat ทุก `HEARTBEAT_INTERVAL_MS=5000`

ตัวแปรบังคับสำหรับ PHASE 1:

```env
DEVICE_CODE=PHONE-001
ANDROID_DEVICE_SERIAL=
SIMULATOR_MODE=false
```

Registration ใช้ header `x-device-agent-token` และ payload รูปแบบปัจจุบัน:

```json
{
  "organizationId": "default-org",
  "code": "PHONE-001",
  "name": "<manufacturer> <model>",
  "nodeId": "NODE-A",
  "adbStatus": "CONNECTING|ONLINE|WARNING|ERROR",
  "agentVersion": "1.0.0",
  "serialNumber": "<discovered-by-adb>",
  "manufacturer": "<manufacturer>",
  "model": "<model>",
  "androidVersion": "<version>",
  "batteryLevel": 80,
  "storageUsed": 1000000000,
  "storageTotal": 10000000000,
  "uptimeSeconds": 1234
}
```

## 4. Device State and Heartbeat

| State | Source |
|---|---|
| `CONNECTING` | Agent เริ่มต้นและยังลงทะเบียน/heartbeat ไม่ครบ |
| `ONLINE` | ADB state เป็น `device`, heartbeat ปกติ และไม่มี active job/warning |
| `BUSY` | `currentJobId` มีค่าและ Agent กำลัง execute command |
| `WARNING` | Battery ต่ำกว่าหรือเท่ากับ `BATTERY_WARNING_LEVEL` หรือ storage used ถึง `STORAGE_WARNING_PERCENT` |
| `ERROR` | ADB unauthorized, configuration error หรือ command failure |
| `OFFLINE` | Backend ไม่ได้รับ heartbeat เกิน `DEVICE_OFFLINE_TIMEOUT_MS` |

Heartbeat ถูกส่งทุก 5 วินาทีไปยัง:

```http
POST /api/v1/devices/PHONE-001/heartbeat
x-device-agent-token: <DEVICE_AGENT_TOKEN>
Content-Type: application/json
```

```json
{
  "deviceCode": "PHONE-001",
  "serialNumber": "<adb-serial>",
  "status": "ONLINE",
  "batteryLevel": 80,
  "storageUsed": 1000000000,
  "storageTotal": 10000000000,
  "androidVersion": "14",
  "model": "<model>",
  "currentJobId": null,
  "agentVersion": "1.0.0",
  "timestamp": "<ISO-8601>"
}
```

Backend รับ heartbeat ทุก 5 วินาทีและ emit `deviceUpdate` ทันที แต่บันทึก `devices.lastHeartbeatAt` ทุก 60 วินาที และสร้าง immutable `device_heartbeats` ทุก 5 นาทีเพื่อลด Firestore quota การเปลี่ยนสถานะสำคัญจะบันทึกทันที ส่วน watchdog ใน `DeviceOfflineMonitorService` ตรวจตามช่วงที่กำหนดและ emit `DEVICE_OFFLINE` เมื่อ timeout เมื่อ heartbeat กลับมา status จริงจาก Agent จะทำให้อุปกรณ์กลับเป็น `ONLINE`, `WARNING`, `BUSY` หรือ `ERROR` โดยอัตโนมัติ

## 5. Command and Queue Contract

คำสั่งทั้งหมดเข้าผ่าน endpoint เดียวและต้องผ่าน BullMQ:

```http
POST /api/v1/devices/PHONE-001/commands
Authorization: Bearer <JWT>
Idempotency-Key: <stable-unique-key>
Content-Type: application/json

{
  "command": "HEALTH_CHECK",
  "parameters": {}
}
```

คำสั่งที่รองรับ:

- `HEALTH_CHECK`
- `SCREENSHOT`
- `OPEN_APP`
- `STOP_APP`
- `PUSH_FILE`
- `REBOOT_DEVICE`

ลำดับงาน:

```text
CREATED -> QUEUED -> ASSIGNED -> RUNNING -> VERIFYING -> SUCCESS
                                                \-> FAILED
Any non-terminal state -> CANCELLED
```

- `Idempotency-Key` ซ้ำจะคืน Job เดิมและไม่ enqueue ซ้ำ
- command ชนิดเดียวกันที่ยัง active บนอุปกรณ์เดียวกันจะคืน Job เดิมด้วยเหตุผล `COMMAND_ALREADY_ACTIVE`
- Queue ใช้ `maxAttempts=3`, exponential backoff เริ่มที่ 5 วินาที และไม่ retry แบบไม่จำกัด
- ทุก attempt บันทึก `attemptNumber`, `errorCode`, `errorMessage`, ADB output และ timestamp ใน `job_logs`
- attempt สุดท้ายที่ล้มเหลวเปลี่ยน Job/DeviceCommand เป็น `FAILED` และสร้าง DLQ entry
- Frontend ไม่เรียก ADB โดยตรง

## 6. Command Verification

| Command | Execution and verification |
|---|---|
| `HEALTH_CHECK` | ตรวจ ADB, authorization, Android, battery, storage, uptime, target app และ Agent socket; คืน `PASS`, `WARNING` หรือ `FAIL` |
| `SCREENSHOT` | ใช้ `exec-out screencap -p`; ตรวจ PNG/checksum; Backend เก็บ MinIO URL และ `uploaded_files` ที่ผูก Job |
| `OPEN_APP` | ใช้ package จาก parameters หรือ `TARGET_ANDROID_PACKAGE`; ตรวจ package ก่อนเปิดและยืนยัน PID/activity หลังเปิด |
| `STOP_APP` | ใช้ `am force-stop`; ยืนยันว่า `pidof` ไม่คืน process |
| `PUSH_FILE` | Backend เก็บไฟล์และ SHA-256; Agent ดาวน์โหลด, `adb push` ไป `/sdcard/Download/FarmPhone/`, แล้วเทียบ size และ checksum ปลายทาง |
| `REBOOT_DEVICE` | สั่ง reboot, รอ device reconnect และยืนยัน `sys.boot_completed=1` ภายใน timeout |

## 7. Current API Reference

Base URL: `http://localhost:3001/api/v1`  
Swagger: `http://localhost:3001/api/docs`

| Method | Path | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/devices` | JWT | รายการอุปกรณ์; PHASE 1 service คืนเฉพาะ `PHONE-001` |
| `GET` | `/devices/PHONE-001` | JWT | Device aggregate พร้อม heartbeats, commands, jobs, logs และ uploaded files ล่าสุด |
| `POST` | `/devices` | `x-device-agent-token` | Register/upsert `PHONE-001` |
| `PATCH` | `/devices/PHONE-001` | `x-device-agent-token` | อัปเดต metadata/status ที่อนุญาต |
| `POST` หรือ `PATCH` | `/devices/PHONE-001/heartbeat` | `x-device-agent-token` | บันทึก telemetry และ heartbeat history |
| `POST` | `/devices/PHONE-001/commands` | JWT + `OPERATOR` | สร้าง persisted command/job และ enqueue |
| `GET` | `/devices/files/:fileId/download` | `x-device-agent-token` | Device Agent ดาวน์โหลด PUSH_FILE payload |
| `GET` | `/jobs/:jobId` | JWT | อ่าน Job พร้อม result/log/evidence |
| `GET` | `/jobs/dead-letters` | JWT + `OPERATOR` | อ่าน DLQ |
| `POST` | `/jobs/dead-letters/:id/retry` | JWT + `OPERATOR` | ส่ง DLQ item กลับ main queue แบบ explicit |

Development loopback มี local principal สำหรับ Dashboard/test convenience ส่วน production ต้องใช้ JWT จริงและตั้ง token/secret ที่ปลอดภัย

## 8. WebSocket and Dashboard

- Agent เชื่อม Socket.IO ด้วย `auth.token` และ `auth.nodeId`
- Agent ส่ง `agent:register` หลัง connect/reconnect
- Backend ส่ง `device:command`; Agent ตอบ `device:response`
- Backend correlate response ด้วย `jobId`, persist result, verify และ emit `jobUpdate`
- Dashboard ฟัง `deviceUpdate`, `jobUpdate`, `agentState`; เมื่อ reconnect จะ refetch persisted state
- `/devices/PHONE-001` แสดง identity, ADB/device state, battery, storage, heartbeat, current/last job, screenshot, logs และปุ่มครบ 6 คำสั่ง
- `/devices`, `/dashboard` และ `/ai-office` ใช้ API/WebSocket จริง ไม่มี mock fixtures สำหรับ PHONE-001

## 9. AI Office MVP

หน้า `/ai-office` จำกัดขอบเขตการแสดงผลเป็น:

| Agent | Binding |
|---|---|
| `16bit.MANAGER` | สร้าง Device Task จาก command จริง |
| `16bit.DEVICE` | ติดตามการ execute command ของ PHONE-001 |
| `16bit.QA` | ผูกกับช่วง VERIFYING และผล SUCCESS/ERROR |
| `16bit.LOG` | ติดตาม persisted Job Logs และ Agent Events |

State ที่แสดงมาจาก backend records/events ไม่ใช่ animation จำลอง: `IDLE`, `THINKING`, `WORKING`, `WAITING`, `SUCCESS`, `WARNING`, `ERROR`

## 10. Database Boundary

Migration `20260728000200_single_device_mvp` เพิ่ม fields และตารางเฉพาะ:

- `devices`: serial, manufacturer, storage bytes, agent version และ current job
- `jobs`: parameters, result, attempts, maxAttempts และ idempotency key ที่ unique
- `device_heartbeats`
- `device_commands`
- `job_logs`
- `uploaded_files`
- ตารางเดิมที่ใช้ร่วมกัน: `ai_agents`, `agent_tasks`, `agent_events`, `audit_logs`

Docker API container รัน `npx prisma migrate deploy` ก่อนเริ่ม `node dist/main.js` จึง apply baseline และ Single Device migration อัตโนมัติเมื่อ database พร้อม

## 11. Evidence Requirement

หลักฐานตรวจรับต้องอยู่ใต้ `docs/evidence/PHONE-001/` และมาจากโทรศัพท์จริง ประกอบด้วย per-test `result.json`, system versions, Docker/migration status, Device/API/queue/WebSocket logs, database exports, screenshot PNG, checksums และวิดีโอสาธิต
