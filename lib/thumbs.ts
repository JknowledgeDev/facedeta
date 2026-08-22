import sharp from 'sharp'
import { getSupabaseAdmin } from '@/lib/supabase'
import { toJpegBuffer } from '@/lib/image-utils'

/**
 * สำเนารูปใน Supabase Storage (public, เสิร์ฟผ่าน CDN) — "ที่เก็บรูปจริง" ของระบบ
 * (นโยบาย: ต้นฉบับใน Google Drive อาจถูกลบหลัง sync)
 *
 *  - bucket "originals" : ต้นฉบับเต็มความละเอียด (คมเท่า Drive) → ดาวน์โหลด
 *      JPG  → เก็บไฟล์เดิมทุก byte ไม่ re-encode
 *      HEIC/RAW/PNG → แปลงเป็น JPEG เต็มความละเอียด q92
 *  - bucket "photos"    : 2000px q82 → ดูเต็มจอ (lightbox) โหลดเร็วบนมือถือ
 *  - bucket "thumbs"    : 500px  q75 → grid / การ์ดผลค้นหา
 * path = `${driveFileId}.jpg`
 */
export const ORIGINAL_BUCKET = 'originals'
export const PHOTO_BUCKET = 'photos'
export const THUMB_BUCKET = 'thumbs'
export const THUMB_SIZE = 500
export const DISPLAY_SIZE = 2000
export type Tier = 'thumb' | 'display' | 'original'

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const BUCKET_OF: Record<Tier, string> = { thumb: THUMB_BUCKET, display: PHOTO_BUCKET, original: ORIGINAL_BUCKET }

export function publicUrl(bucket: string, driveFileId: string): string {
  return `${BASE}/storage/v1/object/public/${bucket}/${driveFileId}.jpg`
}

async function putObject(bucket: string, driveFileId: string, buf: Buffer): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.storage
    .from(bucket)
    .upload(`${driveFileId}.jpg`, buf, {
      contentType: 'image/jpeg',
      cacheControl: '31536000', // 1 ปี (รูปไม่เปลี่ยน)
      upsert: true,
    })
  if (error) throw new Error(`storage ${bucket}: ${error.message}`)
}

function isJpeg(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

/** ต้นฉบับ → JPEG เต็มความละเอียด: JPG คืนไฟล์เดิม (ไม่เสียคุณภาพ), อื่นๆ แปลง q92 */
export async function toFullJpeg(original: Buffer): Promise<Buffer> {
  if (isJpeg(original)) return original
  return toJpegBuffer(original, 0, 0, 92)
}

async function deriveDisplay(full: Buffer): Promise<Buffer> {
  return sharp(full).rotate()
    .resize(DISPLAY_SIZE, DISPLAY_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true }).toBuffer()
}
async function deriveThumb(display: Buffer): Promise<Buffer> {
  return sharp(display)
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 75, mozjpeg: true }).toBuffer()
}

/**
 * เก็บครบ 3 ระดับจากไฟล์ต้นฉบับ (HEIC/RAW/JPG) — แปลงครั้งเดียว
 * คืน JPEG เต็มความละเอียดไว้ใช้ต่อ (เช่น ส่ง Rekognition)
 */
export async function cacheAllSizes(driveFileId: string, original: Buffer): Promise<Buffer> {
  const full = await toFullJpeg(original)
  const display = await deriveDisplay(full)
  const thumb = await deriveThumb(display)
  await Promise.all([
    putObject(ORIGINAL_BUCKET, driveFileId, full),
    putObject(PHOTO_BUCKET, driveFileId, display),
    putObject(THUMB_BUCKET, driveFileId, thumb),
  ])
  return full
}

/**
 * เหมือน cacheAllSizes แต่ถ้า "อัพโหลด" ล้ม ไม่ throw (flow sync/upload เดินต่อได้)
 * ถ้า "แปลงภาพ" ไม่ได้จะ throw (ไฟล์เสีย — ควรนับเป็น error)
 */
export async function cacheAllSizesSafe(driveFileId: string, original: Buffer): Promise<Buffer> {
  const full = await toFullJpeg(original)
  try {
    const display = await deriveDisplay(full)
    const thumb = await deriveThumb(display)
    await Promise.all([
      putObject(ORIGINAL_BUCKET, driveFileId, full),
      putObject(PHOTO_BUCKET, driveFileId, display),
      putObject(THUMB_BUCKET, driveFileId, thumb),
    ])
  } catch (e) {
    console.warn(`cache skip ${driveFileId}:`, e instanceof Error ? e.message : e)
  }
  return full
}

/** เติม cache ระดับเดียวแบบ fire-and-forget (proxy ใช้หลังดึงจาก Drive) */
export function cacheTierInBackground(tier: Tier, driveFileId: string, image: Buffer): void {
  const work = async () => {
    let buf: Buffer
    if (tier === 'original') buf = await toFullJpeg(image)
    else if (tier === 'display') buf = await toJpegBuffer(image, DISPLAY_SIZE, 0, 82)
    else buf = await toJpegBuffer(image, THUMB_SIZE, 0, 75)
    await putObject(BUCKET_OF[tier], driveFileId, buf)
  }
  work().catch((e) => console.warn(`cache ${tier} skip ${driveFileId}:`, e instanceof Error ? e.message : e))
}

/** มี object ใน bucket ไหม (HEAD public URL — เร็ว) */
async function exists(bucket: string, driveFileId: string): Promise<boolean> {
  try {
    const r = await fetch(publicUrl(bucket, driveFileId), { method: 'HEAD' })
    return r.ok
  } catch { return false }
}

/**
 * หา URL สำเนาบน CDN ตามระดับที่ต้องการ — ถ้าไม่มีลองระดับอื่นที่ใกล้เคียง
 * คืน null ถ้าไม่มีเลย (→ caller fallback ไป Drive)
 */
export async function findCachedUrl(driveFileId: string, tier: Tier): Promise<string | null> {
  const order: string[] =
    tier === 'original' ? [ORIGINAL_BUCKET, PHOTO_BUCKET, THUMB_BUCKET] :
    tier === 'display'  ? [PHOTO_BUCKET, ORIGINAL_BUCKET, THUMB_BUCKET] :
                          [THUMB_BUCKET, PHOTO_BUCKET, ORIGINAL_BUCKET]
  for (const b of order) {
    if (await exists(b, driveFileId)) return publicUrl(b, driveFileId)
  }
  return null
}
