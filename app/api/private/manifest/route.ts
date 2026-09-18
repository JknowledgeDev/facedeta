import { NextRequest, NextResponse } from 'next/server'
import { getGalleryPhotos } from '@/lib/supabase'
import { isUnlocked } from '@/lib/auth'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

/** รายการรูปโซนส่วนตัว (รูปแบบ v2 เดียวกับ /api/photo-manifest) — ต้องใส่รหัสแล้วเท่านั้น ห้าม cache */
export async function GET(req: NextRequest) {
  if (!isUnlocked(req)) {
    return NextResponse.json({ error: 'locked' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }
  try {
    const photos = await getGalleryPhotos('private')

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
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
