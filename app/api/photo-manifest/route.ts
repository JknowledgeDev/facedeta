import { NextRequest, NextResponse } from 'next/server'
import { getAllPhotosSorted } from '@/lib/drive'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const folderId = req.nextUrl.searchParams.get('folderId') ?? undefined
    const photos = await getAllPhotosSorted(folderId)
    return NextResponse.json({ photos, total: photos.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
