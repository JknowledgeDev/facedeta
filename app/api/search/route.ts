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

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 })
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer())

    // ค้นหาด้วย Azure Face API
    const matches = await searchFacesByImage(imageBuffer, threshold)

    if (matches.length === 0) {
      await logSearch(0, thresholdPct)
      return NextResponse.json({ results: [], total: 0 })
    }

    // ดึง persistedFaceId ทั้งหมด
    const faceIds = matches.map((m) => m.persistedFaceId)

    // ค้นหา records จาก Supabase
    const records = await getFaceRecordsByIds(faceIds)

    // Map confidence กลับเข้า records
    const confidenceMap = new Map<string, number>()
    for (const m of matches) {
      // Azure confidence เป็น 0–1 → แปลงเป็น % แสดงใน UI
      confidenceMap.set(m.persistedFaceId, Math.round(m.confidence * 100))
    }

    const results: SearchResult[] = records.map((r) => ({
      ...r,
      confidence: confidenceMap.get(r.face_id) ?? 0,
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
