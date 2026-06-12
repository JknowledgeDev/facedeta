import { NextRequest, NextResponse } from 'next/server'
import { getAllPhotosSorted } from '@/lib/drive'
import { getUploadTimesByFile } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  try {
    const folderId = req.nextUrl.searchParams.get('folderId') ?? undefined

    // ดึงพร้อมกัน: รูปจาก Drive + เวลาอัปโหลดเข้าระบบจาก Supabase
    const [photos, uploads] = await Promise.all([
      getAllPhotosSorted(folderId),
      getUploadTimesByFile(),
    ])

    /**
     * เรียงลำดับ "ใหม่สุดก่อน" ด้วยลำดับความสำคัญ:
     *  1. วันที่อัปโหลดเข้าระบบ (uploaded_at) — ชุดที่ Sync ล่าสุดอยู่บนสุด
     *     (ตัดเป็นระดับวัน; รูปที่ยังไม่ index → ใช้วันถ่ายแทน)
     *  2. ชื่อไฟล์ (IMG_8207 ใหม่กว่า IMG_8077) — สัญญาณหลักของรูป iPhone
     *     เพราะ Drive ดึง EXIF จาก HEIC ไม่ได้
     *  3. เวลาถ่าย/อัปโหลด (EXIF/createdTime) — ตัวตัดสินสุดท้าย
     */
    const enriched = photos.map((p) => {
      const added = uploads[p.id] ?? ''                       // ISO เวลาเข้าระบบ (ถ้ามี)
      const addedDay = added ? added.slice(0, 10) : p.date     // fallback = วันถ่าย
      return { p, addedDay, time: p.time, name: p.name }
    })

    enriched.sort((a, b) => {
      // 1) วันที่เข้าระบบ / วันถ่าย (ระดับวัน)
      if (a.addedDay !== b.addedDay) return b.addedDay.localeCompare(a.addedDay)
      // 2) ชื่อไฟล์ (numeric desc — IMG_8207 > IMG_8077)
      const byName = b.name.localeCompare(a.name, undefined, { numeric: true })
      if (byName !== 0) return byName
      // 3) เวลาถ่าย/อัปโหลด
      return b.time.localeCompare(a.time)
    })

    return NextResponse.json({
      photos: enriched.map((e) => e.p),
      total: enriched.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
