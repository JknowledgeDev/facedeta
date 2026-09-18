import { NextRequest, NextResponse } from 'next/server'
import { searchFacesByImage, checkProbeImage, compareProbeToImage, collectionOf } from '@/lib/azure-face'
import { getFaceRecordsByIds, logSearch, type FaceIndexRow, type SearchResult } from '@/lib/supabase'
import { getDriveThumbnailUrl, getDriveViewUrl } from '@/lib/drive'
import { toJpegBuffer, AWS_MAX_BYTES } from '@/lib/image-utils'
import { publicUrl, PHOTO_BUCKET, downloadPrivateObject } from '@/lib/thumbs'
import { isUnlocked } from '@/lib/auth'
import type { Zone } from '@/lib/zone'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Search pipeline ตามแนวทาง AWS production (อนุมัติ Phase 1):
 *  1. รับรูปต้นแบบ 1-3 รูป → ตรวจคุณภาพ (เตือนอย่างเดียว ไม่บล็อก)
 *  2. ค้นหาต่อรูปแบบ recall กว้าง (80) แล้วรวมคะแนน (multi-probe vote)
 *  3. ยืนยันอันดับต้นซ้ำด้วย CompareFaces กับสำเนา 2000px
 *  4. แบ่งผลเป็น "มั่นใจ" (≥ threshold) กับ "อาจจะใช่" (พับเก็บ ไม่ซ่อนทิ้ง)
 *
 * โซนส่วนตัว: ค้นเพิ่มเฉพาะเมื่อ client ขอ (includePrivate=1) "และ" cookie ผู้ดูแลถูกต้อง
 * — ไม่มีรหัส = คลังใบหน้าส่วนตัวไม่ถูกแตะเลย
 */
const RECALL_THRESHOLD = 0.8   // ชั้นแรกค้นกว้าง แล้วค่อยยืนยัน
const VERIFY_TOP_K = 12        // จำนวนอันดับต้นที่ยืนยันซ้ำด้วย CompareFaces
const MAYBE_BAND = 10          // ต่ำกว่า threshold ไม่เกิน 10 จุด → "อาจจะใช่"

interface FaceHit {
  sim: number
  hits: number
  faceArea: number
  bbox?: { left: number; top: number; width: number; height: number }
}

interface FileEntry {
  record: FaceIndexRow
  zone: Zone
  sim: number
  hits: number
  faceArea: number
  bbox?: FaceHit['bbox']
  verified: boolean
}

/** ค้นหาในโซนเดียว: ต่อ probe → รวมคะแนนต่อใบหน้า → เลือกใบหน้าที่ดีที่สุดต่อรูป */
async function collectZone(zone: Zone, probes: Buffer[], minFaceArea: number): Promise<FileEntry[]> {
  const searches = await Promise.all(
    probes.map((p) => searchFacesByImage(p, RECALL_THRESHOLD, collectionOf(zone)))
  )
  const byFace = new Map<string, FaceHit>()
  for (const matches of searches) {
    for (const m of matches) {
      const cur = byFace.get(m.persistedFaceId)
      if (cur) {
        cur.sim = Math.max(cur.sim, m.confidence)
        cur.hits++
      } else {
        byFace.set(m.persistedFaceId, { sim: m.confidence, hits: 1, faceArea: m.faceArea, bbox: m.bbox })
      }
    }
  }

  // กรองใบหน้าเล็กเกินไปในภาพต้นทาง (คนพื้นหลัง)
  for (const [id, f] of Array.from(byFace.entries())) {
    if (f.faceArea < minFaceArea) byFace.delete(id)
  }
  if (byFace.size === 0) return []

  const records = await getFaceRecordsByIds(Array.from(byFace.keys()), zone)
  const byFile = new Map<string, FileEntry>()
  for (const r of records) {
    const hit = byFace.get(r.face_id)
    if (!hit) continue
    const cur = byFile.get(r.drive_file_id)
    if (!cur || hit.sim > cur.sim) {
      byFile.set(r.drive_file_id, {
        record: r,
        zone,
        sim: hit.sim,
        hits: Math.max(hit.hits, cur?.hits ?? 0),
        faceArea: hit.faceArea,
        bbox: hit.bbox,
        verified: false,
      })
    } else if (cur) {
      cur.hits = Math.max(cur.hits, hit.hits)
    }
  }
  return Array.from(byFile.values())
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    // รับหลายรูป (image0..2) และรองรับ client เก่า (image)
    const files: File[] = []
    for (const key of ['image0', 'image1', 'image2', 'image']) {
      const f = formData.get(key)
      if (f instanceof File && f.size > 0) files.push(f)
    }
    const probeFiles = files.slice(0, 3)

    if (probeFiles.length === 0) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }
    for (const f of probeFiles) {
      if (f.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 400 })
      }
    }

    // threshold ใหม่: 90 / 95 / 99 (ค่าต่ำจาก client เก่า → ปรับขึ้นเป็น 90)
    const rawT = parseFloat((formData.get('threshold') as string) ?? '95')
    const thresholdPct = rawT >= 99 ? 99 : rawT >= 95 ? 95 : 90

    // โซนที่จะค้น — ส่วนตัวต้องผ่านทั้ง "ขอมา" และ "cookie ถูกต้อง"
    const zones: Zone[] =
      formData.get('includePrivate') === '1' && isUnlocked(req) ? ['public', 'private'] : ['public']

    // แปลงทุก probe → JPEG ≤ 5MB
    const probes = await Promise.all(
      probeFiles.map(async (f) => toJpegBuffer(Buffer.from(await f.arrayBuffer()), 0, AWS_MAX_BYTES))
    )

    // ── 1) ตรวจคุณภาพรูปต้นแบบ — เตือนเท่านั้น ไม่บล็อก (บล็อกเฉพาะไม่มีหน้าเลย)
    const checks = await Promise.all(probes.map((p) => checkProbeImage(p).catch(() => null)))
    const usable = probes.filter((_, i) => (checks[i]?.faceCount ?? 1) > 0)
    const probeWarnings = Array.from(new Set(checks.flatMap((c) => c?.warnings ?? [])))
    if (usable.length === 0) {
      return NextResponse.json(
        { error: 'ไม่พบใบหน้าในรูปที่อัพโหลด กรุณาใช้รูปที่เห็นหน้าน้องชัดเจน' },
        { status: 400 }
      )
    }

    // ── 2) ค้นหาทุกโซนที่ได้รับอนุญาต แล้วรวมผล (รูปเดียวกันอยู่สองโซน → ใช้ของโซนสาธารณะ)
    const minFaceArea = thresholdPct >= 99 ? 0.01 : thresholdPct >= 95 ? 0.006 : 0.004
    const perZone = await Promise.all(zones.map((z) => collectZone(z, usable, minFaceArea)))
    const merged = new Map<string, FileEntry>()
    for (const list of perZone) {
      for (const e of list) {
        if (!merged.has(e.record.drive_file_id)) merged.set(e.record.drive_file_id, e)
      }
    }

    if (merged.size === 0) {
      await logSearch(0, thresholdPct)
      return NextResponse.json({ results: [], total: 0, totalMaybe: 0, probeWarnings })
    }

    // ── 3) ยืนยันอันดับต้นด้วย CompareFaces (เทียบกับสำเนา 2000px)
    const entries = Array.from(merged.values()).sort((a, b) => b.sim - a.sim)
    const bestProbe = usable[0]
    await Promise.all(
      entries.slice(0, VERIFY_TOP_K).map(async (e) => {
        try {
          let target: Buffer | null = null
          if (e.zone === 'private') {
            target = await downloadPrivateObject(e.record.drive_file_id, 'display')
          } else {
            const res = await fetch(publicUrl(PHOTO_BUCKET, e.record.drive_file_id), {
              signal: AbortSignal.timeout(8000),
            })
            if (res.ok) target = Buffer.from(await res.arrayBuffer())
          }
          if (!target) return
          const sim = await compareProbeToImage(bestProbe, target)
          if (sim !== null) {
            e.sim = sim
            e.verified = true
          }
        } catch {
          // ยืนยันไม่ได้ (network/รูปไม่มีสำเนา) → ใช้คะแนนค้นหาเดิม ไม่ตัดทิ้ง
        }
      })
    )

    // ── 4) แบ่งผล "มั่นใจ" / "อาจจะใช่"
    const maybeFloor = Math.max(thresholdPct - MAYBE_BAND, 85)
    const results: SearchResult[] = []
    let sureCount = 0
    let maybeCount = 0

    for (const e of entries) {
      const pct = Math.round(e.sim * 100)
      let band: 'sure' | 'maybe' | null =
        pct >= thresholdPct ? 'sure' : pct >= maybeFloor ? 'maybe' : null
      // กฎกัน match โดดเดี่ยว: คะแนน < 95 ที่ไม่ผ่านการยืนยันและเจอจาก probe เดียว → ลดชั้น
      if (band === 'sure' && pct < 95 && !e.verified && e.hits < 2) band = 'maybe'
      if (!band) continue

      if (band === 'sure') sureCount++
      else maybeCount++

      results.push({
        ...e.record,
        confidence: pct,
        faceArea: e.faceArea,
        thumbnail_url: getDriveThumbnailUrl(e.record.drive_file_id, 400),
        view_url: getDriveViewUrl(e.record.drive_file_id),
        band,
        verified: e.verified,
        probeHits: e.hits,
        bbox: e.bbox,
        zone: e.zone,
      })
    }

    results.sort((a, b) => b.confidence - a.confidence)

    await logSearch(sureCount, thresholdPct)

    return NextResponse.json(
      { results, total: sureCount, totalMaybe: maybeCount, probeWarnings, zones },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err: unknown) {
    console.error('Search error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
