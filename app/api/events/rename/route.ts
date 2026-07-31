import { NextRequest, NextResponse } from 'next/server'
import { renameEvent } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// เปลี่ยนชื่อ/รวมกิจกรรม: { from: "medcamp", to: "Medcamp 2026" }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const from: string = (body.from ?? '').trim()
    const to: string = (body.to ?? '').trim()

    if (!from || !to) {
      return NextResponse.json({ error: 'ต้องระบุชื่อเดิมและชื่อใหม่' }, { status: 400 })
    }
    if (from === to) {
      return NextResponse.json({ error: 'ชื่อเดิมและชื่อใหม่เหมือนกัน' }, { status: 400 })
    }

    const updated = await renameEvent(from, to)
    return NextResponse.json({ updated })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
