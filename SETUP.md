# SETUP GUIDE — FaceDeta

## 1. ติดตั้ง dependencies

```bash
npm install
```

---

## 2. ตั้งค่า Environment Variables

Copy ไฟล์ตัวอย่าง:
```bash
cp .env.local.example .env.local
```

---

## 3. รับ Google Drive Refresh Token

หลังจากได้ `client_id` และ `client_secret` จาก Google Cloud Console แล้ว รัน script นี้ใน Node:

```js
// get-refresh-token.js
const { google } = require('googleapis')
const readline = require('readline')

const CLIENT_ID = 'YOUR_CLIENT_ID'
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET'
const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob'

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)

const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/drive'],
})

console.log('เปิด URL นี้ใน browser:\n', url)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.question('\nวาง code ที่ได้มา: ', async (code) => {
  const { tokens } = await oauth2.getToken(code)
  console.log('\nrefresh_token:', tokens.refresh_token)
  rl.close()
})
```

```bash
node get-refresh-token.js
```

คัดลอก `refresh_token` ไปใส่ใน `.env.local`

---

## 4. ตั้งค่า Supabase

1. ไปที่ [supabase.com](https://supabase.com) → สร้าง Project ใหม่
2. เปิด **SQL Editor** แล้วรัน:

```sql
-- copy เนื้อหาจาก supabase/schema.sql มาวาง
```

3. ไปที่ **Settings → API** คัดลอก URL, anon key, service_role key

---

## 5. ตั้งค่า AWS Rekognition

1. เข้า [AWS Console](https://console.aws.amazon.com)
2. ไปที่ **IAM → Users → Create user**
3. Attach policy: `AmazonRekognitionFullAccess`
4. **Security credentials → Create access key** → เลือก "Application running outside AWS"
5. คัดลอก Access Key ID และ Secret Access Key

> Region แนะนำ: `ap-southeast-1` (Singapore) ใกล้ไทยที่สุด

---

## 6. รันในเครื่อง

```bash
npm run dev
```

เปิด http://localhost:3000

---

## 7. Deploy บน Vercel

```bash
# ติดตั้ง Vercel CLI
npm i -g vercel

# Deploy
vercel deploy --prod
```

หรือ Push ขึ้น GitHub แล้วเชื่อมกับ Vercel → auto deploy ทุกครั้งที่ push

> **สำคัญ:** ใส่ environment variables ทุกตัวใน Vercel Dashboard → Project Settings → Environment Variables

---

## โครงสร้างโปรเจกต์

```
facedeta/
├── app/
│   ├── layout.tsx          # Layout หลัก + Navbar
│   ├── page.tsx            # หน้าค้นหา
│   ├── globals.css
│   └── api/
│       ├── search/         # POST: ค้นหาใบหน้า
│       ├── index-face/     # POST: อัพโหลด + Index รูป
│       ├── sync-drive/     # POST: Sync รูปจาก Drive
│       └── stats/          # GET: สถิติ
├── components/
│   ├── DropZone.tsx        # Drag & drop upload
│   ├── ResultCard.tsx      # การ์ดแสดงผล
│   ├── StatsBar.tsx        # แถบสถิติ
│   └── ThresholdSlider.tsx # Slider ปรับความแม่นยำ
├── lib/
│   ├── rekognition.ts      # AWS Rekognition client
│   ├── drive.ts            # Google Drive client
│   └── supabase.ts         # Supabase client
├── supabase/
│   └── schema.sql          # SQL สำหรับสร้าง tables
└── .env.local.example      # ตัวอย่าง env vars
```
