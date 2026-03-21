import { google } from 'googleapis'

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID!

function getAuthClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  auth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  })
  return auth
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuthClient() })
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime?: string
  thumbnailLink?: string
  webViewLink?: string
}

// ดึงรายการไฟล์รูปภาพจาก folder
// folderId: ถ้าไม่ส่งมาจะใช้ค่าจาก env GOOGLE_DRIVE_FOLDER_ID
export async function listImagesInFolder(
  pageToken?: string,
  folderId?: string
): Promise<{
  files: DriveFile[]
  nextPageToken?: string
}> {
  const drive = getDriveClient()
  const targetFolder = folderId || FOLDER_ID
  const response = await drive.files.list({
    q: `'${targetFolder}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: 'nextPageToken, files(id, name, mimeType, createdTime, thumbnailLink, webViewLink)',
    pageSize: 50,
    pageToken,
    orderBy: 'createdTime desc',
  })

  return {
    files: (response.data.files ?? []) as DriveFile[],
    nextPageToken: response.data.nextPageToken ?? undefined,
  }
}

// ดาวน์โหลดรูปภาพเป็น Buffer
export async function downloadFileAsBuffer(fileId: string): Promise<Buffer> {
  const drive = getDriveClient()
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  )
  return Buffer.from(response.data as ArrayBuffer)
}

// Upload รูปไปยัง Google Drive
export async function uploadFileToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<DriveFile> {
  const drive = getDriveClient()
  const { Readable } = await import('stream')
  const stream = Readable.from(buffer)

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [FOLDER_ID],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id, name, mimeType, createdTime, thumbnailLink, webViewLink',
  })

  // ตั้งให้ public อ่านได้ (แสดงรูปใน UI)
  await drive.permissions.create({
    fileId: response.data.id!,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  return response.data as DriveFile
}

// สร้าง URL แสดงรูปโดยตรง
export function getDriveThumbnailUrl(fileId: string, size: number = 400): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=s${size}`
}

// สร้าง URL เปิดรูปใน Google Drive
export function getDriveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`
}

// ลบไฟล์จาก Drive
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient()
  await drive.files.delete({ fileId })
}

// ดึงข้อมูล metadata ของไฟล์
export async function getFileMetadata(fileId: string): Promise<DriveFile> {
  const drive = getDriveClient()
  const response = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, createdTime, thumbnailLink, webViewLink',
  })
  return response.data as DriveFile
}
