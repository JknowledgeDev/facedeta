import { NextResponse } from 'next/server'
import { getGalleryPhotos } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60
// สำคัญ: GET ที่ไม่อ่าน request จะถูก Next.js cache แบบ static ตอน build
// → รูปที่ sync ใหม่จะไม่ขึ้นจนกว่าจะ redeploy — ต้อง force-dynamic
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // อ่านจาก Supabase (face_index) = รูปทั้งหมดจากทุกโฟลเดอร์/ทุก URL ที่เคย sync
    const photos = await getGalleryPhotos()

    // รูปแบบย่อ (v2): ส่งชื่อกิจกรรมครั้งเดียวเป็นตาราง แล้วแต่ละรูปอ้างอิงด้วย index
    // → payload เล็กลง ~3 เท่า (ชื่อกิจกรรมภาษาไทยไม่ต้องซ้ำ 2 หมื่นครั้ง)
    const events: string[] = []
    const eventIdx = new Map<string, number>()
    const compact: [string, string, number, string][] = photos.map((p) => {
      let e = -1
      if (p.eventName) {
        const found = eventIdx.get(p.eventName)
        if (found === undefined) { e = events.length; events.push(p.eventName); eventIdx.set(p.eventName, e) }
        else e = found
      }
      return [p.id, p.name, e, p.date]
    })

    return NextResponse.json(
      { v: 2, events, photos: compact, total: photos.length },
      {
        headers: {
          // Vercel edge cache 2 นาที + เสิร์ฟของเก่าระหว่าง refresh 10 นาที
          // → ผู้ใช้ส่วนใหญ่ได้รายการทันที, รูปใหม่โผล่ภายใน ~2 นาที
          'Cache-Control': 'public, max-age=0, s-maxage=120, stale-while-revalidate=600',
        },
      }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
