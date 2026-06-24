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

/**
 * ดึง "รูปย่อสำเร็จรูป" (thumbnailLink) จาก Google CDN — เร็วกว่าดาวน์โหลดไฟล์เต็ม
 * แล้วแปลง HEIC มาก (~840ms เทียบกับ ~10s) และได้ JPEG พร้อมใช้เลย
 * คืน null ถ้าไม่มี thumbnail; throw (404) ถ้าไฟล์ถูกลบ → ให้ proxy จัดการ
 */
export async function getThumbnailBuffer(fileId: string, size: number): Promise<Buffer | null> {
  const auth = getAuthClient()
  const drive = google.drive({ version: 'v3', auth })

  const meta = await drive.files.get({ fileId, fields: 'thumbnailLink' })
  let link = meta.data.thumbnailLink
  if (!link) return null

  // เปลี่ยนขนาด: ลงท้าย =s220 → =s<size> (Google รองรับสูงสุด ~1600)
  const px = Math.min(Math.max(size, 100), 1600)
  link = link.replace(/=s\d+[^/]*$/, `=s${px}`)

  const tokenRes = await auth.getAccessToken()
  const token = typeof tokenRes === 'string' ? tokenRes : tokenRes?.token
  const res = await fetch(link, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
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

export interface PhotoMeta {
  id: string
  name: string
  time: string   // createdTime (เวลาอัปโหลด Drive) สำหรับเรียง/แสดงผล
  date: string   // วันที่ไทย "YYYY-MM-DD" สำหรับจัดกลุ่ม/กรอง
}

interface RawDriveImage {
  id: string
  name: string
  createdTime: string
}

/**
 * ดึงรูปทั้งหมดจากโฟลเดอร์ + ทุก subfolder แบบ recursive (BFS)
 *
 * สำคัญมาก: Drive query `'<id>' in parents` คืนเฉพาะไฟล์ที่อยู่ในโฟลเดอร์นั้น
 * "โดยตรง" เท่านั้น — ไม่ลงไปใน subfolder ดังนั้นถ้ารูปจัดเก็บแยกเป็นโฟลเดอร์ย่อย
 * ตามกิจกรรม จะดึงได้แค่รูปใน root → ต้องเดินทุกโฟลเดอร์เอง
 *
 * - ขอเฉพาะ field เบา (id, name, createdTime) — ห้ามขอ imageMediaMetadata
 *   เพราะ Drive จะจำกัดผลลัพธ์ ~2,000 รายการเมื่อขอ metadata หนัก
 * - ไม่ใส่ orderBy (ก็จำกัด ~2,000 เช่นกัน) → paginate ครบทุกหน้า
 * - de-dupe ด้วย id เพราะไฟล์ Drive อาจมีหลาย parent
 */
async function listAllImagesRecursive(rootFolderId: string): Promise<RawDriveImage[]> {
  const drive = getDriveClient()
  const out: RawDriveImage[] = []
  const seenPhoto = new Set<string>()
  const seenFolder = new Set<string>()
  const queue: string[] = [rootFolderId]

  while (queue.length > 0) {
    const folderId = queue.shift()!
    if (seenFolder.has(folderId)) continue
    seenFolder.add(folderId)

    // 1) หา subfolder ในโฟลเดอร์นี้ → เข้าคิว
    let folderToken: string | undefined
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'nextPageToken, files(id)',
        pageSize: 1000,
        pageToken: folderToken,
      })
      for (const f of res.data.files ?? []) {
        if (f.id && !seenFolder.has(f.id)) queue.push(f.id)
      }
      folderToken = res.data.nextPageToken ?? undefined
    } while (folderToken)

    // 2) ดึงรูปในโฟลเดอร์นี้ (paginate ครบทุกหน้า)
    let photoToken: string | undefined
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
        fields: 'nextPageToken, files(id, name, createdTime)',
        pageSize: 1000,
        pageToken: photoToken,
      })
      for (const f of res.data.files ?? []) {
        if (!f.id || seenPhoto.has(f.id)) continue
        seenPhoto.add(f.id)
        out.push({ id: f.id, name: f.name ?? '', createdTime: f.createdTime ?? '' })
      }
      photoToken = res.data.nextPageToken ?? undefined
    } while (photoToken)
  }

  return out
}

/**
 * ดึงรายการไฟล์รูปทั้งหมด (รวมทุก subfolder) — id + name เท่านั้น
 * ใช้สำหรับ sync: scan ต้นไม้ครั้งเดียว แล้วให้ client ส่งทีละ batch มา index
 */
export async function listAllImageFiles(folderId?: string): Promise<{ id: string; name: string }[]> {
  const raw = await listAllImagesRecursive(folderId || FOLDER_ID)
  return raw.map((f) => ({ id: f.id, name: f.name }))
}

/**
 * ดึงรูปทั้งหมด (รวม subfolder) เรียงใหม่สุด → เก่าสุด
 * เรียงตาม createdTime (เวลาอัปโหลด) เป็นหลัก → ทนต่อชื่อไฟล์ปนกัน
 * (LINE_/DSC_/IMG_) และเลขรอบใหม่ (IMG_9999 → IMG_0001); ชื่อไฟล์เป็นตัวตัดสิน
 */
export async function getAllPhotosSorted(folderId?: string): Promise<PhotoMeta[]> {
  const targetFolder = folderId || FOLDER_ID
  const raw = await listAllImagesRecursive(targetFolder)

  const out: PhotoMeta[] = raw.map((f) => ({
    id: f.id,
    name: f.name,
    time: f.createdTime,
    date: f.createdTime ? toThaiDateString(f.createdTime) : '',
  }))

  // ใหม่สุดก่อน: createdTime desc เป็นหลัก, ชื่อไฟล์ numeric desc เป็นตัวตัดสิน
  out.sort((a, b) => {
    const byTime = (b.time || '').localeCompare(a.time || '')
    if (byTime !== 0) return byTime
    return b.name.localeCompare(a.name, undefined, { numeric: true })
  })
  return out
}

/**
 * สแกนรูปทั้งหมด → จัดกลุ่มตามวันที่ (เวลาไทย) สำหรับปฏิทิน highlight
 * คืน { days: { "YYYY-MM-DD": count }, total }
 */
export async function getPhotoCalendar(folderId?: string): Promise<{
  days: Record<string, number>
  total: number
}> {
  const targetFolder = folderId || FOLDER_ID
  const raw = await listAllImagesRecursive(targetFolder)

  const days: Record<string, number> = {}
  for (const f of raw) {
    if (!f.createdTime) continue
    const date = toThaiDateString(f.createdTime)
    days[date] = (days[date] ?? 0) + 1
  }

  return { days, total: raw.length }
}

/** นับรูปทั้งหมดในโฟลเดอร์ + ทุก subfolder */
export async function countImagesInFolder(folderId?: string): Promise<number> {
  const targetFolder = folderId || FOLDER_ID
  const raw = await listAllImagesRecursive(targetFolder)
  return raw.length
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
