import { NextResponse } from 'next/server'
import { getEventsList } from '@/lib/supabase'

export const runtime = 'nodejs'
// กัน Next.js cache แบบ static — ให้เห็นกิจกรรมที่ sync ใหม่ทันที
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const events = await getEventsList()  // [{ name, dates, fileIds, count }]
    return NextResponse.json({ events })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
