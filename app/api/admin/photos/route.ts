import { NextResponse } from 'next/server'
import { getAdminPhotoList } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * รายการรูปทั้งหมดสำหรับหน้าจัดการ (ลบรูป) — อัพเข้าระบบล่าสุดอยู่บนสุด
 * รูปแบบย่อ: events เป็นตารางชื่อ แต่ละรูปอ้างอิงด้วย index
 * [id, name, eventIdx, date, uploadedAt, faceCount]
 */
export async function GET() {
  try {
    const photos = await getAdminPhotoList()

    const events: string[] = []
    const eventIdx = new Map<string, number>()
    const compact: [string, string, number, string, string, number][] = photos.map((p) => {
      let e = -1
      if (p.eventName) {
        const found = eventIdx.get(p.eventName)
        if (found === undefined) { e = events.length; events.push(p.eventName); eventIdx.set(p.eventName, e) }
        else e = found
      }
      return [p.id, p.name, e, p.date, p.uploadedAt, p.faceCount]
    })

    return NextResponse.json(
      { events, photos: compact, total: photos.length },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
