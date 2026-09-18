/**
 * FaceDeta NAS ingest — จุดเริ่มโปรแกรม
 * โหลด .env (ถ้ามีในโฟลเดอร์ปัจจุบัน) ก่อน import โค้ดหลัก เพราะ lib อ่าน env ตอน module load
 *
 * ใช้ตัวแปรชื่อเดียวกับ .env.local ของเว็บ (คัดลอกไฟล์มาวางเป็น .env ได้เลย):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PRIVATE_GOOGLE_REFRESH_TOKEN (ไว้เทียบไฟล์ซ้ำกับ Drive — ไม่บังคับ)
 * ตัวแปรเฉพาะ NAS (ตั้งใน docker-compose.yml):
 *   PHOTOS_ROOT, NAS_FOLDERS, NAS_SHARE_NAME, STATE_DIR, CONCURRENCY, POLL_MINUTES, INGEST_APPROVED
 */
import fs from 'fs'
import path from 'path'

for (const file of ['.env', '.env.local']) {
  const p = path.resolve(process.cwd(), file)
  if (!fs.existsSync(p)) continue
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const val = m[2].replace(/^["']|["']$/g, '').trim()
    if (process.env[m[1]] === undefined) process.env[m[1]] = val
  }
  break
}

await import('./pipeline')
