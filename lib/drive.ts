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

/** Thailand timezone offset (UTC+7) เป็น ms */
const TH_OFFSET_MS = 7 * 60 * 60 * 1000

/** แปลง ISO timestamp (UTC) → วันที่ตามเวลาไทย "YYYY-MM-DD" */
export function toThaiDateString(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getTime() + TH_OFFSET_MS).toISOString().slice(0, 10)
}

/** สร้างช่วงเวลา UTC ของ "วันไทย" หนึ่งวัน (สำหรับ query Drive) */
function thaiDayToUtcRange(date: string): { startUtc: string; endUtc: string } {
  // date = "YYYY-MM-DD" (เวลาไทย) → 00:00 +07:00
  const start = new Date(`${date}T00:00:00+07:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

// ดึงรายการไฟล์รูปภาพจาก folder
// folderId: ถ้าไม่ส่งมาจะใช้ค่าจาก env GOOGLE_DRIVE_FOLDER_ID
// date: ถ้าส่งมา (YYYY-MM-DD เวลาไทย) จะกรองเฉพาะรูปของวันนั้น
export async function listImagesInFolder(
  pageToken?: string,
  folderId?: string,
  date?: string
): Promise<{
  files: DriveFile[]
  nextPageToken?: string
}> {
  const drive = getDriveClient()
  const targetFolder = folderId || FOLDER_ID

  let q = `'${targetFolder}' in parents and mimeType contains 'image/' and trashed = false`
  if (date) {
    const { startUtc, endUtc } = thaiDayToUtcRange(date)
    q += ` and createdTime >= '${startUtc}' and createdTime < '${endUtc}'`
  }

  const response = await drive.files.list({
    q,
    fields: 'nextPageToken, files(id, name, mimeType, createdTime, thumbnailLink, webViewLink)',
    pageSize: 100,
    pageToken,
    // หมายเหตุ: ห้ามใส่ orderBy — Drive API จะหยุด paginate ที่ ~2,000 รายการ
    // เมื่อใช้ orderBy บน folder ใหญ่ ทำให้ดึงรูปไม่ครบ (ทั้ง gallery และ sync)
  })

  return {
    files: (response.data.files ?? []) as DriveFile[],
    nextPageToken: response.data.nextPageToken ?? undefined,
  }
}

/**
 * สแกนรูปทั้งหมด → จัดกลุ่มตามวันที่ (เวลาไทย) สำหรับปฏิทิน highlight
 * คืน { days: { "YYYY-MM-DD": count }, total }
 */
export async function getPhotoCalendar(folderId?: string): Promise<{
  days: Record<string, number>
  total: number
}> {
  const drive = getDriveClient()
  const targetFolder = folderId || FOLDER_ID
  const days: Record<string, number> = {}
  let total = 0
  let pageToken: string | undefined

  do {
    const response = await drive.files.list({
      q: `'${targetFolder}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'nextPageToken, files(id, createdTime)',
      pageSize: 1000,
      pageToken,
    })
    for (const f of response.data.files ?? []) {
      if (!f.createdTime) continue
      const date = toThaiDateString(f.createdTime)
      days[date] = (days[date] ?? 0) + 1
      total++
    }
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)

  return { days, total }
}

/** นับรูปทั้งหมดในโฟลเดอร์ (ใช้ pageSize 1000 เพื่อความเร็ว) */
export async function countImagesInFolder(folderId?: string): Promise<number> {
  const drive = getDriveClient()
  const targetFolder = folderId || FOLDER_ID
  let total = 0
  let pageToken: string | undefined

  do {
    const response = await drive.files.list({
      q: `'${targetFolder}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'nextPageToken, files(id)',
      pageSize: 1000,
      pageToken,
    })
    total += (response.data.files ?? []).length
    pageToken = response.data.nextPageToken ?? undefined
  } while (pageToken)

  return total
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
