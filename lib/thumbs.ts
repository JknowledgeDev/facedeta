import { getSupabaseAdmin } from '@/lib/supabase'
import { toJpegBuffer } from '@/lib/image-utils'

/**
 * Thumbnail cache ใน Supabase Storage (bucket "thumbs", public)
 * เสิร์ฟผ่าน CDN ตรง ไม่ผ่าน serverless → โหลดเร็วมาก
 * path = `${driveFileId}.jpg`, ขนาด 500px longest side
 */
export const THUMB_BUCKET = 'thumbs'
export const THUMB_SIZE = 500

/** อัพโหลด thumbnail ขึ้น Storage (upsert) — รับภาพทุกฟอร์แมต (HEIC/RAW/JPG) */
export async function uploadThumb(driveFileId: string, image: Buffer): Promise<void> {
  const thumb = await toJpegBuffer(image, THUMB_SIZE)
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.storage
    .from(THUMB_BUCKET)
    .upload(`${driveFileId}.jpg`, thumb, {
      contentType: 'image/jpeg',
      cacheControl: '31536000', // 1 ปี (รูปไม่เปลี่ยน)
      upsert: true,
    })
  if (error) throw new Error(`uploadThumb: ${error.message}`)
}

/** อัพโหลดแบบไม่ throw (ใช้ใน sync/upload ไม่ให้ flow หลักล้ม) */
export async function uploadThumbSafe(driveFileId: string, image: Buffer): Promise<void> {
  try { await uploadThumb(driveFileId, image) }
  catch (e) { console.warn(`thumb cache skip ${driveFileId}:`, e instanceof Error ? e.message : e) }
}

/** fire-and-forget (ใช้ใน proxy หลังส่ง response) */
export function uploadThumbInBackground(driveFileId: string, image: Buffer): void {
  void uploadThumbSafe(driveFileId, image)
}
