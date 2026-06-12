import { NextRequest, NextResponse } from 'next/server'
import { getAllPhotosSorted } from '@/lib/drive'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  try {
    const folderId = req.nextUrl.searchParams.get('folderId') ?? undefined

    // ดึงรูปทั้งหมด เรียงใหม่สุดก่อน (ตามชื่อไฟล์) — paginate ครบทุกหน้า
    const photos = await getAllPhotosSorted(folderId)

    return NextResponse.json({ photos, total: photos.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
