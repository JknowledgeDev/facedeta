import { NextRequest } from 'next/server'
import { addFaceToList } from '@/lib/azure-face'
import { saveFaceMapping, isFileIndexed } from '@/lib/supabase'
import { listImagesInFolder, downloadFileAsBuffer, getDriveViewUrl } from '@/lib/drive'

export const runtime = 'nodejs'
export const maxDuration = 300

export interface SyncEvent {
  type: 'progress' | 'page-done' | 'done' | 'error'
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
  /** ถ้ายังมีหน้าต่อ → client จะส่ง pageToken นี้กลับมาใน request ถัดไป */
  nextPageToken?: string
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const eventName: string = body.eventName ?? ''
  const eventDate: string = body.eventDate ?? ''
  const folderId: string = body.folderId ?? ''
  /** pageToken จาก client เพื่อ resume หน้าถัดไป */
  const resumeToken: string | undefined = body.resumeToken || undefined
  /** counters สะสมจาก page ก่อนหน้า (client ส่งมาเพื่อให้นับต่อ) */
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
        // ดึงเฉพาะ 1 page ต่อ request (ป้องกัน Vercel timeout)
        const { files, nextPageToken } = await listImagesInFolder(resumeToken, folderId || undefined)

        for (const file of files) {
          if (await isFileIndexed(file.id)) {
            countSkipped++
            totalProcessed++
            send({ type: 'progress', fileName: file.name, fileId: file.id, status: 'skipped', ...stats() })
            continue
          }

          try {
            const buffer = await downloadFileAsBuffer(file.id)
            const faceResults = await addFaceToList(buffer, file.id)

            if (faceResults.length === 0) {
              countNoFace++
              totalProcessed++
              send({ type: 'progress', fileName: file.name, fileId: file.id, status: 'no_face', ...stats() })
              continue
            }

            const viewUrl = getDriveViewUrl(file.id)
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
          } catch (err: unknown) {
            countError++
            totalProcessed++
            send({
              type: 'progress',
              fileName: file.name,
              fileId: file.id,
              status: 'error',
              errorMessage: err instanceof Error ? err.message : 'Unknown error',
              ...stats(),
            })
          }
        }

        if (nextPageToken) {
          // ยังมีหน้าต่อ → ส่ง token กลับให้ client เรียกรอบถัดไปเอง
          send({ type: 'page-done', nextPageToken, ...stats() })
        } else {
          // ครบทุกรูปแล้ว
          send({ type: 'done', ...stats() })
        }
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
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
