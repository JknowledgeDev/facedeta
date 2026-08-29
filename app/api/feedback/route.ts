import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'nodejs'

/**
 * เก็บ feedback "ไม่ใช่คนนี้" จากผู้ปกครอง (แบบ Waldo/Zenfolio)
 * เก็บเป็นไฟล์ JSON ใน Storage bucket ส่วนตัว "feedback" — ใช้วัดความแม่นจริง
 * และปรับ threshold ในอนาคต (ไม่ต้องสร้างตารางใหม่)
 */
let bucketReady: Promise<void> | null = null
function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const supabase = getSupabaseAdmin()
      const { data } = await supabase.storage.listBuckets()
      if (!(data ?? []).some((b) => b.name === 'feedback')) {
        await supabase.storage.createBucket('feedback', { public: false })
      }
    })().catch(() => { bucketReady = null })
      .then(() => undefined) as Promise<void>
  }
  return bucketReady
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const driveFileId: string = body.driveFileId ?? ''
    if (!driveFileId) return NextResponse.json({ error: 'missing driveFileId' }, { status: 400 })

    const entry = {
      at: new Date().toISOString(),
      verdict: 'not_match',
      driveFileId,
      confidence: body.confidence ?? null,
      threshold: body.threshold ?? null,
      verified: body.verified ?? null,
      eventName: body.eventName ?? null,
    }

    await ensureBucket()
    const supabase = getSupabaseAdmin()
    const path = `${entry.at.slice(0, 10)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`
    await supabase.storage.from('feedback').upload(path, JSON.stringify(entry), {
      contentType: 'application/json',
    })

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    // feedback เป็น best-effort — อย่าทำให้ผู้ใช้สะดุด
    console.warn('feedback error:', err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false })
  }
}
