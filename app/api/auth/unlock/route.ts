import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE, checkPassword, isPasswordConfigured, isUnlocked, makeAdminToken } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** สถานะปัจจุบัน: ปลดล็อกแล้วหรือยัง */
export async function GET(req: NextRequest) {
  return NextResponse.json({ unlocked: isUnlocked(req) }, { headers: { 'Cache-Control': 'no-store' } })
}

/** ใส่รหัส → ตั้ง cookie ปลดล็อก (หน้าจัดการ + โซนส่วนตัว) */
export async function POST(req: NextRequest) {
  if (!isPasswordConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'ยังไม่ได้ตั้งค่า ADMIN_PASSWORD บน server (Vercel → Settings → Environment Variables)' },
      { status: 503 }
    )
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown }
  if (!checkPassword(body.password)) {
    // หน่วงเล็กน้อยกันเดารหัสรัวๆ
    await new Promise((r) => setTimeout(r, 600))
    return NextResponse.json({ ok: false, error: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, makeAdminToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_COOKIE_MAX_AGE,
  })
  return res
}

/** ออกจากระบบ → ลบ cookie */
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}
