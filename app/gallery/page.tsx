'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { apiUrl } from '@/lib/api-url'
import PhotoCalendar from '@/components/PhotoCalendar'

interface Photo {
  id: string
  name: string
  createdTime?: string
  thumbnailUrl: string
  fullUrl: string
  viewUrl: string
}

interface CalendarData {
  days: Record<string, number>
  events: Record<string, string[]>
  total: number
}

/** format "YYYY-MM-DD" → "4 มิถุนายน 2569" */
function formatThaiDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
  return `${d} ${months[m - 1]} ${y + 543}`
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)

  // Calendar / date filter
  const [calendar, setCalendar] = useState<CalendarData>({ days: {}, events: {}, total: 0 })
  const [calendarLoading, setCalendarLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showCalendar, setShowCalendar] = useState(true)

  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const nextTokenRef = useRef<string | null>(null)

  // ─── โหลดข้อมูลปฏิทิน (ครั้งเดียว) ───────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/photo-calendar'))
        if (res.ok) setCalendar(await res.json())
      } catch { /* ignore */ }
      finally { setCalendarLoading(false) }
    })()
  }, [])

  // ─── โหลดรูป (รองรับ date filter) ────────────────────────────────
  const fetchPhotos = useCallback(async (pageToken?: string, date?: string | null) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (pageToken) params.set('pageToken', pageToken)
      if (date) params.set('date', date)
      const res = await fetch(apiUrl(`/api/photos?${params}`))
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'โหลดรูปไม่สำเร็จ')
      }
      const data = await res.json()
      setPhotos((prev) => pageToken ? [...prev, ...data.photos] : data.photos)
      nextTokenRef.current = data.nextPageToken ?? null
      setNextPageToken(data.nextPageToken ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      loadingRef.current = false
      setLoading(false)
      setInitialLoading(false)
    }
  }, [])

  // โหลดรูปใหม่เมื่อ selectedDate เปลี่ยน
  useEffect(() => {
    setPhotos([])
    setNextPageToken(null)
    nextTokenRef.current = null
    setInitialLoading(true)
    fetchPhotos(undefined, selectedDate)
  }, [selectedDate, fetchPhotos])

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextTokenRef.current && !loadingRef.current) {
          fetchPhotos(nextTokenRef.current, selectedDate)
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchPhotos, selectedDate])

  // Preload รูปข้างเคียงใน lightbox
  useEffect(() => {
    if (lightboxIdx === null) return
    const preload = (idx: number) => {
      if (idx >= 0 && idx < photos.length) {
        const img = new window.Image()
        img.src = photos[idx].fullUrl
      }
    }
    preload(lightboxIdx + 1)
    preload(lightboxIdx - 1)
  }, [lightboxIdx, photos])

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightboxIdx === null) return
      if (e.key === 'Escape') setLightboxIdx(null)
      if (e.key === 'ArrowRight' && lightboxIdx < photos.length - 1) { setImgLoaded(false); setLightboxIdx(lightboxIdx + 1) }
      if (e.key === 'ArrowLeft' && lightboxIdx > 0) { setImgLoaded(false); setLightboxIdx(lightboxIdx - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIdx, photos.length])

  const openLightbox = (idx: number) => { setImgLoaded(false); setLightboxIdx(idx) }
  const lightbox = lightboxIdx !== null ? photos[lightboxIdx] : null

  const selectedEvents = selectedDate ? (calendar.events[selectedDate] ?? []) : []
  const selectedCount = selectedDate ? (calendar.days[selectedDate] ?? 0) : calendar.total

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
        <p className="text-gray-500 text-sm">เลือกวันที่จากปฏิทินเพื่อดูรูปและกิจกรรมของวันนั้น</p>
      </div>

      {/* Toggle calendar */}
      <button
        onClick={() => setShowCalendar((v) => !v)}
        className="w-full flex items-center justify-center gap-1.5 text-sm text-green-700 hover:text-green-800
          py-2 transition-colors font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {showCalendar ? 'ซ่อนปฏิทิน' : 'แสดงปฏิทิน'}
        <svg className={`w-4 h-4 transition-transform ${showCalendar ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Calendar */}
      {showCalendar && (
        <PhotoCalendar
          days={calendar.days}
          events={calendar.events}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          loading={calendarLoading}
        />
      )}

      {/* Selected date banner */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          {selectedDate ? (
            <>
              <p className="font-bold text-gray-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatThaiDate(selectedDate)}
              </p>
              {selectedEvents.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {selectedEvents.map((ev) => (
                    <span key={ev} className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
                      </svg>
                      {ev}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1">ไม่มีชื่อกิจกรรมระบุไว้สำหรับวันนี้</p>
              )}
            </>
          ) : (
            <p className="font-bold text-gray-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              รูปทั้งหมด
            </p>
          )}
        </div>
        <span className="text-sm font-semibold text-green-700 bg-white px-3 py-1 rounded-full shadow-sm">
          {selectedCount.toLocaleString()} รูป
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm text-center">
          {error}
          <button onClick={() => fetchPhotos(undefined, selectedDate)} className="ml-2 underline">ลองใหม่</button>
        </div>
      )}

      {/* Skeleton */}
      {initialLoading && (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="break-inside-avoid rounded-xl bg-gray-200 animate-pulse"
              style={{ height: `${150 + (i % 4) * 50}px` }} />
          ))}
        </div>
      )}

      {/* Photo grid */}
      {!initialLoading && photos.length > 0 && (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
          {photos.map((photo, idx) => (
            <div
              key={photo.id}
              className="break-inside-avoid group relative rounded-xl overflow-hidden cursor-pointer
                shadow-sm hover:shadow-lg transition-shadow duration-200 bg-gray-100"
              onClick={() => openLightbox(idx)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.thumbnailUrl} alt={photo.name}
                className="w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                loading="lazy" />
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
      {!initialLoading && photos.length === 0 && !error && (
        <div className="text-center py-16 text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3.75 3h16.5A.75.75 0 0121 3.75v13.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 17.25V3.75A.75.75 0 013.75 3z" />
          </svg>
          <p className="font-medium">{selectedDate ? 'ไม่มีรูปในวันนี้' : 'ยังไม่มีรูปภาพ'}</p>
          <p className="text-sm mt-1">{selectedDate ? 'ลองเลือกวันอื่นจากปฏิทิน' : 'กรุณา Sync รูปผ่านหน้าจัดการระบบก่อน'}</p>
        </div>
      )}

      {/* Sentinel + spinner */}
      <div ref={sentinelRef} className="h-1" />
      {loading && !initialLoading && (
        <div className="flex justify-center py-6">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            กำลังโหลดรูปเพิ่ม...
          </div>
        </div>
      )}
      {!loading && !nextPageToken && photos.length > 0 && (
        <p className="text-center text-xs text-gray-400 pb-4">แสดงครบทั้งหมด {photos.length} รูป</p>
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
              <img src={lightbox.thumbnailUrl} alt="" aria-hidden
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg blur-sm scale-105" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={lightbox.id} src={lightbox.fullUrl} alt={lightbox.name}
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
                  <p className="text-white/60 text-xs mt-0.5">{lightboxIdx + 1} / {photos.length}{nextPageToken ? '+' : ''}</p>
                )}
              </div>
              <a href={lightbox.viewUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/35 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0 ml-3"
                onClick={(e) => e.stopPropagation()}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                เปิดใน Drive
              </a>
            </div>
          </div>

          <button disabled={lightboxIdx === photos.length - 1}
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
