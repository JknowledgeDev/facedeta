// ใช้ได้ทั้ง client/server — สร้าง URL thumbnail จาก Supabase Storage CDN
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

/** URL thumbnail (500px) บน CDN — โหลดตรง ไม่ผ่าน serverless */
export function thumbCdnUrl(driveFileId: string): string {
  return `${BASE}/storage/v1/object/public/thumbs/${driveFileId}.jpg`
}

/** URL proxy (fallback เมื่อ CDN ยังไม่มี thumbnail) */
export function thumbProxyUrl(driveFileId: string, width = 500): string {
  return `/api/image/${driveFileId}?w=${width}`
}
