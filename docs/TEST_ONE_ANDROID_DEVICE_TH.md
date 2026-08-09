# ทดสอบโทรศัพท์ Android 1 เครื่อง

## สิ่งที่ต้องมี

- สาย USB ที่รับส่งข้อมูลได้
- โทรศัพท์ Android ที่เปิด Developer options และ USB debugging
- Android SDK Platform Tools ซึ่งมีไฟล์ `adb.exe`
- Docker Desktop สำหรับ PostgreSQL และ Redis

## 1. ตั้งค่า ADB

ติดตั้ง Platform Tools แล้วเลือกวิธีใดวิธีหนึ่ง:

1. เพิ่มโฟลเดอร์ Platform Tools ลง Windows PATH
2. หรือใส่ตำแหน่งเต็มใน `.env`

```env
ADB_PATH="C:\Android\platform-tools\adb.exe"
```

ตรวจจาก PowerShell:

```powershell
adb version
adb devices -l
```

ถ้าขึ้น `unauthorized` ให้ปลดล็อกโทรศัพท์และกดยอมรับ USB debugging

## 2. เปิดระบบ

```powershell
npm run docker:up
npm run db:generate
npm run db:migrate
npm run dev
```

เปิด `http://localhost:3000/devices`

## 3. ผลที่ควรเห็น

- สถานะ `1 Ready`
- รุ่นและ Serial ของโทรศัพท์
- Android version
- Battery
- Free storage
- Resolution

ทดลองปุ่มตามลำดับ:

1. ปลุกหน้าจอ
2. หน้า Home
3. ปิดหน้าจอ

คำสั่งทดสอบถูกจำกัดไว้เฉพาะสามคำสั่งนี้ และ API ใช้ได้เฉพาะ `localhost` ใน development mode

## 4. ถ้าไม่พบโทรศัพท์

1. เปลี่ยนสาย USB
2. เลือก USB mode เป็น File transfer
3. ปิดและเปิด USB debugging
4. ลบสิทธิ์ USB debugging เดิม แล้วเชื่อมใหม่
5. รัน `adb kill-server` และ `adb start-server`
6. ปิดและเปิด API ใหม่หลังแก้ `ADB_PATH`

## ขอบเขตของรอบทดสอบนี้

รอบนี้ตรวจการเชื่อมต่อและควบคุมพื้นฐานเท่านั้น ยังไม่อัปโหลดคลิป เปิดแอปโซเชียล หรือกดโพสต์จริง
