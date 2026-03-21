import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  ListFacesCommand,
  type FaceRecord,
  type FaceMatch,
} from '@aws-sdk/client-rekognition'

const client = new RekognitionClient({
  region: process.env.AWS_REGION ?? 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const COLLECTION_ID = process.env.REKOGNITION_COLLECTION_ID ?? 'facedeta-collection'

// สร้าง collection ถ้ายังไม่มี
export async function ensureCollection(): Promise<void> {
  try {
    await client.send(new CreateCollectionCommand({ CollectionId: COLLECTION_ID }))
    console.log(`Collection "${COLLECTION_ID}" created.`)
  } catch (err: unknown) {
    // ResourceAlreadyExistsException = ปกติ ไม่ต้อง throw
    if ((err as { name?: string }).name !== 'ResourceAlreadyExistsException') {
      throw err
    }
  }
}

// Index ใบหน้าในรูปภาพ (imageBytes = Buffer)
export async function indexFaces(
  imageBytes: Buffer,
  externalImageId: string
): Promise<FaceRecord[]> {
  await ensureCollection()

  const response = await client.send(
    new IndexFacesCommand({
      CollectionId: COLLECTION_ID,
      Image: { Bytes: imageBytes },
      ExternalImageId: externalImageId, // ใช้ driveFileId
      DetectionAttributes: [],
      MaxFaces: 10,
      QualityFilter: 'AUTO',
    })
  )

  return response.FaceRecords ?? []
}

// ค้นหาใบหน้าที่ match กับรูปที่ upload
export async function searchFacesByImage(
  imageBytes: Buffer,
  threshold: number = 80
): Promise<FaceMatch[]> {
  const response = await client.send(
    new SearchFacesByImageCommand({
      CollectionId: COLLECTION_ID,
      Image: { Bytes: imageBytes },
      MaxFaces: 100,
      FaceMatchThreshold: threshold,
      QualityFilter: 'AUTO',
    })
  )

  return response.FaceMatches ?? []
}

// ลบ face ออกจาก collection
export async function deleteFaces(faceIds: string[]): Promise<void> {
  if (faceIds.length === 0) return
  await client.send(
    new DeleteFacesCommand({
      CollectionId: COLLECTION_ID,
      FaceIds: faceIds,
    })
  )
}

// นับจำนวนใบหน้าที่ index แล้ว
export async function countIndexedFaces(): Promise<number> {
  let total = 0
  let nextToken: string | undefined

  do {
    const response = await client.send(
      new ListFacesCommand({
        CollectionId: COLLECTION_ID,
        MaxResults: 1000,
        NextToken: nextToken,
      })
    )
    total += response.Faces?.length ?? 0
    nextToken = response.NextToken
  } while (nextToken)

  return total
}
