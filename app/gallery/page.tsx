'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiUrl } from '@/lib/api-url'

interface Photo {
  id: string
  name: string
  createdTime?: string
  thumbnailUrl: string
  fullUrl: string
  viewUrl: string
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<Photo | null>(null)

  const fetchPhotos = useCallback(async (pageToken?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (pageToken) params.set('pageToken', pageToken)
      const res = await fetch(apiUrl(`/api/photos?${params}`))
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'โหลดรูปไม่สำเร็จ')
      }
      const data = await res.json()
      setPhotos((prev) => pageToken ? [...prev, ...data.photos] : data.photos)
      setNextPageToken(data.nextPageToken)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPhotos()
  }, [fetchPhotos])

  // ปิด lightbox เมื่อกด ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
      if (e.key === 'ArrowRight' && lightbox) {
        const idx = photos.findIndex((p) => p.id === lightbox.id)
        if (idx < photos.length - 1) setLightbox(photos[idx + 1])
      }
      if (e.key === 'ArrowLeft' && lightbox) {
        const idx = photos.findIndex((p) => p.id === lightbox.id)
        if (idx > 0) setLightbox(photos[idx - 1])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, photos])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2 pt-2">
        <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-sm font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          ภาพกิจกรรมทั้งหมด
        </div>
        <h1 className="text-2xl font-bold text-gray-800">แกลเลอรี่รูปภาพ</h1>
        <p className="text-gray-500 text-sm">
          ดูบรรยากาศและรูปภาพทั้งหมดจากกิจกรรม
          {photos.length > 0 && (
            <span className="ml-1 text-green-600 font-medium">({photos.length} รูป{nextPageToken ? '+' : ''})</span>
          )}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm text-center">
          {error}
          <button onClick={() => fetchPhotos()} className="ml-2 underline">ลองใหม่</button>
        </div>
      )}

      {/* Skeleton loading */}
      {initialLoading && (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="break-inside-avoid rounded-xl bg-gray-200 animate-pulse"
              style={{ height: `${160 + (i % 3) * 60}px` }}
            />
          ))}
        </div>
      )}

      {/* Photo grid (masonry) */}
      {!initialLoading && photos.length > 0 && (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="break-inside-avoid group relative rounded-xl overflow-hidden cursor-pointer
                shadow-sm hover:shadow-md transition-all duration-200 bg-gray-100"
              onClick={() => setLightbox(photo)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.thumbnailUrl}
                alt={photo.name}
                className="w-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!initialLoading && photos.length === 0 && !error && (
        <div className="text-center py-20 text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3.75 3h16.5A.75.75 0 0121 3.75v13.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 17.25V3.75A.75.75 0 013.75 3z" />
          </svg>
          <p className="font-medium">ยังไม่มีรูปภาพ</p>
          <p className="text-sm mt-1">กรุณา Sync รูปผ่านหน้าจัดการระบบก่อน</p>
        </div>
      )}

      {/* Load more */}
      {nextPageToken && !loading && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => fetchPhotos(nextPageToken)}
            className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium
              text-sm transition-colors shadow-sm"
          >
            โหลดรูปเพิ่มเติม
          </button>
        </div>
      )}

      {/* Loading spinner (load more) */}
      {loading && !initialLoading && (
        <div className="flex justify-center pt-4">
          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setLightbox(null) }}
        >
          {/* Prev */}
          {photos.findIndex((p) => p.id === lightbox.id) > 0 && (
            <button
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30
                rounded-full flex items-center justify-center text-white transition-colors"
              onClick={() => {
                const idx = photos.findIndex((p) => p.id === lightbox.id)
                setLightbox(photos[idx - 1])
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}

          {/* Image */}
          <div className="max-w-4xl max-h-[85vh] relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.fullUrl}
              alt={lightbox.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            {/* Bottom bar */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent
              rounded-b-lg px-4 py-3 flex items-center justify-between">
              <p className="text-white text-sm truncate">{lightbox.name}</p>
              <a
                href={lightbox.viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/30 text-white
                  px-3 py-1.5 rounded-lg transition-colors shrink-0 ml-2"
                onClick={(e) => e.stopPropagation()}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                เปิดใน Drive
              </a>
            </div>
          </div>

          {/* Next */}
          {photos.findIndex((p) => p.id === lightbox.id) < photos.length - 1 && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 hover:bg-white/30
                rounded-full flex items-center justify-center text-white transition-colors"
              onClick={() => {
                const idx = photos.findIndex((p) => p.id === lightbox.id)
                setLightbox(photos[idx + 1])
              }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}

          {/* Close */}
          <button
            className="absolute top-4 right-4 w-9 h-9 bg-white/20 hover:bg-white/30 rounded-full
              flex items-center justify-center text-white transition-colors"
            onClick={() => setLightbox(null)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
