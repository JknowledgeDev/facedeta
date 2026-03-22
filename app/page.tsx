'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import DropZone from '@/components/DropZone'
import ResultCard from '@/components/ResultCard'
import StatsBar from '@/components/StatsBar'
import ThresholdSlider from '@/components/ThresholdSlider'
import { type SearchResult } from '@/lib/supabase'
import { apiUrl } from '@/lib/api-url'

type Status = 'idle' | 'searching' | 'done'

// Vercel limits request body to ~4.5 MB — compress non-HEIC images in the browser first
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // 4 MB safe threshold

async function compressIfNeeded(file: File): Promise<Blob> {
  const isHeic = file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif')

  // HEIC: browser can't render it → send as-is (usually already <4 MB)
  if (isHeic) return file

  // Already small enough → send as-is
  if (file.size <= MAX_UPLOAD_BYTES) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')

      // Cap longest side at 1920 px to reduce size while keeping face detail
      const MAX_DIM = 1920
      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM }
      }

      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

      // Try quality 0.90 → 0.80 → ... until under limit
      let quality = 0.9
      const tryNext = () => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return }
          if (blob.size <= MAX_UPLOAD_BYTES || quality <= 0.5) {
            resolve(blob)
          } else {
            quality = Math.round((quality - 0.1) * 10) / 10
            tryNext()
          }
        }, 'image/jpeg', quality)
      }
      tryNext()
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

export default function SearchPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [threshold, setThreshold] = useState(75)
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<SearchResult[]>([])

  const handleSearch = async () => {
    if (!selectedFile) {
      toast.error('กรุณาเลือกรูปภาพก่อน')
      return
    }

    setStatus('searching')
    setResults([])

    try {
      const compressed = await compressIfNeeded(selectedFile)

      const form = new FormData()
      form.append('image', compressed, selectedFile.name)
      form.append('threshold', String(threshold))

      const res = await fetch(apiUrl('/api/search'), { method: 'POST', body: form })

      // Guard against non-JSON responses (e.g. Vercel 413 plain-text body)
      const text = await res.text()
      let data: Record<string, unknown>
      try {
        data = JSON.parse(text)
      } catch {
        if (res.status === 413 || text.includes('Entity Too Large') || text.includes('Request En')) {
          throw new Error('ไฟล์ใหญ่เกินไป กรุณาใช้รูปที่มีขนาดเล็กกว่านี้')
        }
        throw new Error(`เกิดข้อผิดพลาด (${res.status})`)
      }

      if (!res.ok) throw new Error((data.error as string) ?? 'Search failed')

      setResults(data.results as SearchResult[])
      setStatus('done')

      if (data.total === 0) {
        toast('ไม่พบรูปภาพที่ตรงกัน ลองเปลี่ยนระดับการค้นหาดู', { icon: '🔍' })
      } else {
        toast.success(`พบ ${data.total as number} รูปภาพ`)
      }
    } catch (err: unknown) {
      setStatus('idle')
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
  }

  return (
    <div className="space-y-6">

      {/* ── Hero ── */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-green-600 via-green-700 to-emerald-800 px-6 sm:px-10 py-10 sm:py-14 text-center shadow-lg">
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-emerald-500/20 rounded-full translate-x-1/3 translate-y-1/3 pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-white/20 backdrop-blur rounded-2xl mb-4 shadow">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2 leading-tight">
            ค้นหารูปภาพด้วยใบหน้า 🔍
          </h1>
          <p className="text-green-100 text-sm sm:text-lg max-w-xl mx-auto leading-relaxed">
            อัพโหลดรูปใบหน้าน้อง ระบบจะค้นหารูปทั้งหมดที่มีน้องอยู่โดยอัตโนมัติ
          </p>
        </div>
      </div>

      {/* ── Stats ── */}
      <StatsBar />

      {/* ── วิธีใช้ ── */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">วิธีใช้งาน</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {[
            { step: '1', icon: '📸', title: 'เลือกรูปต้นแบบ (รูปน้อง)', desc: 'อัพโหลดรูปถ่ายที่เห็นหน้าน้องชัดเจน' },
            { step: '2', icon: '🎚️', title: 'เลือกระดับการค้นหา', desc: 'เลือกว่าต้องการค้นหากว้างหรือแม่นยำ' },
            { step: '3', icon: '🔍', title: 'กดค้นหา', desc: 'ระบบจะค้นหาและแสดงผลทันที' },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-3 p-3 rounded-xl bg-green-50/50">
              <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-sm">
                {s.step}
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{s.icon} {s.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── คำเตือน ── */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5">
        <span className="text-xl shrink-0">⚠️</span>
        <p className="text-sm text-amber-800 leading-relaxed">
          <span className="font-semibold">เพื่อผลลัพธ์ที่ดี:</span>{' '}
          ใช้รูปที่เห็นหน้าชัด ไม่เบลอ ไม่มีแว่นกันแดดทึบ และเห็นใบหน้าหนึ่งคนต่อหนึ่งรูป
        </p>
      </div>

      {/* ── Search Card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-5 sm:p-6 space-y-5">
        <h2 className="font-bold text-gray-800 text-base sm:text-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          อัพโหลดรูปต้นแบบของน้อง
        </h2>

        <DropZone
          onFileSelect={(file) => setSelectedFile(file)}
          label="ลากรูปใบหน้ามาวางหรือแตะเพื่อเลือก"
          sublabel="รองรับ JPG, PNG, WEBP, HEIC (รูปจาก iPhone) • ไม่เกิน 10MB"
        />

        <ThresholdSlider value={threshold} onChange={setThreshold} />

        <button
          onClick={handleSearch}
          disabled={!selectedFile || status === 'searching'}
          className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600
            hover:from-green-700 hover:to-emerald-700
            disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed
            text-white font-bold rounded-xl shadow-md hover:shadow-lg
            transition-all duration-200 flex items-center justify-center gap-2 text-base"
        >
          {status === 'searching' ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              กำลังค้นหา...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              ค้นหารูปภาพ
            </>
          )}
        </button>
      </div>

      {/* ── Results ── */}
      {status === 'done' && (
        <div className="space-y-4 animate-slideUp">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-800 text-base sm:text-lg">ผลการค้นหา</h2>
              {results.length > 0 && (
                <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {results.length} รูป
                </span>
              )}
            </div>
            {results.length > 0 && (
              <span className="text-xs text-gray-400">เรียงตามความแม่นยำ</span>
            )}
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {results.map((r) => <ResultCard key={r.id} result={r} />)}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-14 px-6 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-700 text-base mb-1">ไม่พบรูปภาพที่ตรงกัน</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                ลองเปลี่ยนเป็น &ldquo;ค้นหาทั่วไป&rdquo; หรืออัพโหลดรูปที่เห็นหน้าชัดขึ้น
              </p>
              <button onClick={() => setStatus('idle')}
                className="mt-4 inline-flex items-center gap-2 text-sm text-green-600 hover:text-green-700 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                ค้นหาใหม่
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
