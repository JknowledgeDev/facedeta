'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { apiUrl } from '@/lib/api-url'
import PhotoCalendar from '@/components/PhotoCalendar'
import SmartImg from '@/components/SmartImg'

interface PhotoMeta {
  id: string
  name: string
  eventName: string | null
  date: string   // วันกิจกรรม "YYYY-MM-DD"
  uploadedAt: string
}

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

/** ISO (UTC) → วันที่ไทย "YYYY-MM-DD" */
function toThaiDate(iso: string): string {
  if (!iso) return ''
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10)
}

function formatThaiDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${d} ${TH_MONTHS[m - 1]} ${y + 543}`
}

// ใช้ proxy ของแอป (OAuth) — ดู/ดาวน์โหลดได้ทุกคนโดยไม่ต้องตั้ง Drive เป็น public
const fullUrl = (id: string) => `/api/image/${id}?w=1600`
const downloadUrl = (id: string, name: string) => `/api/image/${id}?download=1&name=${encodeURIComponent(name)}`

const PAGE = 60 // จำนวนรูปต่อการแสดงผลหนึ่งช่วง
const CACHE_KEY = 'fd_manifest_v2'

/** แปลง manifest (v2 แบบย่อ หรือ v1) → PhotoMeta[] */
function decodeManifest(data: unknown): PhotoMeta[] {
  const d = data as { v?: number; events?: string[]; photos?: unknown[] }
  if (d?.v === 2) {
    const ev = d.events ?? []
    return ((d.photos ?? []) as [string, string, number, string][]).map(([id, name, e, date]) => ({
      id, name, eventName: e >= 0 ? (ev[e] ?? null) : null, date: date ?? '', uploadedAt: '',
    }))
  }
  return ((d?.photos ?? []) as PhotoMeta[])
}

type Filter =
  | { kind: 'all' }
  | { kind: 'date'; date: string }
  | { kind: 'event'; name: string }

export default function GalleryPage() {
  const [manifest, setManifest] = useState<PhotoMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [visible, setVisible] = useState(PAGE)
  const [showCalendar, setShowCalendar] = useState(false)

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  // รูปที่โหลดไม่ได้ (ถูกลบจาก Drive) → ซ่อนออก
  const [broken, setBroken] = useState<Set<string>>(() => new Set())

  const sentinelRef = useRef<HTMLDivElement>(null)

  // ─── โหลด manifest (รูปทั้งหมดจากทุกโฟลเดอร์ที่เคย sync) ──────────
  // stale-while-revalidate: แสดงรายการที่จำไว้ในเครื่องทันที แล้วดึงของใหม่มาแทนเบื้องหลัง
  useEffect(() => {
    let hadCache = false
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw)
        const list = decodeManifest(cached.data)
        if (list.length > 0) { setManifest(list); setLoading(false); hadCache = true }
      }
    } catch { /* ignore */ }

    const load = async () => {
      if (!hadCache) setLoading(true)
      try {
        const res = await fetch(apiUrl('/api/photo-manifest'))
        if (!res.ok) throw new Error('โหลดรูปไม่สำเร็จ')
        const data = await res.json()
        setManifest(decodeManifest(data))
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch { /* quota */ }
      } catch (err: unknown) {
        if (!hadCache) setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // นับรูปต่อวัน (จากวันกิจกรรม)
  const days = useMemo(() => {
    const d: Record<string, number> = {}
    for (const p of manifest) {
      if (p.date) d[p.date] = (d[p.date] ?? 0) + 1
    }
    return d
  }, [manifest])

  // รายการกิจกรรม (derive จาก manifest) เรียงตามวันล่าสุด
  const eventList = useMemo(() => {
    const m = new Map<string, { count: number; latest: string }>()
    for (const p of manifest) {
      if (!p.eventName) continue
      const cur = m.get(p.eventName) ?? { count: 0, latest: '' }
      cur.count++
      if (p.date > cur.latest) cur.latest = p.date
      m.set(p.eventName, cur)
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, count: v.count, latest: v.latest }))
      .sort((a, b) => b.latest.localeCompare(a.latest) || b.count - a.count)
  }, [manifest])

  // map วันที่ → ชื่อกิจกรรม (สำหรับ dot ในปฏิทิน)
  const eventsByDate = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const p of manifest) {
      if (!p.date || !p.eventName) continue
      if (!m[p.date]) m[p.date] = []
      if (!m[p.date].includes(p.eventName)) m[p.date].push(p.eventName)
    }
    return m
  }, [manifest])

  // กรองรูปตาม filter + ตัดรูปที่โหลดไม่ได้ (ถูกลบจาก Drive) ออก
  const filtered = useMemo(() => {
    let list = manifest
    if (filter.kind === 'date') list = manifest.filter((p) => p.date === filter.date)
    else if (filter.kind === 'event') list = manifest.filter((p) => p.eventName === filter.name)
    return broken.size ? list.filter((p) => !broken.has(p.id)) : list
  }, [manifest, filter, broken])

  // reset จำนวนที่แสดงเมื่อเปลี่ยน filter
  useEffect(() => { setVisible(PAGE) }, [filter])

  const shown = filtered.slice(0, visible)
  const hasMore = visible < filtered.length

  // Infinite scroll (เพิ่มจำนวนที่แสดงในหน่วยความจำ)
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisible((v) => v + PAGE)
      },
      { rootMargin: '400px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore])

  // Preload รูปข้างเคียงใน lightbox
  useEffect(() => {
    if (lightboxIdx === null) return
    const preload = (idx: number) => {
      if (idx >= 0 && idx < filtered.length) {
        const img = new window.Image()
        img.src = fullUrl(filtered[idx].id)
      }
    }
    preload(lightboxIdx + 1)
    preload(lightboxIdx - 1)
  }, [lightboxIdx, filtered])

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightboxIdx === null) return
      if (e.key === 'Escape') setLightboxIdx(null)
      if (e.key === 'ArrowRight' && lightboxIdx < filtered.length - 1) { setImgLoaded(false); setLightboxIdx(lightboxIdx + 1) }
      if (e.key === 'ArrowLeft' && lightboxIdx > 0) { setImgLoaded(false); setLightboxIdx(lightboxIdx - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIdx, filtered.length])

  const openLightbox = (idx: number) => { setImgLoaded(false); setLightboxIdx(idx) }
  const lightbox = lightboxIdx !== null ? filtered[lightboxIdx] : null

  const todayThai = toThaiDate(new Date().toISOString())

  // ป้ายสรุป filter ปัจจุบัน
  const onSelectEvent = (name: string) => {
    setFilter(name ? { kind: 'event', name } : { kind: 'all' })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="text-center space-y-2 pt-2">
        <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-sm font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          แกลเลอรี่รูปภาพ
        </div>
        <h1 className="text-2xl font-bold text-gray-800">ภาพกิจกรรมทั้งหมด</h1>
        <p className="text-gray-500 text-sm">เรียงจากรูปล่าสุด • เลือกกิจกรรมหรือวันที่เพื่อกรอง</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-4 space-y-3">
        {/* Event dropdown */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1.5 flex items-center gap-1">
            <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
            </svg>
            เลือกกิจกรรม
          </label>
          <select
            value={filter.kind === 'event' ? filter.name : ''}
            onChange={(e) => onSelectEvent(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-green-500 appearance-none cursor-pointer"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.75rem center', backgroundSize: '1.1rem' }}
          >
            <option value="">— ทุกกิจกรรม —</option>
            {eventList.map((ev) => (
              <option key={ev.name} value={ev.name}>
                {ev.name} ({ev.count} รูป){ev.latest ? ` • ${formatThaiDate(ev.latest)}` : ''}
              </option>
            ))}
          </select>
          {eventList.length === 0 && !loading && (
            <p className="text-xs text-gray-400 mt-1">ยังไม่มีกิจกรรม — กรอกชื่อกิจกรรม+วันที่ตอน Sync ในหน้าจัดการระบบ</p>
          )}
        </div>

        {/* Quick filters */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter({ kind: 'all' })}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
              ${filter.kind === 'all' ? 'bg-green-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
            ทั้งหมด ({manifest.length.toLocaleString()})
          </button>
          <button onClick={() => setFilter({ kind: 'date', date: todayThai })}
            disabled={!days[todayThai]}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed
              ${filter.kind === 'date' && filter.date === todayThai ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}>
            วันนี้{days[todayThai] ? ` (${days[todayThai]})` : ''}
          </button>
          <button onClick={() => setShowCalendar((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1 ml-auto">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {showCalendar ? 'ซ่อนปฏิทิน' : 'ปฏิทิน'}
          </button>
        </div>
      </div>

      {/* Calendar */}
      {showCalendar && (
        <PhotoCalendar
          days={days}
          events={eventsByDate}
          selectedDate={filter.kind === 'date' ? filter.date : null}
          onSelect={(d) => setFilter(d ? { kind: 'date', date: d } : { kind: 'all' })}
          loading={loading}
        />
      )}

      {/* Filter banner */}
      {filter.kind !== 'all' && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-2">
          <div>
            {filter.kind === 'event' ? (
              <p className="font-bold text-gray-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
                </svg>
                {filter.name}
              </p>
            ) : (
              <p className="font-bold text-gray-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatThaiDate(filter.date)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-green-700 bg-white px-3 py-1 rounded-full shadow-sm">
              {filtered.length.toLocaleString()} รูป
            </span>
            <button onClick={() => setFilter({ kind: 'all' })}
              className="text-xs text-gray-400 hover:text-red-500 underline">ล้าง</button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm text-center">
          {error}
          <button onClick={() => location.reload()} className="ml-2 underline">ลองใหม่</button>
        </div>
      )}

      {/* Skeleton */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-gray-200 animate-pulse aspect-square" />
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && shown.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          {shown.map((photo, idx) => (
            <div key={photo.id}
              className="group relative rounded-xl overflow-hidden cursor-pointer aspect-square
                shadow-sm hover:shadow-lg transition-shadow duration-200 bg-gray-100"
              onClick={() => openLightbox(idx)}>
              <SmartImg fileId={photo.id} width={500} alt={photo.name}
                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                loading="lazy"
                onAllFailed={() => setBroken((prev) => {
                  if (prev.has(photo.id)) return prev
                  const n = new Set(prev); n.add(photo.id); return n
                })} />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 flex items-center justify-center">
                <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow">
                  <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && !error && (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3.75 3h16.5A.75.75 0 0121 3.75v13.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 17.25V3.75A.75.75 0 013.75 3z" />
          </svg>
          <p className="font-medium">{filter.kind === 'all' ? 'ยังไม่มีรูปภาพ' : 'ไม่มีรูปในตัวกรองนี้'}</p>
          <p className="text-sm mt-1">{filter.kind === 'all' ? 'กรุณา Sync รูปผ่านหน้าจัดการระบบก่อน' : 'ลองเลือกกิจกรรมหรือวันอื่น'}</p>
        </div>
      )}

      {/* Sentinel + spinner */}
      <div ref={sentinelRef} className="h-1" />
      {!loading && hasMore && (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {!loading && !hasMore && filtered.length > 0 && (
        <p className="text-center text-xs text-gray-400 pb-4">แสดงครบทั้งหมด {filtered.length.toLocaleString()} รูป</p>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setLightboxIdx(null) }}>
          <button disabled={lightboxIdx === 0}
            className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/15 hover:bg-white/30 disabled:opacity-0 disabled:pointer-events-none rounded-full flex items-center justify-center text-white transition-colors z-10"
            onClick={() => { setImgLoaded(false); setLightboxIdx((i) => (i ?? 1) - 1) }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          <div className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center">
            {!imgLoaded && (
              <SmartImg fileId={lightbox.id} width={500} alt="" aria-hidden
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg blur-sm scale-105" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={lightbox.id} src={fullUrl(lightbox.id)} alt={lightbox.name}
              onLoad={() => setImgLoaded(true)}
              className={`max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0 m-auto'}`} />
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <div className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent rounded-b-lg px-4 py-3 flex items-center justify-between transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}>
              <div>
                <p className="text-white text-sm font-medium truncate max-w-xs">{lightbox.name}</p>
                {lightboxIdx !== null && (
                  <p className="text-white/60 text-xs mt-0.5">
                    {lightboxIdx + 1} / {filtered.length.toLocaleString()}
                    {lightbox.date ? ` • ${formatThaiDate(lightbox.date)}` : ''}
                  </p>
                )}
              </div>
              <a href={downloadUrl(lightbox.id, lightbox.name)} download={lightbox.name}
                className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/35 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0 ml-3"
                onClick={(e) => e.stopPropagation()}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                ดาวน์โหลด
              </a>
            </div>
          </div>

          <button disabled={lightboxIdx === filtered.length - 1}
            className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 w-11 h-11 bg-white/15 hover:bg-white/30 disabled:opacity-0 disabled:pointer-events-none rounded-full flex items-center justify-center text-white transition-colors z-10"
            onClick={() => { setImgLoaded(false); setLightboxIdx((i) => (i ?? 0) + 1) }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          <button className="absolute top-4 right-4 w-9 h-9 bg-white/15 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-colors"
            onClick={() => setLightboxIdx(null)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
