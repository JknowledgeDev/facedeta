import { NextResponse } from 'next/server'
import { getEventsByDate } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const events = await getEventsByDate()  // { "YYYY-MM-DD": [eventName] }
    return NextResponse.json({ events })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
