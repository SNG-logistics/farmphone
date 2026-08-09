# PRIORITIZED EXECUTION ROADMAP & RICE MATRIX ANALYSIS

## 1. Priority Calculation Matrix (RICE Score = (R x I x C) / E)

- **Reach (R)**: จำนวนผู้ใช้/ลูกค้าที่ได้รับผลกระทบ (1-10)
- **Impact (I)**: ผลกระทบต่อรายได้และการเติบโต (0.5 = Low, 1.0 = Medium, 2.0 = High, 3.0 = Massive)
- **Confidence (C)**: ความมั่นใจในความสำเร็จ (50% = Low, 80% = Medium, 100% = High)
- **Effort (E)**: ระยะเวลาและทรัพยากรในการทำ (Person-Weeks/Days)

---

## 2. Priority Tiers Breakdown (ลำดับความสำคัญของงานทั้งหมด)

| Task Name | Description | Impact | Effort | RICE Score | Priority Tier | Execution Timeline |
| --- | --- | --- | --- | --- | --- | --- |
| **P0-1: Founding Customer Launch** | เปิดรับสมัคร Founding Customers 10 รายแรก (SNG Express & TikTok Shop) | Massive (3.0) | Low (1 wk) | **HIGH (24.0)** | 🔴 **Tier 1 (ทำทันที)** | Week 1 |
| **P0-2: Studio Landing Page & Demo** | เผยแพร่หน้าขายสินค้า Content Creator Studio UI สด | High (2.0) | Low (3 days) | **HIGH (18.0)** | 🔴 **Tier 1 (ทำทันที)** | Week 1 |
| **P0-3: 1-Device PHONE-001 Verification** | ทดสอบส่งวิดีโอเข้า PHONE-001 และยืนยัน Checksum จริง | High (2.0) | Low (2 days) | **HIGH (16.0)** | 🔴 **Tier 1 (ทำทันที)** | Week 1-2 |
| **P1-1: 30-Day Content Campaign** | โพสต์คอนเทนต์โปรโมตตามตาราง 30 วันบน TikTok & Facebook | High (2.0) | Med (2 wks) | **MED (12.0)** | 🟡 **Tier 2 (ทำถัดมา)** | Week 2-4 |
| **P1-2: LINE OA & Sales Outreach** | ติดต่อส่งสคริปต์เสนอขายให้กลุ่มเอเจนซี่และร้านค้า E-Commerce | High (2.0) | Med (1 wk) | **MED (10.0)** | 🟡 **Tier 2 (ทำถัดมา)** | Week 2-3 |
| **P1-3: Customer API Key Encryption UI** | หน้าระบบตั้งค่าบันทึก API Key แบบยึดตามองค์กร | Med (1.0) | Low (3 days) | **MED (8.0)** | 🟡 **Tier 2 (ทำถัดมา)** | Month 2 |
| **P2-1: ComfyUI Self-Hosted GPU Adapter** | การเชื่อมต่อ GPU Node สำหรับสลับใช้ AI Video Model | Med (1.0) | High (3 wks) | **LOW (4.0)** | 🔵 **Tier 3 (ทำทีหลัง)** | Month 3 |
| **P2-2: Multi-Device Scale (20 Devices)** | ขยายจำนวนโทรศัพท์ใน Farm เป็น 20 เครื่องพร้อม Hub | Med (1.0) | High (4 wks) | **LOW (3.0)** | 🔵 **Tier 3 (ทำทีหลัง)** | Month 3-4 |

---

## 3. Detailed Execution Roadmap (แผนงานทีละขั้นตอน)

### 🔴 Phase 1: Immediate Execution (สัปดาห์ที่ 1 - 2) — ส้นทางสร้างรายได้ด่วน (Quick Revenue)
1. **เผยแพร่ Landing Page & Demo**: ใช้ข้อความสคริปต์ขายจาก [`marketing/landing-page/LANDING_PAGE_COPY.md`](file:///c:/Users/acer/OneDrive/เดสก์ท็อป/farm%20phone/marketing/landing-page/LANDING_PAGE_COPY.md)
2. **เปิดรับ Founding Customers (10 สิทธิ์แรก)**: เสนอส่วนลด 50% และทดลองใช้ฟรี 5 คลิปแรกตาม [`marketing/LAUNCH_OFFER.md`](file:///c:/Users/acer/OneDrive/เดสก์ท็อป/farm%20phone/marketing/LAUNCH_OFFER.md)
3. **ทดสอบ PHONE-001 Live Integration**: รันคำสั่ง `POST /api/v1/jobs/single-device/PHONE-001` เพื่อย้ายไฟล์ MP4 สู่เครื่องจริง

### 🟡 Phase 2: Growth & Social Campaign (สัปดาห์ที่ 3 - 4) — สร้างการรับรู้และยอดขาย
1. **รันการตลาด 30 วัน**: โพสต์คลิปโปรโมตขนส่งไทย-ลาว SNG Express ตาม [`marketing/CONTENT_CALENDAR_30_DAYS.md`](file:///c:/Users/acer/OneDrive/เดสก์ท็อป/farm%20phone/marketing/CONTENT_CALENDAR_30_DAYS.md)
2. **ขายผ่าน LINE OA & Direct Outreach**: ส่งชุดข้อความเสนอขายตาม [`marketing/SALES_MESSAGE_LIBRARY.md`](file:///c:/Users/acer/OneDrive/เดสก์ท็อป/farm%20phone/marketing/SALES_MESSAGE_LIBRARY.md)
3. **เปิด TikTok & Meta Lead Ads**: ยิงโฆษณาหาพ่อค้าแม่ค้าออนไลน์ตาม [`marketing/PAID_ADS_PLAN.md`](file:///c:/Users/acer/OneDrive/เดสก์ท็อป/farm%20phone/marketing/PAID_ADS_PLAN.md)

### 🔵 Phase 3: Hardware & Infrastructure Scale (เดือนที่ 2 - 4) — ขยายระบบและประหยัดต้นทุน
1. **ขยายสู่ Multi-Device Farm (20 เครื่อง)**: เพิ่ม USB Hub และติดตั้ง ADB Node A/B สู่โทรศัพท์ 20 เครื่อง
2. **เปิดใช้ ComfyUI GPU Server**: สลับใช้ Self-hosted Video Model กรณีต้องการลดต้นทุน API คำนวณตาม [`marketing/PRICING_AND_UNIT_ECONOMICS.md`](file:///c:/Users/acer/OneDrive/เดสก์ท็อป/farm%20phone/marketing/PRICING_AND_UNIT_ECONOMICS.md)
