import { createHash, createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * ด่านรหัสผู้ดูแลฝั่ง server — ใส่รหัสถูก → ได้ cookie httpOnly ที่เซ็นด้วย HMAC
 * ทุก API ของโซนส่วนตัวตรวจ cookie นี้ (รูป <img> ก็ส่ง cookie ให้อัตโนมัติ)
 */
export const ADMIN_COOKIE = 'fd_admin'
export const ADMIN_COOKIE_MAX_AGE = 30 * 24 * 3600 // 30 วัน

/** รหัสผู้ดูแลมาจาก env เท่านั้น (ไม่เก็บในโค้ด) — ยังไม่ตั้ง = ปลดล็อกไม่ได้ */
function adminPassword(): string | null {
  const pw = process.env.ADMIN_PASSWORD
  return pw && pw.length > 0 ? pw : null
}

export function isPasswordConfigured(): boolean {
  return adminPassword() !== null
}

function sign(exp: number): string {
  // ผูกลายเซ็นกับรหัสปัจจุบัน → เปลี่ยนรหัสเมื่อไหร่ cookie เก่าใช้ไม่ได้ทันที
  const pwHash = createHash('sha256').update(adminPassword() ?? '').digest('hex')
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev-only')
    .update(`fd-admin:${exp}:${pwHash}`)
    .digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

export function checkPassword(pw: unknown): boolean {
  const expected = adminPassword()
  return expected !== null && typeof pw === 'string' && safeEqual(pw, expected)
}

export function makeAdminToken(): string {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_COOKIE_MAX_AGE
  return `${exp}.${sign(exp)}`
}

export function isUnlocked(req: NextRequest): boolean {
  const raw = req.cookies.get(ADMIN_COOKIE)?.value
  if (!raw) return false
  const [expStr, sig] = raw.split('.')
  const exp = parseInt(expStr, 10)
  if (!Number.isFinite(exp) || !sig || exp < Date.now() / 1000) return false
  if (!isPasswordConfigured()) return false
  return safeEqual(sig, sign(exp))
}
