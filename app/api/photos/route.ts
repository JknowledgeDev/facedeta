import { NextRequest, NextResponse } from 'next/server'
import { listImagesInFolder, getDriveThumbnailUrl, getDriveViewUrl } from '@/lib/drive'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const pageToken = searchParams.get('pageToken') ?? undefined
    const folderId = searchParams.get('folderId') ?? undefined

    const { files, nextPageToken } = await listImagesInFolder(pageToken, folderId)

    const photos = files.map((f) => ({
      id: f.id,
      name: f.name,
      createdTime: f.createdTime,
      thumbnailUrl: getDriveThumbnailUrl(f.id, 400),
      fullUrl: getDriveThumbnailUrl(f.id, 1920),
      viewUrl: getDriveViewUrl(f.id),
    }))

    return NextResponse.json({ photos, nextPageToken: nextPageToken ?? null })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
