import { NextRequest, NextResponse } from 'next/server'
import { deleteFaceMappingsByFileId, getSupabaseAdmin } from '@/lib/supabase'
import { deleteFacesFromList } from '@/lib/azure-face'
import { ORIGINAL_BUCKET, PHOTO_BUCKET, THUMB_BUCKET } from '@/lib/thumbs'

export const runtime = 'nodejs'
export const maxDuration = 60

/** จำกัดต่อ request กัน timeout — client แบ่ง batch เอง */
const MAX_PER_CALL = 50

/**
 * ลบรูปออกจากระบบถาวร (ลบครบทุกที่):
 *  1. face_index + photo_index (Supabase DB) → ได้ faceIds จริงกลับมา
 *  2. ใบหน้าใน Rekognition Collection (ไม่ให้ไปโผล่ในผลค้นหาอีก)
 *  3. สำเนารูปทั้ง 3 ขนาดใน Storage (originals / photos / thumbs)
 * ไม่แตะไฟล์ใน Google Drive
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { fileIds?: unknown }
    const raw = Array.isArray(body.fileIds) ? body.fileIds : []
    const ids = raw.filter(
      (x): x is string => typeof x === 'string' && /^[a-zA-Z0-9_-]{10,}$/.test(x)
    )
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ไม่มีรูปที่จะลบ' }, { status: 400 })
    }
    if (ids.length > MAX_PER_CALL) {
      return NextResponse.json({ error: `ลบได้ครั้งละไม่เกิน ${MAX_PER_CALL} รูปต่อ request` }, { status: 400 })
    }

    const errors: string[] = []

    // 1) ลบจากฐานข้อมูล (source of truth) → รวบรวม faceIds จริง
    const allFaceIds: string[] = []
    let deleted = 0
    await Promise.all(
      ids.map(async (id) => {
        try {
          allFaceIds.push(...(await deleteFaceMappingsByFileId(id)))
          deleted++
        } catch (e) {
          errors.push(`db ${id}: ${e instanceof Error ? e.message : e}`)
        }
      })
    )

    // 2) ลบใบหน้าออกจาก Rekognition
    let facesRemoved = 0
    if (allFaceIds.length > 0) {
      try {
        facesRemoved = await deleteFacesFromList(allFaceIds)
      } catch (e) {
        errors.push(`rekognition: ${e instanceof Error ? e.message : e}`)
      }
    }

    // 3) ลบสำเนาทั้ง 3 ขนาดออกจาก Storage
    const sb = getSupabaseAdmin()
    const paths = ids.map((id) => `${id}.jpg`)
    await Promise.all(
      [ORIGINAL_BUCKET, PHOTO_BUCKET, THUMB_BUCKET].map(async (bucket) => {
        const { error } = await sb.storage.from(bucket).remove(paths)
        if (error) errors.push(`storage ${bucket}: ${error.message}`)
      })
    )

    return NextResponse.json({ deleted, facesRemoved, errors })
  } catch (err: unknown) {
    console.error('delete-photos error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
