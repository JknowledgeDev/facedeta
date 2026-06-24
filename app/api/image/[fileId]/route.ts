import { NextRequest, NextResponse } from 'next/server'
import { downloadFileAsBuffer } from '@/lib/drive'
import { toJpegBuffer } from '@/lib/image-utils'

export const runtime = 'nodejs'

export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params

  if (!fileId) {
    return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })
  }

  // ?w=ความกว้าง (px) — thumbnail ใช้เล็ก, lightbox ใช้ใหญ่
  const wParam = parseInt(req.nextUrl.searchParams.get('w') ?? '', 10)
  const width = Number.isFinite(wParam) && wParam > 0 ? Math.min(wParam, 2400) : 1200
  // ?download=1 → ให้ browser ดาวน์โหลดไฟล์ (ผู้ปกครองเซฟรูปได้)
  const isDownload = req.nextUrl.searchParams.get('download') === '1'
  const rawName = req.nextUrl.searchParams.get('name') ?? `photo_${fileId.slice(0, 8)}`
  const downloadName = rawName.replace(/\.(heic|heif)$/i, '.jpg').replace(/[^\w.\-]/g, '_')

  try {
    const raw = await downloadFileAsBuffer(fileId)

    // แปลงเป็น JPEG (รองรับ HEIC) + resize ตามขนาดที่ขอ
    const jpeg = await toJpegBuffer(raw, width)

    const headers: Record<string, string> = {
      'Content-Type': 'image/jpeg',
      // cache ใน browser/CDN 1 วัน (รูปไม่เปลี่ยน)
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    }
    if (isDownload) {
      headers['Content-Disposition'] = `attachment; filename="${downloadName}"`
    }

    return new NextResponse(jpeg as unknown as BodyInit, { status: 200, headers })
  } catch (err: unknown) {
    const code = (err as { code?: number }).code
    const msg = err instanceof Error ? err.message : ''
    // ไฟล์ถูกลบ/เข้าถึงไม่ได้ใน Drive → ตอบ 404 เงียบๆ (เป็นเรื่องปกติ ไม่ต้อง log รก)
    if (code === 404 || /not found|notfound|insufficient/i.test(msg)) {
      return NextResponse.json({ error: 'File not found' }, {
        status: 404,
        headers: { 'Cache-Control': 'public, max-age=86400' },
      })
    }
    console.error('Image proxy error:', err)
    return NextResponse.json({ error: 'Failed to load image' }, { status: 500 })
  }
}
