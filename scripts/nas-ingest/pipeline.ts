/**
 * FaceDeta NAS ingest — กวาดรูปจากโฟลเดอร์บน NAS เข้าโซนส่วนตัวโดยตรง (ไม่ผ่าน Drive)
 *
 *  - เก็บเฉพาะรูปย่อ 2000px + 500px (ต้นฉบับอยู่บน NAS ถาวร) → ไม่อัพ bucket originals
 *  - id ของรูป = "nas_<md5 ของไฟล์>" → ไฟล์เดียวกันสองที่บน NAS นับครั้งเดียว
 *  - ข้ามไฟล์ที่ซ้ำกับรูปที่อยู่ในระบบแล้ว (md5 ตรงกับไฟล์ใน Drive ส่วนตัว หรือกับต้นฉบับโซนสาธารณะ)
 *  - ชื่อกิจกรรมจากโฟลเดอร์: "โฟลเดอร์บนสุด › โฟลเดอร์ที่เก็บไฟล์"  วันที่จากเวลาไฟล์
 *  - thumbnail_url เก็บเป็น "nas://<share>/<path>" → การ์ดรูปโชว์ตำแหน่งบน NAS
 *
 *  โหมด: ยังไม่ตั้ง INGEST_APPROVED=yes → สแกนนับไฟล์ + ประเมินค่าใช้จ่าย (state/scan-report.txt) เท่านั้น
 *        ตั้งแล้ว → ประมวลผลไฟล์ค้าง แล้ววนสแกนรูปใหม่ทุก POLL_MINUTES นาที ตลอดเวลา
 */
import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { addFaceToList, collectionOf } from '@/lib/azure-face'
import { saveFaceMapping, saveNoFacePlaceholder, getAllFileIds, getSupabaseAdmin } from '@/lib/supabase'
import { cacheAllSizesSafe } from '@/lib/thumbs'
import { toJpegBuffer, AWS_MAX_BYTES } from '@/lib/image-utils'

// ─── config ───────────────────────────────────────────────────────────────────
const PHOTOS_ROOT = process.env.PHOTOS_ROOT ?? '/photos'
const NAS_FOLDERS = (process.env.NAS_FOLDERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
const SHARE_NAME = process.env.NAS_SHARE_NAME ?? path.basename(PHOTOS_ROOT)
const STATE_DIR = process.env.STATE_DIR ?? './state'
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY ?? '3', 10) || 3)
const POLL_MINUTES = Math.max(1, parseInt(process.env.POLL_MINUTES ?? '30', 10) || 30)
const APPROVED = /^(yes|true|1)$/i.test(process.env.INGEST_APPROVED ?? '')
const RUN_ONCE = /^(yes|true|1)$/i.test(process.env.RUN_ONCE ?? '')   // ทำรอบเดียวแล้วจบ (ทดสอบ/cron)
const MAX_ATTEMPTS = 3
const MIN_AGE_MS = 2 * 60 * 1000   // ไฟล์ที่เพิ่งเขียนไม่ถึง 2 นาที → รอรอบหน้า (อาจกำลังคัดลอก)

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.tif', '.tiff', '.cr2', '.cr3', '.arw', '.rw2', '.nef', '.dng'])
const SKIP_DIRS = new Set(['@eaDir', '#recycle', '#snapshot', '@Recycle', '.SynologyWorkingDirectory'])

const THB_PER_IMAGE = 0.035          // AWS IndexFaces ≈ $0.001/รูป
const MB_PER_IMAGE = 0.6             // 2000px + 500px โดยเฉลี่ย

fs.mkdirSync(STATE_DIR, { recursive: true })
const LOG_FILE = path.join(STATE_DIR, 'ingest.log')
const STATE_FILE = path.join(STATE_DIR, 'state.json')
const REPORT_FILE = path.join(STATE_DIR, 'scan-report.txt')

function log(msg: string) {
  const line = `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] ${msg}`
  console.log(line)
  try { fs.appendFileSync(LOG_FILE, line + '\n') } catch { /* ignore */ }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const thaiDate = (ms: number) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10)

// ─── state ────────────────────────────────────────────────────────────────────
type Status = 'done' | 'dup' | 'error'
interface Entry { size: number; mtime: number; status: Status; id?: string; attempts?: number; error?: string; faces?: number }
type State = Record<string, Entry>   // key = path สัมพัทธ์จาก PHOTOS_ROOT

function loadState(): State {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as State } catch { return {} }
}
function saveState(state: State) {
  const tmp = STATE_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(state))
  fs.renameSync(tmp, STATE_FILE)
}

// ─── walk ─────────────────────────────────────────────────────────────────────
interface Found { rel: string; abs: string; size: number; mtime: number }

function walk(dirAbs: string, rootAbs: string, out: Found[]) {
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dirAbs, { withFileTypes: true }) } catch (e) { log(`อ่านโฟลเดอร์ไม่ได้ ${dirAbs}: ${(e as Error).message}`); return }
  for (const ent of entries) {
    const name = ent.name
    if (name.startsWith('.') || name.startsWith('._')) continue
    const abs = path.join(dirAbs, name)
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      walk(abs, rootAbs, out)
      continue
    }
    if (!ent.isFile()) continue
    if (!IMAGE_EXT.has(path.extname(name).toLowerCase())) continue
    try {
      const st = fs.statSync(abs)
      out.push({ rel: path.relative(rootAbs, abs).split(path.sep).join('/'), abs, size: st.size, mtime: st.mtimeMs })
    } catch { /* หายไประหว่าง scan */ }
  }
}

function scanAll(): Found[] {
  const out: Found[] = []
  const roots = NAS_FOLDERS.length ? NAS_FOLDERS.map((f) => path.join(PHOTOS_ROOT, f)) : [PHOTOS_ROOT]
  for (const r of roots) {
    if (!fs.existsSync(r)) { log(`⚠ ไม่พบโฟลเดอร์ ${r} (ตรวจ volume ใน docker-compose.yml)`); continue }
    walk(r, PHOTOS_ROOT, out)
  }
  return out
}

/** ชื่อกิจกรรมจาก path สัมพัทธ์: "บนสุด" หรือ "บนสุด › โฟลเดอร์ที่เก็บไฟล์" */
function eventNameOf(rel: string): string {
  const parts = rel.split('/')
  parts.pop()
  if (parts.length === 0) return SHARE_NAME
  const top = parts[0]
  const parent = parts[parts.length - 1]
  return parent === top ? top : `${top} › ${parent}`
}

// ─── ชุด md5 ของรูปที่อยู่ในระบบแล้ว (กันซ้ำ) ───────────────────────────────────
interface Md5Cache { at: number; md5: string[] }
const CACHE_TTL = 6 * 3600 * 1000

async function loadCached(name: string, build: () => Promise<string[]>): Promise<Set<string>> {
  const file = path.join(STATE_DIR, name)
  try {
    const c = JSON.parse(fs.readFileSync(file, 'utf8')) as Md5Cache
    if (Date.now() - c.at < CACHE_TTL) return new Set(c.md5)
  } catch { /* no cache */ }
  const md5 = await build()
  fs.writeFileSync(file, JSON.stringify({ at: Date.now(), md5 } as Md5Cache))
  return new Set(md5)
}

/** md5 ของทุกรูปใน Drive บัญชีส่วนตัว (Drive API ให้ md5Checksum มาฟรี) — เรียก REST ตรง ไม่ต้องใช้ googleapis */
async function driveMd5s(): Promise<string[]> {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PRIVATE_GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !PRIVATE_GOOGLE_REFRESH_TOKEN) {
    log('ไม่มีข้อมูล Google OAuth → ข้ามการเทียบซ้ำกับ Drive')
    return []
  }
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: PRIVATE_GOOGLE_REFRESH_TOKEN, grant_type: 'refresh_token',
    }),
  }).then((r) => r.json() as Promise<{ access_token?: string; error?: string }>)
  if (!tok.access_token) { log(`Drive token error: ${tok.error ?? 'unknown'} → ข้ามการเทียบซ้ำกับ Drive`); return [] }

  const out: string[] = []
  let pageToken: string | undefined
  do {
    const u = new URL('https://www.googleapis.com/drive/v3/files')
    u.searchParams.set('q', "mimeType contains 'image/' and trashed = false")
    u.searchParams.set('fields', 'nextPageToken, files(md5Checksum)')
    u.searchParams.set('pageSize', '1000')
    u.searchParams.set('supportsAllDrives', 'true')
    u.searchParams.set('includeItemsFromAllDrives', 'true')
    u.searchParams.set('corpora', 'allDrives')
    if (pageToken) u.searchParams.set('pageToken', pageToken)
    const res = await fetch(u, { headers: { Authorization: `Bearer ${tok.access_token}` } })
    if (!res.ok) { log(`Drive list error ${res.status} → ใช้เท่าที่ได้ (${out.length})`); break }
    const d = (await res.json()) as { nextPageToken?: string; files?: { md5Checksum?: string }[] }
    for (const f of d.files ?? []) if (f.md5Checksum) out.push(f.md5Checksum.toLowerCase())
    pageToken = d.nextPageToken
  } while (pageToken)
  return out
}

/** md5 ของต้นฉบับโซนสาธารณะ (JPG เก็บไฟล์เดิมทุก byte → eTag ของ object = md5) */
async function publicOriginalMd5s(): Promise<string[]> {
  const sb = getSupabaseAdmin()
  const out: string[] = []
  const LIMIT = 1000
  for (let offset = 0; ; offset += LIMIT) {
    const { data, error } = await sb.storage.from('originals').list('', { limit: LIMIT, offset })
    if (error) { log(`list originals error: ${error.message} → ใช้เท่าที่ได้ (${out.length})`); break }
    for (const o of data ?? []) {
      const tag = String((o.metadata as { eTag?: string } | null)?.eTag ?? '').replace(/"/g, '')
      if (/^[0-9a-f]{32}$/i.test(tag)) out.push(tag.toLowerCase())
    }
    if (!data || data.length < LIMIT) break
  }
  return out
}

// ─── ประมวลผลไฟล์เดียว ───────────────────────────────────────────────────────
interface Ctx { known: Set<string>; privateIds: Set<string> }
type Outcome = { status: 'done'; id: string; faces: number } | { status: 'dup'; id: string } | { status: 'error'; error: string }

async function processOne(f: Found, ctx: Ctx): Promise<Outcome> {
  const buf = fs.readFileSync(f.abs)
  if (buf.length === 0) return { status: 'error', error: 'ไฟล์ว่าง (0 bytes)' }
  const md5 = createHash('md5').update(buf).digest('hex')
  const id = `nas_${md5}`
  if (ctx.known.has(md5)) return { status: 'dup', id }
  if (ctx.privateIds.has(id)) return { status: 'done', id, faces: -1 }

  const eventName = eventNameOf(f.rel)
  const eventDate = thaiDate(f.mtime)
  const nasUrl = `nas://${SHARE_NAME}/${f.rel}`
  const fileName = path.basename(f.rel)

  // รูปย่อ 2 ระดับเท่านั้น (ไม่เก็บต้นฉบับ) แล้วได้ JPEG เต็มไว้ index ต่อ
  const full = await cacheAllSizesSafe(id, buf, 'private', { withOriginal: false })
  const jpeg = await toJpegBuffer(full, 0, AWS_MAX_BYTES)
  const faces = await addFaceToList(jpeg, id, collectionOf('private'))

  if (faces.length === 0) {
    await saveNoFacePlaceholder({ driveFileId: id, fileName, eventName, eventDate, thumbnailUrl: nasUrl }, 'private')
  } else {
    await Promise.all(faces.map((fc) =>
      saveFaceMapping({ faceId: fc.persistedFaceId, driveFileId: id, fileName, eventName, eventDate, thumbnailUrl: nasUrl }, 'private')
    ))
  }
  ctx.privateIds.add(id)
  ctx.known.add(md5)
  return { status: 'done', id, faces: faces.length }
}

// ─── รายงานสแกน ──────────────────────────────────────────────────────────────
function writeReport(files: Found[], pending: Found[], state: State) {
  const byTop = new Map<string, { n: number; bytes: number }>()
  for (const f of pending) {
    const top = f.rel.split('/')[0]
    const cur = byTop.get(top) ?? { n: 0, bytes: 0 }
    cur.n++; cur.bytes += f.size; byTop.set(top, cur)
  }
  const totalBytes = files.reduce((a, b) => a + b.size, 0)
  const pendBytes = pending.reduce((a, b) => a + b.size, 0)
  const done = Object.values(state).filter((e) => e.status === 'done').length
  const dup = Object.values(state).filter((e) => e.status === 'dup').length
  const err = Object.values(state).filter((e) => e.status === 'error').length
  const lines = [
    `รายงานสแกน NAS — ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    `โฟลเดอร์: ${SHARE_NAME}/${NAS_FOLDERS.join(', ') || '(ทั้งหมด)'}`,
    ``,
    `ไฟล์รูปทั้งหมดที่พบ : ${files.length.toLocaleString()} ไฟล์  (${(totalBytes / 1073741824).toFixed(1)} GB)`,
    `เข้าระบบแล้ว        : ${done.toLocaleString()} ไฟล์`,
    `ซ้ำกับที่มีอยู่แล้ว (ข้าม): ${dup.toLocaleString()} ไฟล์`,
    `ผิดพลาด (จะลองใหม่)  : ${err.toLocaleString()} ไฟล์`,
    `รอประมวลผล          : ${pending.length.toLocaleString()} ไฟล์  (${(pendBytes / 1073741824).toFixed(1)} GB)`,
    ``,
    `ประเมินค่าใช้จ่ายสำหรับไฟล์ที่รอ (ค่าสูงสุด — ไฟล์ที่ซ้ำกับ Drive จะถูกข้ามและไม่เสียเงิน):`,
    `  ค่า index ใบหน้า AWS ครั้งเดียว ≈ ฿${Math.round(pending.length * THB_PER_IMAGE).toLocaleString()}`,
    `  พื้นที่ Supabase เพิ่ม ≈ ${(pending.length * MB_PER_IMAGE / 1024).toFixed(1)} GB  (≈ ฿${Math.round(pending.length * MB_PER_IMAGE / 1024 * 0.8).toLocaleString()}/เดือน)`,
    ``,
    `แยกตามโฟลเดอร์บนสุด (ที่รอ):`,
    ...Array.from(byTop.entries()).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `  ${String(v.n).padStart(7)} ไฟล์  ${(v.bytes / 1073741824).toFixed(1).padStart(6)} GB  ${k}`),
    ``,
    APPROVED
      ? `สถานะ: อนุมัติแล้ว — กำลังประมวลผล`
      : `สถานะ: รอการอนุมัติ — ถ้าตกลง ให้เพิ่มบรรทัด INGEST_APPROVED=yes ในไฟล์ .env แล้ว Stop/Start โปรเจกต์ใน Container Manager`,
  ]
  fs.writeFileSync(REPORT_FILE, lines.join('\n') + '\n')
  for (const l of lines) console.log(l)
}

// ─── main loop ────────────────────────────────────────────────────────────────
let stopping = false
process.on('SIGTERM', () => { stopping = true; log('ได้รับสัญญาณหยุด — จะหยุดหลังจบไฟล์ปัจจุบัน') })
process.on('SIGINT', () => { stopping = true })
process.on('unhandledRejection', (e) => log('unhandled: ' + ((e as Error)?.message ?? e)))
process.on('uncaughtException', (e) => { log('FATAL: ' + (e?.stack ?? e?.message ?? e)); setTimeout(() => process.exit(1), 60_000) })
if (parseInt(process.versions.node.split('.')[0], 10) < 22) {
  log(`FATAL: ต้องใช้ Node 22 ขึ้นไป (ตอนนี้ ${process.version}) — แก้ image ใน docker-compose.yml เป็น node:22-bookworm-slim`)
  await sleep(60_000)
  process.exit(1)
}

log(`=== FaceDeta NAS ingest เริ่มทำงาน (node ${process.version}, root=${PHOTOS_ROOT}, folders=${NAS_FOLDERS.join(',') || 'ทั้งหมด'}, approved=${APPROVED}, concurrency=${CONCURRENCY}) ===`)

try {
while (!stopping) {
  const state = loadState()
  const files = scanAll()
  const now = Date.now()
  const pending = files.filter((f) => {
    if (now - f.mtime < MIN_AGE_MS) return false
    const e = state[f.rel]
    if (!e) return true
    if (e.size !== f.size || Math.abs(e.mtime - f.mtime) > 1000) return true   // ไฟล์เปลี่ยน
    if (e.status === 'error') return (e.attempts ?? 0) < MAX_ATTEMPTS
    return false
  })
  writeReport(files, pending, state)

  if (!APPROVED) {
    log(`ยังไม่อนุมัติ → สแกนอย่างเดียว (รายงานที่ ${REPORT_FILE}) จะสแกนใหม่อีก ${POLL_MINUTES} นาที`)
    if (RUN_ONCE) break
    await sleep(POLL_MINUTES * 60 * 1000)
    continue
  }

  if (pending.length > 0) {
    log('กำลังโหลดรายการรูปที่มีอยู่แล้ว (กันซ้ำ)...')
    const [driveSet, pubSet, privateIds] = await Promise.all([
      loadCached('drive-md5.json', driveMd5s).catch((e) => { log('drive md5: ' + e.message); return new Set<string>() }),
      loadCached('public-md5.json', publicOriginalMd5s).catch((e) => { log('public md5: ' + e.message); return new Set<string>() }),
      getAllFileIds('private'),
    ])
    const known = new Set<string>([...Array.from(driveSet), ...Array.from(pubSet)])
    log(`md5 ที่รู้จัก: Drive ${driveSet.size.toLocaleString()} | ต้นฉบับสาธารณะ ${pubSet.size.toLocaleString()} | รูปในโซนส่วนตัว ${privateIds.size.toLocaleString()}`)
    const ctx: Ctx = { known, privateIds }

    let idx = 0, done = 0, dup = 0, err = 0, faces = 0
    const t0 = Date.now()
    const total = pending.length
    const worker = async () => {
      while (idx < pending.length && !stopping) {
        const f = pending[idx++]
        let outcome: Outcome
        try { outcome = await processOne(f, ctx) }
        catch (e) { outcome = { status: 'error', error: ((e as Error)?.message ?? String(e)).slice(0, 200) } }
        const prev = state[f.rel]
        if (outcome.status === 'done') { done++; if (outcome.faces > 0) faces += outcome.faces; state[f.rel] = { size: f.size, mtime: f.mtime, status: 'done', id: outcome.id, faces: outcome.faces } }
        else if (outcome.status === 'dup') { dup++; state[f.rel] = { size: f.size, mtime: f.mtime, status: 'dup', id: outcome.id } }
        else { err++; state[f.rel] = { size: f.size, mtime: f.mtime, status: 'error', attempts: (prev?.attempts ?? 0) + 1, error: outcome.error }; log(`ERR ${f.rel}: ${outcome.error}`) }
        const n = done + dup + err
        if (n % 50 === 0 || n === total) {
          const el = (Date.now() - t0) / 1000
          const rate = n / el
          log(`${n}/${total} | เข้าระบบ ${done} (${faces} ใบหน้า) | ซ้ำ ${dup} | error ${err} | ${(rate * 60).toFixed(0)} ไฟล์/นาที | เหลือ ~${rate > 0 ? Math.round((total - n) / rate / 60) : '?'} นาที`)
        }
        if (n % 100 === 0) saveState(state)
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    saveState(state)
    writeReport(files, [], state)
    log(`=== รอบนี้เสร็จ: เข้าระบบ ${done} (${faces} ใบหน้า) | ซ้ำ ${dup} | error ${err} | ${((Date.now() - t0) / 60000).toFixed(0)} นาที ===`)
  } else {
    log('ไม่มีไฟล์ใหม่')
  }

  if (stopping || RUN_ONCE) break
  log(`พักรอไฟล์ใหม่ ${POLL_MINUTES} นาที`)
  for (let i = 0; i < POLL_MINUTES * 60 && !stopping; i += 5) await sleep(5000)
}
} catch (e) {
  // ล้มทั้งรอบ (เช่น เชื่อมต่อ Supabase/AWS ไม่ได้) → บอกสาเหตุชัดๆ แล้วรอ 1 นาทีก่อนให้ Docker รีสตาร์ท
  log('FATAL: ' + ((e as Error)?.stack ?? (e as Error)?.message ?? e))
  await sleep(60_000)
  process.exit(1)
}
log('หยุดทำงานแล้ว')
process.exit(0)
