import { createClient } from '@supabase/supabase-js'

export interface FaceIndexRow {
  id: string
  face_id: string
  drive_file_id: string
  file_name: string | null
  event_name: string | null
  event_date: string | null
  thumbnail_url: string | null
  uploaded_at: string
}

export interface SearchResult extends FaceIndexRow {
  confidence: number   // % ความคล้ายของใบหน้า (0–100)
  faceArea: number     // พื้นที่ใบหน้าในรูปต้นฉบับ (0–1)
  view_url: string
}

// Server-side client (ใช้ service role key)
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Client-side client (ใช้ anon key)
export function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// บันทึก face mapping หลังจาก IndexFaces สำเร็จ
export async function saveFaceMapping(data: {
  faceId: string
  driveFileId: string
  fileName?: string
  eventName?: string
  eventDate?: string
  thumbnailUrl?: string
}): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('face_index').upsert(
    {
      face_id: data.faceId,
      drive_file_id: data.driveFileId,
      file_name: data.fileName ?? null,
      event_name: data.eventName ?? null,
      event_date: data.eventDate ?? null,
      thumbnail_url: data.thumbnailUrl ?? null,
    },
    { onConflict: 'face_id' }
  )
  if (error) throw new Error(`Supabase saveFaceMapping: ${error.message}`)
}

// ค้นหา records จาก faceIds ที่ได้จาก Rekognition
export async function getFaceRecordsByIds(faceIds: string[]): Promise<FaceIndexRow[]> {
  if (faceIds.length === 0) return []
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('face_index')
    .select('*')
    .in('face_id', faceIds)

  if (error) throw new Error(`Supabase getFaceRecordsByIds: ${error.message}`)
  return data ?? []
}

// ตรวจว่า driveFileId ถูก index แล้วหรือยัง
export async function isFileIndexed(driveFileId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { count } = await supabase
    .from('face_index')
    .select('*', { count: 'exact', head: true })
    .eq('drive_file_id', driveFileId)

  return (count ?? 0) > 0
}

// ลบ records ของ driveFileId
export async function deleteFaceMappingsByFileId(driveFileId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('face_index')
    .delete()
    .eq('drive_file_id', driveFileId)
    .select('face_id')

  if (error) throw new Error(`Supabase deleteFaceMappings: ${error.message}`)
  return (data ?? []).map((r: { face_id: string }) => r.face_id)
}

/**
 * ดึงชื่อกิจกรรมจัดกลุ่มตามวันที่ (event_date)
 * คืน { "YYYY-MM-DD": ["กิจกรรม A", "กิจกรรม B"] }
 * (paginate ทีละ 1000 แถว เพราะ Supabase จำกัด default 1000)
 */
export async function getEventsByDate(): Promise<Record<string, string[]>> {
  const supabase = getSupabaseAdmin()
  const map: Record<string, Set<string>> = {}
  const SIZE = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('face_index')
      .select('event_date, event_name')
      .not('event_date', 'is', null)
      .range(from, from + SIZE - 1)

    if (error || !data || data.length === 0) break

    for (const row of data) {
      const ed = (row as { event_date: string | null }).event_date
      const en = (row as { event_name: string | null }).event_name
      if (!ed) continue
      const date = ed.slice(0, 10)
      if (!map[date]) map[date] = new Set()
      if (en) map[date].add(en)
    }

    if (data.length < SIZE) break
    from += SIZE
  }

  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(map)) out[k] = Array.from(v)
  return out
}

/**
 * ดึงเวลาที่อัปโหลดเข้าระบบ (uploaded_at) ของแต่ละรูป
 * คืน { drive_file_id: uploaded_at(ISO) } — เอาเวลาล่าสุดถ้ารูปมีหลายใบหน้า
 * (paginate ทีละ 1000 แถว)
 */
export async function getUploadTimesByFile(): Promise<Record<string, string>> {
  const supabase = getSupabaseAdmin()
  const map: Record<string, string> = {}
  const SIZE = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('face_index')
      .select('drive_file_id, uploaded_at')
      .range(from, from + SIZE - 1)

    if (error || !data || data.length === 0) break

    for (const row of data) {
      const id = (row as { drive_file_id: string | null }).drive_file_id
      const ts = (row as { uploaded_at: string | null }).uploaded_at
      if (!id || !ts) continue
      if (!map[id] || ts > map[id]) map[id] = ts
    }

    if (data.length < SIZE) break
    from += SIZE
  }

  return map
}

// บันทึก search log
export async function logSearch(matchCount: number, threshold: number): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase.from('search_log').insert({ match_count: matchCount, threshold })
}

// ดึงสถิติ
export async function getStats(): Promise<{
  totalFaces: number
  totalPhotos: number
  totalEvents: number
  totalSearches: number
}> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('stats').select('*').single()
  return {
    totalFaces: data?.total_faces_indexed ?? 0,
    totalPhotos: data?.total_photos ?? 0,
    totalEvents: data?.total_events ?? 0,
    totalSearches: data?.total_searches ?? 0,
  }
}
