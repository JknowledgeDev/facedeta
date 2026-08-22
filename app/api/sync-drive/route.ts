import { NextRequest } from 'next/server'
import { addFaceToList } from '@/lib/azure-face'
import { saveFaceMapping, savePhotoIndex, isPhotoProcessed } from '@/lib/supabase'
import { downloadFileAsBuffer, getDriveViewUrl } from '@/lib/drive'
import { toJpegBuffer, AWS_MAX_BYTES } from '@/lib/image-utils'
import { cacheAllSizesSafe } from '@/lib/thumbs'

export const runtime = 'nodejs'
export const maxDuration = 300

interface BatchFile {
  id: string
  name: string
}

export interface SyncEvent {
  type: 'progress' | 'done' | 'error'
  fileName?: string
  fileId?: string
  status?: 'indexed' | 'skipped' | 'no_face' | 'error'
  facesIndexed?: number
  errorMessage?: string
  totalProcessed?: number
  totalFaces?: number
  countIndexed?: number
  countSkipped?: number
  countNoFace?: number
  countError?: number
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const eventName: string = body.eventName ?? ''
  const eventDate: string = body.eventDate ?? ''
  // batch ของไฟล์ที่ client ส่งมา index (จาก /api/sync-list)
  const files: BatchFile[] = Array.isArray(body.files) ? body.files : []
  // counters สะสมจาก batch ก่อนหน้า
  const prevProcessed: number = body.prevProcessed ?? 0
  const prevFaces: number = body.prevFaces ?? 0
  const prevIndexed: number = body.prevIndexed ?? 0
  const prevSkipped: number = body.prevSkipped ?? 0
  const prevNoFace: number = body.prevNoFace ?? 0
  const prevError: number = body.prevError ?? 0

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SyncEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

      let totalProcessed = prevProcessed
      let totalFaces = prevFaces
      let countIndexed = prevIndexed
      let countSkipped = prevSkipped
      let countNoFace = prevNoFace
      let countError = prevError

      const stats = () => ({ totalProcessed, totalFaces, countIndexed, countSkipped, countNoFace, countError })

      try {
        for (const file of files) {
          // ข้ามรูปที่ประมวลผลแล้ว (ทั้งรูปที่มีหน้าและไม่มีหน้า)
          if (await isPhotoProcessed(file.id)) {
            countSkipped++
            totalProcessed++
            send({ type: 'progress', fileName: file.name, fileId: file.id, status: 'skipped', ...stats() })
            continue
          }

          // ── retry แต่ละรูปสูงสุด 2 รอบ ──────────────────────────────
          const MAX_FILE_RETRY = 2
          for (let attempt = 1; attempt <= MAX_FILE_RETRY; attempt++) {
            try {
              if (attempt > 1) {
                await new Promise((r) => setTimeout(r, 3000 * attempt))
              }

              const buffer = await downloadFileAsBuffer(file.id)
              // เก็บสำเนา "ต้นฉบับเต็ม + 2000px + 500px" ลง CDN — ที่เก็บรูปจริงของระบบ
              // (Drive ลบทิ้งได้หลัง sync) แล้วได้ JPEG เต็มความละเอียดกลับมาใช้ index ต่อ
              const fullJpeg = await cacheAllSizesSafe(file.id, buffer)
              const jpeg = await toJpegBuffer(fullJpeg, 0, AWS_MAX_BYTES)
              const faceResults = await addFaceToList(jpeg, file.id)
              const viewUrl = getDriveViewUrl(file.id)

              // เก็บ "ทุกรูป" ลง photo_index เสมอ แม้ไม่พบใบหน้า
              await savePhotoIndex({
                driveFileId: file.id,
                fileName: file.name,
                eventName: eventName || undefined,
                eventDate: eventDate || undefined,
                thumbnailUrl: viewUrl,
                hasFace: faceResults.length > 0,
                faceCount: faceResults.length,
              })

              if (faceResults.length === 0) {
                countNoFace++
                totalProcessed++
                send({ type: 'progress', fileName: file.name, fileId: file.id, status: 'no_face', ...stats() })
                break
              }

              await Promise.all(
                faceResults.map((f) =>
                  saveFaceMapping({
                    faceId: f.persistedFaceId,
                    driveFileId: file.id,
                    fileName: file.name,
                    eventName: eventName || undefined,
                    eventDate: eventDate || undefined,
                    thumbnailUrl: viewUrl,
                  })
                )
              )

              totalFaces += faceResults.length
              countIndexed++
              totalProcessed++
              send({
                type: 'progress',
                fileName: file.name,
                fileId: file.id,
                status: 'indexed',
                facesIndexed: faceResults.length,
                ...stats(),
              })
              break
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Unknown error'
              if (attempt < MAX_FILE_RETRY) {
                send({
                  type: 'progress',
                  fileName: file.name,
                  fileId: file.id,
                  status: 'error',
                  errorMessage: `[retry ${attempt}/${MAX_FILE_RETRY}] ${msg}`,
                  ...stats(),
                })
              } else {
                countError++
                totalProcessed++
                send({
                  type: 'progress',
                  fileName: file.name,
                  fileId: file.id,
                  status: 'error',
                  errorMessage: msg,
                  ...stats(),
                })
              }
            }
          }
        }

        // batch นี้เสร็จ → client จะส่ง batch ถัดไปเอง
        send({ type: 'done', ...stats() })
      } catch (err: unknown) {
        send({ type: 'error', errorMessage: err instanceof Error ? err.message : 'Unknown error' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      // กัน proxy/CDN buffer สตรีม → ส่ง event ทีละรูปแบบ realtime
      'X-Accel-Buffering': 'no',
    },
  })
}
