import { NextResponse } from 'next/server'
import { ensureFaceList } from '@/lib/azure-face'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/train
 * AWS Rekognition ไม่ต้อง train — เรียก ensureFaceList เพื่อตรวจ collection
 */
export async function POST() {
  try {
    await ensureFaceList()
    return NextResponse.json({ message: 'Collection ready (AWS Rekognition ไม่ต้อง train)' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
