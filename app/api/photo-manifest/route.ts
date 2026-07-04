import { NextResponse } from 'next/server'
import { getGalleryPhotos } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60
// สำคัญ: GET ที่ไม่อ่าน request จะถูก Next.js cache แบบ static ตอน build
// → รูปที่ sync ใหม่จะไม่ขึ้นจนกว่าจะ redeploy — ต้อง force-dynamic
export const dynamic = 'force-dynamic'

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
