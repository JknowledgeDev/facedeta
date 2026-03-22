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
} from '@aws-sdk/client-rekognition'
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

  return response.FaceRecords
    .filter((r) => r.Face?.FaceId)
    .map((r) => ({ persistedFaceId: r.Face!.FaceId! }))
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface DetectedFace {
  faceId: string
}

export interface SimilarFace {
  persistedFaceId: string
  confidence: number // 0–1
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
    .map((m) => ({
      persistedFaceId: m.Face!.FaceId!,
      confidence: (m.Similarity ?? 0) / 100, // แปลง 0–100 → 0–1
    }))
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
