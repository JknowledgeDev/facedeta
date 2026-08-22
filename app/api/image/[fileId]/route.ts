import { NextRequest, NextResponse } from 'next/server'
import { downloadFileAsBuffer, getThumbnailBuffer } from '@/lib/drive'
import { toJpegBuffer } from '@/lib/image-utils'
import { cacheTierInBackground, findCachedUrl, toFullJpeg, THUMB_SIZE, type Tier } from '@/lib/thumbs'

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
  // ไฟล์ที่ต้องแปลงเป็น JPEG ตอนส่ง (HEIC/RAW) → เปลี่ยนนามสกุลเป็น .jpg
  const downloadName = rawName.replace(/\.(heic|heif|cr3|cr2)$/i, '.jpg').replace(/[^\w.\-]/g, '_')

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'image/jpeg',
      // browser 1 วัน + Vercel edge cache 1 ปี (รูปไม่เปลี่ยน) → ครั้งต่อไปไม่ต้องเรียก Drive
      'Cache-Control': 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800',
    }

    // ระดับที่ต้องการ: ดาวน์โหลด → ต้นฉบับเต็ม, ขนาดใหญ่ → 2000px, เล็ก → 500px
    const tier: Tier = isDownload ? 'original' : width > THUMB_SIZE + 100 ? 'display' : 'thumb'

    // ── 1) สำเนาบน Supabase CDN (ที่เก็บรูปจริงของระบบ — Drive อาจถูกลบหลัง sync)
    //    redirect ให้ browser โหลดตรงจาก CDN (เร็ว, ไม่ผ่าน serverless)
    const cached = await findCachedUrl(fileId, tier)
    if (cached) {
      // Supabase รองรับ ?download=<ชื่อไฟล์> → ส่งเป็น attachment ให้ผู้ปกครองเซฟได้
      const target = isDownload ? `${cached}?download=${encodeURIComponent(downloadName)}` : cached
      return new NextResponse(null, {
        status: 302,
        headers: {
          Location: target,
          // browser cache redirect 1 วัน + Vercel edge 1 ปี → ครั้งต่อไปไม่ต้อง HEAD storage
          'Cache-Control': 'public, max-age=86400, s-maxage=31536000',
        },
      })
    }

    // ── 2) ยังไม่มีสำเนา (รูปเก่าที่ยังไม่ backfill): ดึงจาก Google Drive แล้วเติม cache
    if (!isDownload) {
      // thumbnailLink จาก Google — เร็ว ไม่ต้องดาวน์โหลดไฟล์เต็ม/แปลง HEIC
      const thumb = await getThumbnailBuffer(fileId, width)
      if (thumb) {
        cacheTierInBackground(tier, fileId, thumb)
        return new NextResponse(thumb as unknown as BodyInit, { status: 200, headers })
      }
    }

    // ดาวน์โหลดไฟล์เต็มจาก Drive
    const raw = await downloadFileAsBuffer(fileId)
    if (isDownload) {
      // ต้นฉบับเต็มความละเอียด (JPG = ไฟล์เดิมทุก byte, HEIC/RAW → JPEG q92)
      const full = await toFullJpeg(raw)
      cacheTierInBackground('original', fileId, full)
      headers['Content-Disposition'] = `attachment; filename="${downloadName}"`
      return new NextResponse(full as unknown as BodyInit, { status: 200, headers })
    }
    const jpeg = await toJpegBuffer(raw, width)
    cacheTierInBackground(tier, fileId, jpeg)
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
