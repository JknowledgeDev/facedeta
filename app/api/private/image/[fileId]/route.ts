import { NextRequest, NextResponse } from 'next/server'
import { isUnlocked } from '@/lib/auth'
import { privateSignedUrl, type Tier } from '@/lib/thumbs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * รูปของโซนส่วนตัว — ตรวจ cookie ผู้ดูแลก่อนเสมอ แล้ว redirect ไป signed URL อายุ 1 ชม.
 * (bucket ไม่ public → ไม่มี cookie = เปิดรูปไม่ได้ แม้รู้ id ไฟล์)
 * ?tier=thumb|display|original  &download=1&name=<ชื่อไฟล์>
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  if (!isUnlocked(req)) {
    return NextResponse.json({ error: 'locked' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })
  }

  const { fileId } = params
  if (!fileId || !/^[a-zA-Z0-9_-]{10,}$/.test(fileId)) {
    return NextResponse.json({ error: 'Bad fileId' }, { status: 400 })
  }

  const isDownload = req.nextUrl.searchParams.get('download') === '1'
  const tParam = req.nextUrl.searchParams.get('tier')
  const tier: Tier = isDownload ? 'original' : tParam === 'display' ? 'display' : tParam === 'original' ? 'original' : 'thumb'

  const rawName = req.nextUrl.searchParams.get('name') ?? `photo_${fileId.slice(0, 8)}`
  const downloadName = rawName.replace(/\.(heic|heif|cr3|cr2|arw|rw2|nef|dng|png|webp|tiff?)$/i, '.jpg').replace(/[^\w.\-]/g, '_')

  const url = await privateSignedUrl(fileId, tier, isDownload ? downloadName : undefined)
  if (!url) {
    return NextResponse.json({ error: 'File not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: url,
      // จำ redirect ไว้ในเครื่องผู้ใช้ 30 นาที (สั้นกว่าอายุ signed URL) — ห้าม cache ที่ edge
      'Cache-Control': 'private, max-age=1800',
    },
  })
}
