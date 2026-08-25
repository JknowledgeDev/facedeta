import { NextRequest, NextResponse } from 'next/server'
import { addFaceToList, trainFaceList } from '@/lib/azure-face'
import { saveFaceMapping, savePhotoIndex, saveNoFacePlaceholder, isPhotoProcessed } from '@/lib/supabase'
import { uploadFileToDrive, getDriveThumbnailUrl } from '@/lib/drive'
import { toJpegBuffer, AWS_MAX_BYTES } from '@/lib/image-utils'
import { cacheAllSizesSafe } from '@/lib/thumbs'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    const eventName = (formData.get('eventName') as string) ?? ''
    const eventDate = (formData.get('eventDate') as string) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 400 })
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer())

    // 1. Upload ไปยัง Google Drive
    const driveFile = await uploadFileToDrive(imageBuffer, file.name, file.type)

    // 2. ตรวจว่าประมวลผลแล้วหรือยัง
    if (await isPhotoProcessed(driveFile.id!)) {
      return NextResponse.json({ message: 'File already indexed', fileId: driveFile.id, facesIndexed: 0 })
    }

    // 3. เก็บสำเนาต้นฉบับ + 2000px + 500px ลง CDN แล้ว index ใบหน้า
    const fullJpeg = await cacheAllSizesSafe(driveFile.id!, imageBuffer)
    const jpeg = await toJpegBuffer(fullJpeg, 0, AWS_MAX_BYTES)
    const faceResults = await addFaceToList(jpeg, driveFile.id!)
    const thumbnailUrl = getDriveThumbnailUrl(driveFile.id!, 400)

    // เก็บ "ทุกรูป" ลง photo_index เสมอ แม้ไม่พบใบหน้า
    await savePhotoIndex({
      driveFileId: driveFile.id!,
      fileName: file.name,
      eventName: eventName || undefined,
      eventDate: eventDate || undefined,
      thumbnailUrl,
      hasFace: faceResults.length > 0,
      faceCount: faceResults.length,
    })

    if (faceResults.length === 0) {
      // ไม่พบใบหน้า → ลงเป็น "ภาพบรรยากาศ" ให้โผล่ใน gallery ด้วย
      await saveNoFacePlaceholder({
        driveFileId: driveFile.id!,
        fileName: file.name,
        eventName: eventName || undefined,
        eventDate: eventDate || undefined,
        thumbnailUrl,
      })
      return NextResponse.json({ message: 'No face detected in image', fileId: driveFile.id, facesIndexed: 0 })
    }

    // 4. บันทึก mapping ใน Supabase
    await Promise.all(
      faceResults.map((f) =>
        saveFaceMapping({
          faceId: f.persistedFaceId,
          driveFileId: driveFile.id!,
          fileName: file.name,
          eventName: eventName || undefined,
          eventDate: eventDate || undefined,
          thumbnailUrl,
        })
      )
    )

    // 5. Train model (async ใน background)
    trainFaceList().catch((e) => console.error('Train error:', e))

    return NextResponse.json({
      message: 'Indexed successfully',
      fileId: driveFile.id,
      facesIndexed: faceResults.length,
      fileName: file.name,
    })
  } catch (err: unknown) {
    console.error('Index face error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
