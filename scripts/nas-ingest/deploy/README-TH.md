# FaceDeta NAS ingest — ติดตั้งบน Synology DS925+

ตัวนี้จะกวาดรูปในโฟลเดอร์ที่กำหนดบน NAS แล้วส่งเข้า **โซนส่วนตัว** ของ FaceDeta โดยตรง
(เก็บเฉพาะรูปย่อ 2000px + 500px ในระบบ — ต้นฉบับอยู่บน NAS) และคอยดูรูปใหม่ให้ตลอดเวลา

## ไฟล์ในโฟลเดอร์นี้
| ไฟล์ | หน้าที่ |
|---|---|
| `nas-ingest.mjs` | โปรแกรมหลัก |
| `package.json` | รายการแพ็กเกจที่ต้องติดตั้ง (ติดตั้งเองอัตโนมัติตอนเริ่ม) |
| `docker-compose.yml` | การตั้งค่า container (โฟลเดอร์ที่กวาด, share ที่ mount) |
| `.env` | กุญแจเชื่อมต่อ Supabase / AWS / Google — **ต้องวางเอง** (ดูขั้นตอนที่ 2) |
| `state/` | สร้างเองตอนรัน: `scan-report.txt` (รายงาน), `ingest.log` (บันทึก), `state.json` (ความคืบหน้า) |

## ขั้นตอนติดตั้ง (ทำครั้งเดียว ~15 นาที)

1. **ติดตั้ง Container Manager** — DSM → Package Center → ค้นหา "Container Manager" → ติดตั้ง
2. **เตรียมไฟล์ .env** — เอาไฟล์ `.env.local` จากเครื่องคอมที่มีโปรเจกต์ FaceDeta (`D:\Facedeta\.env.local`)
   มาวางในโฟลเดอร์นี้ แล้ว **เปลี่ยนชื่อเป็น `.env`** (ตัวแปรชื่อเดียวกันหมด ไม่ต้องแก้อะไรข้างใน)
3. **อัพโหลดขึ้น NAS** — File Station → เข้า share `docker` (ถ้ายังไม่มี สร้าง shared folder ชื่อ `docker`)
   → สร้างโฟลเดอร์ `facedeta-nas` → อัพโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้เข้าไป (รวม `.env`)
4. **ตรวจ path share รูป** — เปิด `docker-compose.yml` ดูบรรทัด `/volume1/Marketing:/photos:ro`
   ถ้า share `Marketing` ของคุณอยู่ volume อื่น (เช่น `/volume2`) ให้แก้ให้ตรง
5. **สร้างโปรเจกต์** — Container Manager → Project → Create
   - Project name: `facedeta-nas`
   - Path: เลือกโฟลเดอร์ `docker/facedeta-nas`
   - Source: *Use existing docker-compose.yml*
   - Next → Done → รอสถานะ Running
6. **ดูรายงานสแกน** — รอ 5–10 นาที (ครั้งแรกติดตั้งแพ็กเกจ + สแกนไฟล์ทั้งหมด)
   แล้วเปิดไฟล์ `docker/facedeta-nas/state/scan-report.txt` ใน File Station
   จะเห็นจำนวนไฟล์ทั้งหมด จำนวนที่จะประมวลผล และ **ค่าใช้จ่ายประเมิน** (ค่า AWS ครั้งเดียว + พื้นที่ต่อเดือน)
   > ตอนนี้ยังไม่มีอะไรถูกส่งเข้าระบบ — เป็นการนับอย่างเดียว
7. **อนุมัติ** — ถ้าตกลงตามรายงาน: เปิดไฟล์ `.env` (Text Editor ใน File Station) เพิ่มบรรทัดท้ายสุด
   ```
   INGEST_APPROVED=yes
   ```
   บันทึก → Container Manager → Project `facedeta-nas` → **Stop** แล้ว **Start**
8. **ติดตามความคืบหน้า** — Container Manager → Container → `facedeta-nas-ingest` → Log
   หรือเปิดไฟล์ `state/ingest.log` (มีบรรทัดสรุปทุก 50 ไฟล์ พร้อมเวลาที่เหลือ)

หลังจากนั้นไม่ต้องทำอะไรอีก: NAS จะสแกนหารูปใหม่ทุก 30 นาทีและส่งเข้าระบบเอง
รูปที่เข้าแล้วจะดูได้ในเว็บหลังใส่รหัสผู้ดูแล (สวิตช์ 🔒 โซนส่วนตัว) โดยบนการ์ดรูปจะมี path บน NAS บอกไว้

## เรื่องที่ควรรู้
- **ไฟล์ซ้ำกับ Drive** (เคย sync จาก Drive แล้ว) จะถูกข้ามอัตโนมัติ ไม่เสียเงินซ้ำ — เทียบด้วย MD5 ของไฟล์
- **หยุด/เริ่มใหม่ได้ตลอด** ระบบจำว่าทำถึงไหน (ไฟล์ `state/state.json`) ไม่ทำซ้ำ
- **ไฟล์ที่เพิ่งคัดลอกลง NAS ไม่ถึง 2 นาที** จะรอรอบถัดไป (กันอ่านไฟล์ที่ยังคัดลอกไม่เสร็จ)
- **โฟลเดอร์ `@eaDir`, `#recycle`** ของ Synology ถูกข้ามอัตโนมัติ
- อยากเปลี่ยนโฟลเดอร์ที่กวาด: แก้ `NAS_FOLDERS` ใน `docker-compose.yml` → Stop/Start โปรเจกต์
- ไฟล์ `.env` มีกุญแจสำคัญ: เก็บไว้ใน share `docker` ที่จำกัดสิทธิ์เฉพาะ admin
