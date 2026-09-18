// ใช้ได้ทั้ง client/server — สร้าง URL รูปจาก Supabase Storage CDN
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

/** URL thumbnail (500px) บน CDN — โหลดตรง ไม่ผ่าน serverless */
export function thumbCdnUrl(driveFileId: string): string {
  return `${BASE}/storage/v1/object/public/thumbs/${driveFileId}.jpg`
}

/** URL รูปขนาดดูเต็มจอ (2000px) บน CDN */
export function displayCdnUrl(driveFileId: string): string {
  return `${BASE}/storage/v1/object/public/photos/${driveFileId}.jpg`
}

/** URL proxy (fallback เมื่อ CDN ยังไม่มีสำเนา — proxy จะ redirect ไป CDN เองถ้ามี) */
export function thumbProxyUrl(driveFileId: string, width = 500): string {
  return `/api/image/${driveFileId}?w=${width}`
}

// ─── โซนส่วนตัว: ทุก URL ผ่าน API ที่ตรวจ cookie ผู้ดูแล (ไม่มี URL สาธารณะ) ───

export function privateImageUrl(driveFileId: string, tier: 'thumb' | 'display'): string {
  return `/api/private/image/${driveFileId}?tier=${tier}`
}

export function privateDownloadUrl(driveFileId: string, name: string): string {
  return `/api/private/image/${driveFileId}?download=1&name=${encodeURIComponent(name)}`
}
