# PHASE 1 — Single Device MVP Setup

Current verdict: `SINGLE_DEVICE_NOT_READY` until the physical and Fresh Docker procedures in this guide produce complete evidence

## 1. Prerequisites

- Windows host ที่ติดตั้ง Node.js 20+ และ npm
- Docker Desktop พร้อม Docker Compose v2
- Android Platform Tools โดยคำสั่ง `adb` ต้องเรียกได้จาก PowerShell หรือกำหนด `ADB_PATH`
- โทรศัพท์ Android จริงหนึ่งเครื่อง เปิด Developer options และ USB debugging
- แอปเป้าหมายติดตั้งอยู่บนโทรศัพท์ และทราบ package name
- ใช้สาย USB ที่ส่งข้อมูลได้

ตรวจเครื่องมือ:

```powershell
node --version
npm --version
docker --version
docker compose version
adb version
```

ถ้า `docker` หรือ `adb` ไม่พบ ห้ามสรุปผล physical/fresh deployment ว่าผ่าน

## 2. Install and Configure

จาก repository root:

```powershell
npm install
Copy-Item .env.example .env
```

ค่าหลักใน `.env`:

```env
DATABASE_URL=postgresql://farmphone:farmphone_secret@localhost:5432/farm_phone
REDIS_URL=redis://:redis_secret@localhost:6379
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin_secret
MINIO_BUCKET=farm-phone-media
MINIO_USE_SSL=false

NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001

DEVICE_AGENT_TOKEN=<same-strong-token-on-api-and-agent>
NODE_ID=NODE-A
DEVICE_CODE=PHONE-001
ANDROID_DEVICE_SERIAL=
TARGET_ANDROID_PACKAGE=com.example.target
ADB_PATH=adb
SIMULATOR_MODE=false
HEARTBEAT_INTERVAL_MS=5000
DEVICE_HEARTBEAT_SNAPSHOT_INTERVAL_MS=60000
DEVICE_HEARTBEAT_HISTORY_INTERVAL_MS=300000
DEVICE_ADB_SYNC_INTERVAL_MS=60000
DEVICE_OFFLINE_CHECK_INTERVAL_MS=60000
DEVICE_OFFLINE_TIMEOUT_MS=180000
FIRESTORE_QUOTA_BACKOFF_MS=900000
FIRESTORE_QUOTA_BACKOFF_MAX_MS=3600000
BATTERY_WARNING_LEVEL=15
STORAGE_WARNING_PERCENT=90
PUSH_FILE_DESTINATION=/sdcard/Download/FarmPhone/
DEVICE_COMMAND_TIMEOUT_MS=60000
DEVICE_REBOOT_TIMEOUT_MS=120000
WORKER_CONCURRENCY=1
```

ข้อกำหนด:

- `DEVICE_CODE` ต้องเป็น `PHONE-001`
- `SIMULATOR_MODE` ต้องเป็น `false`
- `TARGET_ANDROID_PACKAGE` ต้องเป็น package ที่ติดตั้งจริงเพื่อทดสอบ HEALTH_CHECK, OPEN_APP และ STOP_APP
- `DEVICE_AGENT_TOKEN` ฝั่ง API และ Agent ต้องตรงกัน
- ถ้ามีโทรศัพท์พร้อมใช้มากกว่าหนึ่งเครื่อง ต้องกำหนด `ANDROID_DEVICE_SERIAL`

## 3. Prepare PHONE-001

1. เปิด Developer options และ USB debugging
2. ต่อโทรศัพท์ด้วย USB
3. กดยอมรับ RSA authorization บนหน้าจอโทรศัพท์
4. ตรวจสถานะ:

```powershell
adb devices -l
```

ผลที่ยอมรับต้องมีเพียง serial ที่เลือกและสถานะ `device` ไม่ใช่ `unauthorized` หรือ `offline`

ถ้ามีหลายเครื่อง:

```powershell
$env:ANDROID_DEVICE_SERIAL = "<serial-from-adb>"
adb -s $env:ANDROID_DEVICE_SERIAL get-state
adb -s $env:ANDROID_DEVICE_SERIAL shell getprop ro.product.manufacturer
adb -s $env:ANDROID_DEVICE_SERIAL shell getprop ro.product.model
adb -s $env:ANDROID_DEVICE_SERIAL shell pm path $env:TARGET_ANDROID_PACKAGE
```

ห้ามนำ serial ไป hardcode ใน source code

## 4. Start Infrastructure and Application

Docker Compose กำหนด PostgreSQL, Redis, MinIO, API และ Web เป็น default services ส่วน Device Agent อยู่ใน optional profile และ legacy worker อยู่ใน profile `legacy-multi-device`

```powershell
docker compose -f docker/docker-compose.yml up -d --build postgres redis minio api web
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs api --tail 200
```

API container รอ health checks ของ PostgreSQL, Redis และ MinIO จากนั้นรัน:

```text
cd packages/database && npx prisma migrate deploy && cd /app && node dist/main.js
```

ดังนั้น Fresh Docker Deployment จะ apply migration ทั้ง baseline และ `20260728000200_single_device_mvp` อัตโนมัติ ไม่ต้องใช้ `prisma migrate dev` ใน container

ตรวจ migration จาก host เมื่อ Docker พร้อม:

```powershell
npx prisma migrate status --schema packages/database/prisma/schema.prisma
```

URLs:

- Dashboard: `http://localhost:3000`
- Device page: `http://localhost:3000/devices/PHONE-001`
- AI Office: `http://localhost:3000/ai-office`
- API: `http://localhost:3001/api/v1`
- Swagger: `http://localhost:3001/api/docs`
- MinIO Console: `http://localhost:9001`

## 5. Start Device Agent on Host (Recommended)

การรัน Agent บน Windows host เป็นวิธีแนะนำ เพราะเข้าถึง USB และ ADB server โดยตรง:

```powershell
$env:API_URL = "http://localhost:3001"
$env:NODE_ID = "NODE-A"
$env:DEVICE_CODE = "PHONE-001"
$env:ANDROID_DEVICE_SERIAL = "<serial-from-adb-or-empty-if-exactly-one>"
$env:TARGET_ANDROID_PACKAGE = "com.example.target"
$env:DEVICE_AGENT_TOKEN = "<same-token-as-api>"
$env:ADB_PATH = "adb"
$env:SIMULATOR_MODE = "false"
$env:HEARTBEAT_INTERVAL_MS = "5000"
$env:DEVICE_HEARTBEAT_SNAPSHOT_INTERVAL_MS = "60000"
$env:DEVICE_HEARTBEAT_HISTORY_INTERVAL_MS = "300000"
$env:DEVICE_ADB_SYNC_INTERVAL_MS = "60000"
$env:DEVICE_OFFLINE_CHECK_INTERVAL_MS = "60000"
$env:DEVICE_OFFLINE_TIMEOUT_MS = "180000"
$env:FIRESTORE_QUOTA_BACKOFF_MS = "900000"
$env:FIRESTORE_QUOTA_BACKOFF_MAX_MS = "3600000"
npm run start --workspace=@farm-phone/device-agent
```

Agent ต้อง log ว่า register `PHONE-001` ด้วย serial ที่ ADB ตรวจพบ และต้องส่ง heartbeat ต่อเนื่องทุก 5 วินาที

### Optional container Agent

ใช้ได้เฉพาะเมื่อ host ADB server เปิดรับจาก container และ `ADB_SERVER_SOCKET=tcp:host.docker.internal:5037` ทำงานใน environment นั้น:

```powershell
docker compose -f docker/docker-compose.yml --profile device-agent up -d --build device-agent
docker compose -f docker/docker-compose.yml logs -f device-agent
```

สำหรับ Windows/USB acceptance ให้ใช้ host Agent เป็นค่าเริ่มต้นเพื่อลดปัญหา USB passthrough

## 6. Verify Registration and Heartbeat

ใน development loopback Dashboard/API ใช้ local development principal ได้ ส่วน production ต้อง login และส่ง Bearer token

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/devices/PHONE-001
Start-Sleep -Seconds 6
Invoke-RestMethod http://localhost:3001/api/v1/devices/PHONE-001
```

ตรวจว่า:

- `code` เป็น `PHONE-001`
- `serialNumber` ตรงกับ `adb devices -l`
- `lastHeartbeatAt` ใน Firestore เปลี่ยนประมาณทุก 60 วินาทีเพื่อลด quota; หน้าเว็บยังรับ realtime event ทุก 5 วินาที
- `adbStatus` มาจาก telemetry จริง
- หน้า `/devices/PHONE-001` อัปเดตโดยไม่ refresh

## 7. Command API

### JSON commands

```powershell
$headers = @{
  Authorization = "Bearer <JWT>"
  "Idempotency-Key" = "PHONE-001-HEALTH-001"
}

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:3001/api/v1/devices/PHONE-001/commands `
  -Headers $headers `
  -ContentType "application/json" `
  -Body '{"command":"HEALTH_CHECK","parameters":{}}'
```

เปลี่ยน `command` เป็น `SCREENSHOT`, `OPEN_APP`, `STOP_APP` หรือ `REBOOT_DEVICE` ได้ ตัวอย่าง package override:

```json
{
  "command": "OPEN_APP",
  "parameters": { "packageName": "com.example.target" }
}
```

ใช้ `Idempotency-Key` เดิมซ้ำเพื่อตรวจว่า API คืน Job ID เดิมและไม่ execute ซ้ำ

### PUSH_FILE multipart

PowerShell ใช้ `curl.exe` เพื่อให้ multipart behavior ชัดเจน:

```powershell
curl.exe -X POST "http://localhost:3001/api/v1/devices/PHONE-001/commands" `
  -H "Authorization: Bearer <JWT>" `
  -H "Idempotency-Key: PHONE-001-PUSH-001" `
  -F "command=PUSH_FILE" `
  -F 'parameters={"destination":"/sdcard/Download/FarmPhone/"}' `
  -F "file=@C:\path\to\test-file.bin"
```

ตรวจ Job จนเป็น terminal state:

```powershell
Invoke-RestMethod http://localhost:3001/api/v1/jobs/<jobId> -Headers @{ Authorization = "Bearer <JWT>" }
```

## 8. Automated Contract Tests

คำสั่งที่ใช้ตรวจ implementation โดยไม่แทนหลักฐานโทรศัพท์จริง:

```powershell
npm run test:e2e:mock --workspace=@farm-phone/api
npm test --workspace=@farm-phone/device-agent
node --test tests/live-one-device.contract.mjs
```

ผลล่าสุดที่บันทึกในเอกสารนี้:

- API: `42/42 passed`
- Device Agent: `6/6 passed`
- Live contract แบบไม่เปิด physical mode: `TEST-018 passed`; tests ที่ต้องใช้ PHONE-001 ถูก skip

## 9. Run Physical Contract

เมื่อติดตั้ง Docker/ADB, services พร้อม, Agent ทำงาน และมีไฟล์ทดสอบ:

```powershell
$env:RUN_LIVE_ONE_DEVICE = "1"
$env:API_URL = "http://localhost:3001/api/v1"
$env:WEB_URL = "http://localhost:3000"
$env:TARGET_ANDROID_PACKAGE = "com.example.target"
$env:LIVE_PUSH_FILE_PATH = "C:\path\to\test-file.bin"
node --test tests/live-one-device.contract.mjs
```

Script ครอบคลุม physical contract สำหรับ TEST-001, 002, 005–013, 016, 017 และ static TEST-018 ส่วน TEST-003, 004, 014 และ 015 ต้องทำ manual/restart procedure ตาม Test Plan

## 10. Stop and Preserve Data

หยุด services โดยไม่ลบ volumes:

```powershell
docker compose -f docker/docker-compose.yml down
```

ห้ามใช้ `down -v` ก่อน TEST-014 หรือก่อน export evidence เพราะจะลบ persistence ที่ต้องตรวจ

Completing setup alone does not change the verdict; only complete mandatory physical evidence can authorize `SINGLE_DEVICE_READY`
