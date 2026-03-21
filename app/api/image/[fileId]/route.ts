import { NextRequest, NextResponse } from 'next/server'
import { downloadFileAsBuffer } from '@/lib/drive'
import { toJpegBuffer } from '@/lib/image-utils'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const { fileId } = params

  if (!fileId) {
    return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })
  }

  try {
    const raw = await downloadFileAsBuffer(fileId)

    // แปลงเป็น JPEG (รองรับ HEIC) + resize ให้พอดีแสดงผล
    const jpeg = await toJpegBuffer(raw, 1200)

    return new NextResponse(jpeg as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        // Cache ใน browser 1 ชั่วโมง
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error('Image proxy error:', err)
    return NextResponse.json({ error: 'Failed to load image' }, { status: 500 })
  }
}
