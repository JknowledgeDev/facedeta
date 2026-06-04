import { NextRequest, NextResponse } from 'next/server'
import { getPhotoCalendar } from '@/lib/drive'
import { getEventsByDate } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const folderId = req.nextUrl.searchParams.get('folderId') ?? undefined

    // ดึงพร้อมกัน: ปฏิทินรูปจาก Drive + ชื่อกิจกรรมจาก Supabase
    const [calendar, events] = await Promise.all([
      getPhotoCalendar(folderId),
      getEventsByDate(),
    ])

    return NextResponse.json({
      days: calendar.days,   // { "YYYY-MM-DD": count }
      events,                // { "YYYY-MM-DD": [eventName, ...] }
      total: calendar.total,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
