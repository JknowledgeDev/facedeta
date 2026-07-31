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

export interface GalleryPhoto {
  id: string              // drive_file_id
  name: string            // file_name
  eventName: string | null
  date: string            // event_date "YYYY-MM-DD"
  uploadedAt: string      // เวลา sync เข้าระบบ
}

/**
 * ดึงรูปทั้งหมดที่เคย sync เข้าระบบ (จากทุกโฟลเดอร์/ทุก URL)
 * อ่านจาก photo_index → "ทุกรูป" รวมรูปที่ไม่มีใบหน้าด้วย (1 แถว = 1 รูป)
 * เรียงใหม่สุดก่อน: event_date ลง, ชื่อไฟล์ลง
 * (paginate ทีละ 1000 แถว เพราะ Supabase จำกัด default 1000)
 */
export async function getGalleryPhotos(): Promise<GalleryPhoto[]> {
  const supabase = getSupabaseAdmin()
  const byId = new Map<string, GalleryPhoto>()
  const SIZE = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('photo_index')
      .select('drive_file_id, file_name, event_name, event_date, uploaded_at')
      .range(from, from + SIZE - 1)

    if (error || !data || data.length === 0) break

    for (const row of data) {
      const r = row as {
        drive_file_id: string | null
        file_name: string | null
        event_name: string | null
        event_date: string | null
        uploaded_at: string | null
      }
      if (!r.drive_file_id || byId.has(r.drive_file_id)) continue
      byId.set(r.drive_file_id, {
        id: r.drive_file_id,
        name: r.file_name ?? '',
        eventName: r.event_name ?? null,
        date: r.event_date ? r.event_date.slice(0, 10) : '',
        uploadedAt: r.uploaded_at ?? '',
      })
    }

    if (data.length < SIZE) break
    from += SIZE
  }

  const out = Array.from(byId.values())
  // ใหม่สุดก่อน: วันกิจกรรมลง, ชื่อไฟล์ numeric ลง, เวลา sync ลง
  out.sort((a, b) => {
    const byDate = (b.date || '').localeCompare(a.date || '')
    if (byDate !== 0) return byDate
    const byName = b.name.localeCompare(a.name, undefined, { numeric: true })
    if (byName !== 0) return byName
    return (b.uploadedAt || '').localeCompare(a.uploadedAt || '')
  })
  return out
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

// บันทึก "1 รูป" ลง photo_index (เก็บทุกรูป แม้ไม่มีใบหน้า)
// เรียกทั้งกรณี index สำเร็จ (hasFace=true) และไม่พบใบหน้า (hasFace=false)
export async function savePhotoIndex(data: {
  driveFileId: string
  fileName?: string
  eventName?: string
  eventDate?: string
  thumbnailUrl?: string
  hasFace: boolean
  faceCount: number
}): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('photo_index').upsert(
    {
      drive_file_id: data.driveFileId,
      file_name: data.fileName ?? null,
      event_name: data.eventName ?? null,
      event_date: data.eventDate ?? null,
      thumbnail_url: data.thumbnailUrl ?? null,
      has_face: data.hasFace,
      face_count: data.faceCount,
    },
    { onConflict: 'drive_file_id' }
  )
  if (error) throw new Error(`Supabase savePhotoIndex: ${error.message}`)
}

/**
 * เปลี่ยนชื่อกิจกรรม (ทั้ง face_index และ photo_index)
 * ถ้าชื่อใหม่ตรงกับกิจกรรมอื่นที่มีอยู่ = รวมกิจกรรมเข้าด้วยกัน
 * คืนจำนวนแถวที่ถูกเปลี่ยน
 */
export async function renameEvent(from: string, to: string): Promise<number> {
  const supabase = getSupabaseAdmin()

  const { count: c1, error: e1 } = await supabase
    .from('face_index')
    .update({ event_name: to }, { count: 'exact' })
    .eq('event_name', from)
  if (e1) throw new Error(`renameEvent face_index: ${e1.message}`)

  const { count: c2, error: e2 } = await supabase
    .from('photo_index')
    .update({ event_name: to }, { count: 'exact' })
    .eq('event_name', from)
  if (e2) throw new Error(`renameEvent photo_index: ${e2.message}`)

  return (c1 ?? 0) + (c2 ?? 0)
}

// ตรวจว่า driveFileId ถูกประมวลผล (sync) แล้วหรือยัง — เช็คจาก photo_index
// ครอบคลุมทั้งรูปที่มีหน้าและไม่มีหน้า จึงไม่ดึงรูปเดิมมาประมวลผลซ้ำ
export async function isPhotoProcessed(driveFileId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { count } = await supabase
    .from('photo_index')
    .select('*', { count: 'exact', head: true })
    .eq('drive_file_id', driveFileId)

  return (count ?? 0) > 0
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

// ลบ records ของ driveFileId (ทั้ง face_index และ photo_index)
export async function deleteFaceMappingsByFileId(driveFileId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('face_index')
    .delete()
    .eq('drive_file_id', driveFileId)
    .select('face_id')

  if (error) throw new Error(`Supabase deleteFaceMappings: ${error.message}`)

  // ลบออกจาก photo_index ด้วย เพื่อให้แกลเลอรี/สถิติไม่ค้าง
  const { error: pErr } = await supabase
    .from('photo_index')
    .delete()
    .eq('drive_file_id', driveFileId)
  if (pErr) throw new Error(`Supabase deletePhotoIndex: ${pErr.message}`)

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
      .from('photo_index')
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

export interface EventSummary {
  name: string
  dates: string[]      // วันที่ที่ระบุไว้ (event_date)
  fileIds: string[]    // drive_file_id ของรูปในกิจกรรมนี้
  count: number        // จำนวนรูป (distinct) ในกิจกรรม
}

/**
 * ดึงรายการกิจกรรมพร้อม drive_file_id ของรูปในแต่ละกิจกรรม
 * ใช้กรองรูปตามกิจกรรมโดยตรง (ไม่พึ่งวันที่ ซึ่งอาจไม่ตรงกับวันถ่าย)
 * (paginate ทีละ 1000 แถว)
 */
export async function getEventsList(): Promise<EventSummary[]> {
  const supabase = getSupabaseAdmin()
  const m = new Map<string, { dates: Set<string>; files: Set<string> }>()
  const SIZE = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('photo_index')
      .select('event_name, event_date, drive_file_id')
      .not('event_name', 'is', null)
      .range(from, from + SIZE - 1)

    if (error || !data || data.length === 0) break

    for (const row of data) {
      const name = (row as { event_name: string | null }).event_name
      const ed = (row as { event_date: string | null }).event_date
      const fid = (row as { drive_file_id: string | null }).drive_file_id
      if (!name) continue
      if (!m.has(name)) m.set(name, { dates: new Set(), files: new Set() })
      const e = m.get(name)!
      if (ed) e.dates.add(ed.slice(0, 10))
      if (fid) e.files.add(fid)
    }

    if (data.length < SIZE) break
    from += SIZE
  }

  return Array.from(m.entries()).map(([name, v]) => ({
    name,
    dates: Array.from(v.dates),
    fileIds: Array.from(v.files),
    count: v.files.size,
  }))
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
  totalPhotosWithFace: number
  totalPhotosNoFace: number
  totalEvents: number
  totalSearches: number
}> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('stats').select('*').single()
  return {
    totalFaces: data?.total_faces_indexed ?? 0,
    totalPhotos: data?.total_photos ?? 0,
    totalPhotosWithFace: data?.total_photos_with_face ?? 0,
    totalPhotosNoFace: data?.total_photos_no_face ?? 0,
    totalEvents: data?.total_events ?? 0,
    totalSearches: data?.total_searches ?? 0,
  }
}
