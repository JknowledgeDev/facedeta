import { NextRequest } from 'next/server'
import { addFaceToList } from '@/lib/azure-face'
import { saveFaceMapping, isFileIndexed } from '@/lib/supabase'
import { listImagesInFolder, downloadFileAsBuffer, getDriveViewUrl } from '@/lib/drive'

export const runtime = 'nodejs'
export const maxDuration = 300

// SSE event types
export interface SyncEvent {
  type: 'progress' | 'done' | 'error'
  fileName?: string
  fileId?: string
  status?: 'indexed' | 'skipped' | 'no_face' | 'error'
  facesIndexed?: number
  errorMessage?: string
  totalProcessed?: number
  totalFaces?: number
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const eventName: string = body.eventName ?? ''
  const eventDate: string = body.eventDate ?? ''
  const folderId: string = body.folderId ?? ''   // custom folder id (optional)

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SyncEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        )
      }

      let totalProcessed = 0
      let totalFaces = 0
      let pageToken: string | undefined

      try {
        // วนดึงทุก page จน หมด (ไม่จำกัด)
        do {
          const { files, nextPageToken } = await listImagesInFolder(pageToken, folderId || undefined)
          pageToken = nextPageToken

          for (const file of files) {
            // ข้ามรูปที่ index แล้ว
            if (await isFileIndexed(file.id)) {
              send({ type: 'progress', fileName: file.name, fileId: file.id, status: 'skipped' })
              totalProcessed++
              continue
            }

            try {
              const buffer = await downloadFileAsBuffer(file.id)
              const faceResults = await addFaceToList(buffer, file.id)

              if (faceResults.length === 0) {
                send({ type: 'progress', fileName: file.name, fileId: file.id, status: 'no_face' })
                totalProcessed++
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
              totalProcessed++

              // ส่งผลทันทีไม่ต้องรอรูปอื่น
              send({
                type: 'progress',
                fileName: file.name,
                fileId: file.id,
                status: 'indexed',
                facesIndexed: faceResults.length,
                totalProcessed,
                totalFaces,
              })
            } catch (err: unknown) {
              totalProcessed++
              send({
                type: 'progress',
                fileName: file.name,
                fileId: file.id,
                status: 'error',
                errorMessage: err instanceof Error ? err.message : 'Unknown error',
                totalProcessed,
                totalFaces,
              })
            }
          }
        } while (pageToken) // ดึงต่อจนหมดทุก page

        // เสร็จสมบูรณ์
        send({ type: 'done', totalProcessed, totalFaces })
      } catch (err: unknown) {
        send({
          type: 'error',
          errorMessage: err instanceof Error ? err.message : 'Unknown error',
        })
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
