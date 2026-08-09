# FARM PHONE AI OFFICE

ระบบควบคุม Android ผ่าน Dashboard, Backend API, Redis/BullMQ, Device Agent และ ADB โดย Phase 1 จำกัดขอบเขตที่อุปกรณ์จริง `PHONE-001` หนึ่งเครื่องก่อน โครงสร้างแยกอุปกรณ์ด้วย `deviceCode` และ `nodeId` เพื่อให้ขยายเป็นหลายเครื่องได้ภายหลังโดยไม่ต้องเขียนระบบใหม่

## Runtime flow

```text
Dashboard -> NestJS API -> PostgreSQL + Redis/BullMQ
          -> Socket.IO -> Device Agent -> ADB -> PHONE-001

PHONE-001 -> Device Agent -> API -> PostgreSQL/MinIO
          -> Socket.IO -> Dashboard
```

Frontend ไม่เรียก ADB โดยตรง ทุกคำสั่งสร้าง Job ที่ persist ลง PostgreSQL และส่งผ่าน Queue ก่อน execute

## Requirements

- Node.js 20+ และ npm
- Docker Desktop พร้อม Docker Compose
- Android Platform Tools (`adb`) หรือกำหนด `ADB_PATH`
- Android จริงที่เปิด USB debugging และ authorize แล้ว
- แอปเป้าหมายที่ติดตั้งจริง พร้อม package name

## Install and configure

```powershell
npm ci
Copy-Item .env.example .env
npm run db:generate
```

ค่าบังคับสำหรับ single-device mode:

```env
DEVICE_CODE=PHONE-001
ANDROID_DEVICE_SERIAL=
TARGET_ANDROID_PACKAGE=
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
```

ห้าม hardcode serial หรือ package name ใน source code และต้องเปลี่ยน secrets ตัวอย่างก่อนใช้ production

## Start

### 1. ใช้ Firebase Mode (ไม่ต้องใช้ Docker)

ระบบรองรับการรันผ่าน **Firebase Firestore & Firebase Storage** โดยไม่ต้องเปิด Docker containers (`postgres`, `redis`, `minio`):

```powershell
# เริ่มต้น API และ Web Dashboard
npm run dev

# เริ่มต้น Device Agent บน Windows Host
npm run dev --workspace=@farm-phone/device-agent
```

### 2. ใช้ Docker Compose (Optional)

```powershell
docker compose -f docker/docker-compose.yml up -d --build postgres redis minio api web
docker compose -f docker/docker-compose.yml ps
```

จุดใช้งานหลัก:

- Dashboard: <http://localhost:3000>
- PHONE-001: <http://localhost:3000/devices/PHONE-001>
- AI Office: <http://localhost:3000/ai-office>
- API: <http://localhost:3001/api/v1>
- Swagger: <http://localhost:3001/api/docs>

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e:mock --workspace=@farm-phone/api
npm run test:single-device:automated
npm run build
```

Live contract ต้องรันเฉพาะเมื่อเชื่อมต่อโทรศัพท์จริงและ services/Device Agent พร้อม:

```powershell
$env:RUN_LIVE_ONE_DEVICE = "1"
$env:LIVE_PUSH_FILE_PATH = (Resolve-Path README.md)
node --env-file=.env --test tests/live-one-device.contract.mjs
```

ผล automated test ไม่แทนการทดสอบ manual สำหรับการถอด/เสียบ USB, restart service และ failure injection บนเครื่องจริง ห้ามประกาศ `SINGLE_DEVICE_READY` จนกว่าหลักฐานบังคับทั้งหมดจะผ่าน

## Documentation

- [Architecture](docs/SINGLE_DEVICE_ARCHITECTURE.md)
- [Setup](docs/SINGLE_DEVICE_SETUP.md)
- [Test plan](docs/SINGLE_DEVICE_TEST_PLAN.md)
- [Latest test report](docs/SINGLE_DEVICE_TEST_REPORT.md)
- [Known limitations](docs/SINGLE_DEVICE_KNOWN_LIMITATIONS.md)
- [Release checklist](docs/SINGLE_DEVICE_RELEASE_CHECKLIST.md)

