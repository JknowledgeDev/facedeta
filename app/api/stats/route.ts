import { NextResponse } from 'next/server'
import { getStats } from '@/lib/supabase'

export const runtime = 'nodejs'
// กัน Next.js cache แบบ static — ให้สถิติอัปเดตตามจริง
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stats = await getStats()
    return NextResponse.json(stats)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
