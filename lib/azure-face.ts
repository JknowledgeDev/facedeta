/**
 * AWS Rekognition client (ใช้แทน Azure Face API ที่ต้องขออนุมัติ)
 * Docs: https://docs.aws.amazon.com/rekognition/latest/APIReference/
 *
 * Flow:
 *  Index  → addFaceToList(buffer)      → ได้ faceId → เก็บใน Supabase
 *  Search → searchFacesByImage(buffer) → ได้ faceId[] + confidence
 *         → ดึง driveFileId จาก Supabase
 *
 * ข้อดีเทียบ Azure:
 *  - ไม่ต้องขออนุมัติจาก Microsoft
 *  - ไม่ต้อง train model หลัง index (อัตโนมัติ)
 *  - SearchFacesByImage ทำในขั้นตอนเดียว (ไม่ต้อง detect แยก)
 */

import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  ListFacesCommand,
  DetectFacesCommand,
  CompareFacesCommand,
} from '@aws-sdk/client-rekognition'
import sharp from 'sharp'
import { toJpegBuffer, AWS_MAX_BYTES } from '@/lib/image-utils'

const client = new RekognitionClient({
  region: process.env.AWS_REGION ?? 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
})

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID ?? 'facedeta-collection'

// ─── Collection ──────────────────────────────────────────────────────────────

/** สร้าง Rekognition Collection ถ้ายังไม่มี (409 = already exists → ข้าม) */
export async function ensureFaceList(): Promise<void> {
  try {
    await client.send(new CreateCollectionCommand({ CollectionId: COLLECTION_ID }))
  } catch (err: unknown) {
    if ((err as { name?: string }).name !== 'ResourceAlreadyExistsException') {
      throw err
    }
    // collection มีอยู่แล้ว → ข้าม
  }
}

/**
 * AWS Rekognition ไม่ต้อง train — index แล้วค้นหาได้เลยทันที
 * คงฟังก์ชันนี้ไว้เพื่อ backward-compatible กับ API routes
 */
export async function trainFaceList(): Promise<void> {
  // no-op: AWS จัดการ index อัตโนมัติ
}

/** AWS ไม่มี training step → return ทันที */
export async function waitForTraining(_maxWaitMs = 30000): Promise<void> {
  // no-op
}

// ─── Index ──────────────────────────────────────────────────────────────────

export interface AddFaceResult {
  persistedFaceId: string
}

/**
 * เพิ่มใบหน้าจากรูปเข้า Rekognition Collection
 * คืนค่า faceId ทุกใบหน้าในรูป (ถ้ามีหลายคน)
 * userData = driveFileId สำหรับ fallback lookup
 */
export async function addFaceToList(
  imageBuffer: Buffer,
  userData?: string
): Promise<AddFaceResult[]> {
  await ensureFaceList()

  // แปลง HEIC/HEIF และฟอร์แมตอื่นๆ → JPEG + บีบให้ต่ำกว่า AWS 5 MB limit
  const jpegBuffer = await toJpegBuffer(imageBuffer, 0, AWS_MAX_BYTES)

  // ExternalImageId รองรับเฉพาะ [a-zA-Z0-9_.\-:] ความยาวไม่เกิน 255
  const externalImageId = userData
    ? userData.replace(/[^a-zA-Z0-9_.\-:]/g, '_').slice(0, 255)
    : undefined

  const response = await client.send(
    new IndexFacesCommand({
      CollectionId: COLLECTION_ID,
      Image: { Bytes: jpegBuffer },
      ExternalImageId: externalImageId,
      DetectionAttributes: [],
      MaxFaces: 10,
      QualityFilter: 'AUTO',
    })
  )

  if (!response.FaceRecords || response.FaceRecords.length === 0) {
    return []
  }

  // ── Index gate (AWS best practice): หน้าที่เล็ก/เบลอ/เอียงมากไม่ควรอยู่ใน
  //    collection — มันแย่งอันดับผลค้นหาและเพิ่ม false match ให้ทุกการค้นหา
  //    (กรองที่ตอน index ไม่ใช่แค่ตอนค้น) — ตัวที่ไม่ผ่านจะถูกลบออกทันที
  const meta = await sharp(jpegBuffer).metadata()
  const imgW = meta.width ?? 0
  const imgH = meta.height ?? 0

  const good: AddFaceResult[] = []
  const badIds: string[] = []
  for (const r of response.FaceRecords) {
    const faceId = r.Face?.FaceId
    if (!faceId) continue
    const fd = r.FaceDetail
    const bb = fd?.BoundingBox
    const minSidePx = bb && imgW && imgH
      ? Math.min((bb.Width ?? 0) * imgW, (bb.Height ?? 0) * imgH)
      : 0
    const yaw = Math.abs(fd?.Pose?.Yaw ?? 0)
    const pitch = Math.abs(fd?.Pose?.Pitch ?? 0)
    const sharpness = fd?.Quality?.Sharpness ?? 100
    const brightness = fd?.Quality?.Brightness ?? 100

    const ok =
      minSidePx >= MIN_INDEX_FACE_PX &&  // ใหญ่พอที่จะจับคู่ได้น่าเชื่อถือ (AWS floor 50px)
      yaw <= 45 && pitch <= 35 &&        // ไม่หันข้าง/ก้มเงยเกินขีดที่ AWS แนะนำ
      sharpness >= 8 && brightness >= 18 // ไม่เบลอ/มืดจนใช้ไม่ได้

    if (ok) good.push({ persistedFaceId: faceId })
    else badIds.push(faceId)
  }

  if (badIds.length > 0) {
    // ลบหน้าที่ไม่ผ่านออกจาก collection (best-effort)
    try {
      await client.send(new DeleteFacesCommand({ CollectionId: COLLECTION_ID, FaceIds: badIds }))
    } catch (e) {
      console.warn('index-gate cleanup failed:', e instanceof Error ? e.message : e)
    }
  }

  return good
}

/** ขนาดใบหน้าขั้นต่ำ (px ด้านสั้น) ที่ยอมเข้า collection — AWS ระบุ 50px เป็น floor */
const MIN_INDEX_FACE_PX = 100

// ─── Probe quality check (ตรวจรูปต้นแบบก่อนค้น — เตือนอย่างเดียว ไม่บล็อก) ────

export interface ProbeCheck {
  faceCount: number
  warnings: string[]
}

export async function checkProbeImage(jpegBuffer: Buffer): Promise<ProbeCheck> {
  const res = await client.send(
    new DetectFacesCommand({ Image: { Bytes: jpegBuffer }, Attributes: ['ALL'] })
  )
  const faces = res.FaceDetails ?? []
  const warnings: string[] = []
  if (faces.length === 0) return { faceCount: 0, warnings }

  if (faces.length > 1) {
    warnings.push(`พบ ${faces.length} ใบหน้าในรูปต้นแบบ — ระบบจะใช้ใบหน้าที่ใหญ่ที่สุด แนะนำใช้รูปเดี่ยวของน้อง`)
  }

  // ประเมินใบหน้าที่ใหญ่ที่สุด (ตัวที่ระบบใช้ค้นจริง)
  const largest = faces.reduce((a, b) => {
    const areaA = (a.BoundingBox?.Width ?? 0) * (a.BoundingBox?.Height ?? 0)
    const areaB = (b.BoundingBox?.Width ?? 0) * (b.BoundingBox?.Height ?? 0)
    return areaB > areaA ? b : a
  })

  const meta = await sharp(jpegBuffer).metadata()
  const minSidePx = Math.min(
    (largest.BoundingBox?.Width ?? 0) * (meta.width ?? 0),
    (largest.BoundingBox?.Height ?? 0) * (meta.height ?? 0)
  )
  if (minSidePx > 0 && minSidePx < 100) {
    warnings.push('ใบหน้าในรูปต้นแบบค่อนข้างเล็ก แนะนำรูปครึ่งตัวหรือถ่ายใกล้กว่านี้')
  }
  if (largest.Sunglasses?.Value) warnings.push('น้องใส่แว่นกันแดดในรูป อาจลดความแม่นยำ')
  if (largest.FaceOccluded?.Value) warnings.push('ใบหน้าถูกบังบางส่วน (เช่น มือ/หน้ากาก) อาจลดความแม่นยำ')
  const yaw = Math.abs(largest.Pose?.Yaw ?? 0)
  const pitch = Math.abs(largest.Pose?.Pitch ?? 0)
  if (yaw > 40 || pitch > 30) warnings.push('ใบหน้าเอียง/หันข้างมาก แนะนำรูปหน้าตรงเพื่อความแม่นยำ')
  if ((largest.Quality?.Sharpness ?? 100) < 12) warnings.push('รูปต้นแบบค่อนข้างเบลอ แนะนำรูปที่คมชัดกว่านี้')

  return { faceCount: faces.length, warnings }
}

// ─── CompareFaces verification (ยืนยันซ้ำชั้นที่สอง) ─────────────────────────

/**
 * เทียบใบหน้าใหญ่สุดในรูปต้นแบบ กับทุกใบหน้าในรูปเป้าหมาย
 * คืนค่า similarity สูงสุด (0–1) หรือ null ถ้าเทียบไม่ได้/ไม่เจอ
 */
export async function compareProbeToImage(
  probeJpeg: Buffer,
  targetJpeg: Buffer
): Promise<number | null> {
  try {
    const res = await client.send(
      new CompareFacesCommand({
        SourceImage: { Bytes: probeJpeg },
        TargetImage: { Bytes: targetJpeg },
        SimilarityThreshold: 50,
      })
    )
    const sims = (res.FaceMatches ?? [])
      .map((m) => m.Similarity ?? 0)
      .filter((s) => s > 0)
    if (sims.length === 0) return null
    return Math.max(...sims) / 100
  } catch {
    return null
  }
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface DetectedFace {
  faceId: string
}

export interface SimilarFace {
  persistedFaceId: string
  confidence: number // 0–1
  /** พื้นที่ใบหน้าในภาพต้นฉบับ (Width × Height ของ BoundingBox) — 0–1 */
  faceArea: number
  /** ตำแหน่งใบหน้าในภาพต้นฉบับ (สัดส่วน 0–1) — ใช้แสดง crop บนการ์ดผลลัพธ์ */
  bbox?: { left: number; top: number; width: number; height: number }
}

/**
 * AWS SearchFacesByImage ทำ detect + search ในขั้นตอนเดียว
 * ฟังก์ชันนี้คงไว้เพื่อ backward-compatible กับ API routes
 */
export async function detectFaces(_imageBuffer: Buffer): Promise<DetectedFace[]> {
  return [{ faceId: 'rekognition-direct-search' }]
}

/**
 * ไม่ต้องใช้ findSimilar แยก → ใช้ searchFacesByImage แทน
 * คงไว้เพื่อ backward-compatible
 */
export async function findSimilarFaces(
  _faceId: string,
  _threshold = 0.6,
  _maxResults = 100
): Promise<SimilarFace[]> {
  return []
}

/**
 * ค้นหาใบหน้าจากรูป → AWS SearchFacesByImage (detect + search ในขั้นตอนเดียว)
 * threshold: 0–1  (แนะนำ 0.6–0.85)
 * confidence ที่คืนมา: 0–1 (AWS ใช้ 0–100 ภายใน → หาร 100 ก่อนคืน)
 */
export async function searchFacesByImage(
  imageBuffer: Buffer,
  threshold = 0.6
): Promise<SimilarFace[]> {
  // สร้าง collection อัตโนมัติถ้ายังไม่มี
  await ensureFaceList()

  // แปลง HEIC/HEIF และฟอร์แมตอื่นๆ → JPEG + บีบให้ต่ำกว่า AWS 5 MB limit
  const jpegBuffer = await toJpegBuffer(imageBuffer, 0, AWS_MAX_BYTES)

  const response = await client.send(
    new SearchFacesByImageCommand({
      CollectionId: COLLECTION_ID,
      Image: { Bytes: jpegBuffer },
      FaceMatchThreshold: threshold * 100, // AWS รับ 0–100
      MaxFaces: 100,
    })
  )

  if (!response.FaceMatches || response.FaceMatches.length === 0) {
    return []
  }

  return response.FaceMatches
    .filter((m) => m.Face?.FaceId && m.Similarity !== undefined)
    .map((m) => {
      const bb = m.Face?.BoundingBox
      const faceArea = bb ? (bb.Width ?? 0) * (bb.Height ?? 0) : 0
      return {
        persistedFaceId: m.Face!.FaceId!,
        confidence: (m.Similarity ?? 0) / 100, // แปลง 0–100 → 0–1
        faceArea, // พื้นที่ใบหน้าใน Drive photo ต้นฉบับ (0–1)
        bbox: bb
          ? { left: bb.Left ?? 0, top: bb.Top ?? 0, width: bb.Width ?? 0, height: bb.Height ?? 0 }
          : undefined,
      }
    })
}

/** ลบหลายใบหน้าออกจาก Collection (chunk ละ 1000) — คืนจำนวนที่ลบสำเร็จ */
export async function deleteFacesFromList(faceIds: string[]): Promise<number> {
  let removed = 0
  for (let i = 0; i < faceIds.length; i += 1000) {
    const chunk = faceIds.slice(i, i + 1000)
    const res = await client.send(
      new DeleteFacesCommand({ CollectionId: COLLECTION_ID, FaceIds: chunk })
    )
    removed += res.DeletedFaces?.length ?? chunk.length
  }
  return removed
}

/** ลบใบหน้าออกจาก Collection */
export async function deleteFaceFromList(persistedFaceId: string): Promise<void> {
  await client.send(
    new DeleteFacesCommand({
      CollectionId: COLLECTION_ID,
      FaceIds: [persistedFaceId],
    })
  )
}

/** นับจำนวนใบหน้าทั้งหมดใน Collection */
export async function countFacesInList(): Promise<number> {
  let count = 0
  let nextToken: string | undefined

  do {
    const response = await client.send(
      new ListFacesCommand({
        CollectionId: COLLECTION_ID,
        NextToken: nextToken,
        MaxResults: 1000,
      })
    )
    count += response.Faces?.length ?? 0
    nextToken = response.NextToken
  } while (nextToken)

  return count
}
