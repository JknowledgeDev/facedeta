import { NextRequest, NextResponse } from 'next/server'
import { searchFacesByImage } from '@/lib/azure-face'
import { getFaceRecordsByIds, logSearch, type SearchResult } from '@/lib/supabase'
import { getDriveThumbnailUrl, getDriveViewUrl } from '@/lib/drive'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    // threshold จาก UI เป็น % (60–99) → แปลงเป็น 0–1 สำหรับ Azure
    const thresholdPct = parseFloat((formData.get('threshold') as string) ?? '70')
    const threshold = thresholdPct / 100

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 400 })
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer())

    // ค้นหาด้วย AWS Rekognition
    const allMatches = await searchFacesByImage(imageBuffer, threshold)

    /**
     * กรองใบหน้าที่เล็กเกินไปในภาพต้นฉบับออก
     * faceArea = Width × Height ของ BoundingBox (0–1)
     * - ค้นหาทั่วไป  (threshold ≤ 65%) → min 0.2% (รับภาพกลุ่มหลวมๆ)
     * - ค้นหาละเอียด (threshold ≤ 80%) → min 0.5% (น้องต้องเห็นชัดพอ)
     * - ค้นหารายบุคคล (threshold > 80%) → min 1.0% (น้องต้องเป็นหลักในภาพ)
     */
    const minFaceArea =
      thresholdPct <= 65 ? 0.002 :
      thresholdPct <= 80 ? 0.005 :
      0.01

    const matches = allMatches.filter((m) => m.faceArea >= minFaceArea)

    if (matches.length === 0) {
      await logSearch(0, thresholdPct)
      return NextResponse.json({ results: [], total: 0 })
    }

    // ดึง persistedFaceId ทั้งหมด
    const faceIds = matches.map((m) => m.persistedFaceId)

    // ค้นหา records จาก Supabase
    const records = await getFaceRecordsByIds(faceIds)

    // Map confidence + faceArea กลับเข้า records
    const matchMap = new Map<string, { confidence: number; faceArea: number }>()
    for (const m of matches) {
      matchMap.set(m.persistedFaceId, {
        confidence: Math.round(m.confidence * 100),
        faceArea: m.faceArea,
      })
    }

    const results: SearchResult[] = records.map((r) => ({
      ...r,
      confidence: matchMap.get(r.face_id)?.confidence ?? 0,
      faceArea: matchMap.get(r.face_id)?.faceArea ?? 0,
      thumbnail_url: getDriveThumbnailUrl(r.drive_file_id, 400),
      view_url: getDriveViewUrl(r.drive_file_id),
    }))

    results.sort((a, b) => b.confidence - a.confidence)

    // กรองรูปซ้ำ (รูปเดียวอาจมีหลาย face)
    const seen = new Set<string>()
    const dedupedResults = results.filter((r) => {
      if (seen.has(r.drive_file_id)) return false
      seen.add(r.drive_file_id)
      return true
    })

    await logSearch(dedupedResults.length, thresholdPct)

    return NextResponse.json({ results: dedupedResults, total: dedupedResults.length })
  } catch (err: unknown) {
    console.error('Search error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
