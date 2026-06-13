import { NextResponse } from 'next/server'
import { getGalleryPhotos } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  try {
    // อ่านจาก Supabase (face_index) = รูปทั้งหมดจากทุกโฟลเดอร์/ทุก URL ที่เคย sync
    const photos = await getGalleryPhotos()
    return NextResponse.json({ photos, total: photos.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
