# PHONE-001 Live Acceptance Contract

คู่มือนี้ใช้ตรวจรับ Single Device MVP กับโทรศัพท์ Android จริง `PHONE-001` เท่านั้น ห้ามใช้ simulator เป็นหลักฐานสุดท้าย

## Prerequisites

1. ติดตั้งและเปิด Docker Desktop
2. ติดตั้ง Android Platform Tools และให้คำสั่ง `adb` อยู่ใน `PATH`
3. เปิด USB debugging ปลดล็อกหน้าจอ และกดยอมรับ RSA authorization บนโทรศัพท์
4. ตรวจว่า `adb devices -l` แสดงอุปกรณ์สถานะ `device`
5. คัดลอก `.env.example` เป็น `.env` และกำหนด `TARGET_ANDROID_PACKAGE`
6. ถ้ามีอุปกรณ์มากกว่าหนึ่งเครื่อง ให้กำหนด `ANDROID_DEVICE_SERIAL` จาก serial จริง
7. คงค่า `DEVICE_CODE=PHONE-001` และ `SIMULATOR_MODE=false`

## Start The System

เริ่ม PostgreSQL, Redis, MinIO, API และ Web Dashboard:

```powershell
docker compose -f docker/docker-compose.yml up -d postgres redis minio api web
```

เริ่ม Device Agent บนเครื่อง host เพื่อให้เข้าถึง USB/ADB ได้โดยตรง:

```powershell
npm ci
npm run dev --workspace @farm-phone/device-agent
```

ตรวจหน้า `http://localhost:3000/devices/PHONE-001` และรอให้ heartbeat จริงปรากฏ

## Automated Contract

ตรวจ contract ที่ไม่ต้องใช้โทรศัพท์:

```powershell
npm run test:single-device:automated
```

ตรวจระบบจริง โดยเปิด core services และ Device Agent ไว้ก่อน:

```powershell
$env:RUN_LIVE_ONE_DEVICE='1'
$env:API_URL='http://localhost:3001/api/v1'
$env:LIVE_PUSH_FILE_PATH='C:\fixtures\phone-001-test.bin'
npm run test:single-device:live
```

ชุด live test ตรวจ TEST-001, TEST-002, TEST-005 ถึง TEST-013, TEST-016, TEST-017 และ TEST-018 พร้อมสร้าง evidence manifest โดยไม่แทนที่การตรวจด้วยคน

## Manual Mandatory Tests

- `TEST-003`: ถอด USB จับเวลาไม่เกิน 15 วินาที และบันทึก Dashboard เปลี่ยนเป็น `OFFLINE`
- `TEST-004`: เสียบ USB กลับ ยอมรับ RSA ถ้าถูกถาม และบันทึกสถานะกลับเป็น `ONLINE`
- `TEST-014`: บันทึก Job ID ก่อน restart Backend แล้วตรวจ record เดิมหลังระบบกลับมา
- `TEST-015`: ปิด Device Agent เกิน 15 วินาที เปิดใหม่ และตรวจ heartbeat/WebSocket กลับมา

## Failure Injection

ทดสอบทีละเหตุการณ์: ปิด USB debugging, deny RSA, ปิด Agent, restart Backend, restart Redis, package ไม่พบ, ไฟล์เสียหาย, storage ไม่พอ และกดคำสั่งซ้ำ ทุกกรณีต้องจบเป็นสถานะที่อธิบายได้และต้องไม่ค้าง `RUNNING`

## Required Evidence

- Output จาก `adb devices -l`
- Screenshot หรือวิดีโอ Dashboard ที่แสดง serial และ heartbeat ของ `PHONE-001`
- PNG จากคำสั่ง `SCREENSHOT` พร้อม checksum และ Job ID
- Job/Job Log export ของคำสั่งทุกชนิด
- หลักฐาน remote size/checksum จาก `PUSH_FILE`
- หลักฐานก่อนและหลัง restart สำหรับ TEST-014 และ TEST-015
- Log ของ API, Device Agent, Redis/BullMQ และ WebSocket
- ผล Fresh Docker Deployment จากฐานข้อมูลและ volume ใหม่

## Verdict Rule

ห้ามเปลี่ยนผลเป็น `SINGLE_DEVICE_READY` จนกว่า TEST-001 ถึง TEST-018, failure injection ที่บังคับ และ Fresh Docker Deployment จะผ่านพร้อมหลักฐานจากโทรศัพท์จริงทั้งหมด

## Exact command coverage

The live contract exercises all required command contracts: `HEALTH_CHECK`, `SCREENSHOT`, `OPEN_APP`, `STOP_APP`, `RESTART_APP`, `PUSH_FILE`, `REBOOT_DEVICE`, `VIEW_DEVICE_STATUS`, `VIEW_JOB_LOG`, and `RUN_SINGLE_DEVICE_TEST`. The bundled push fixture deliberately uses a filename and destination with spaces, parentheses, a quote, and a semicolon to regression-test remote ADB shell quoting. Set `LIVE_PUSH_FILE_PATH` only when overriding that fixture.
