import { NextRequest, NextResponse } from 'next/server'
import { addFaceToList, trainFaceList } from '@/lib/azure-face'
import { saveFaceMapping, isFileIndexed } from '@/lib/supabase'
import { uploadFileToDrive, getDriveThumbnailUrl } from '@/lib/drive'

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

    // 2. ตรวจว่า index แล้วหรือยัง
    if (await isFileIndexed(driveFile.id!)) {
      return NextResponse.json({ message: 'File already indexed', fileId: driveFile.id, facesIndexed: 0 })
    }

    // 3. เพิ่มใบหน้าเข้า Azure LargeFaceList
    const faceResults = await addFaceToList(imageBuffer, driveFile.id!)

    if (faceResults.length === 0) {
      return NextResponse.json({ message: 'No face detected in image', fileId: driveFile.id, facesIndexed: 0 })
    }

    // 4. บันทึก mapping ใน Supabase
    const thumbnailUrl = getDriveThumbnailUrl(driveFile.id!, 400)
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
