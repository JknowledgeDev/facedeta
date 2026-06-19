import { NextRequest, NextResponse } from 'next/server'
import { listAllImageFiles } from '@/lib/drive'

export const runtime = 'nodejs'
export const maxDuration = 300

// scan ต้นไม้โฟลเดอร์ทั้งหมด (รวมทุก subfolder) → คืนรายการไฟล์ id+name
export async function GET(req: NextRequest) {
  try {
    const folderId = req.nextUrl.searchParams.get('folderId') ?? undefined
    const files = await listAllImageFiles(folderId)
    return NextResponse.json({ files, total: files.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
