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
      const form = new FormData()
      form.append('image', selectedFile)
      form.append('threshold', String(threshold))

      const res = await fetch(apiUrl('/api/search'), { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Search failed')

      setResults(data.results)
      setStatus('done')

      if (data.total === 0) {
        toast('ไม่พบรูปภาพที่ตรงกัน ลองลดค่าความแม่นยำดู', { icon: '🔍' })
      } else {
        toast.success(`พบ ${data.total} รูปภาพ`)
      }
    } catch (err: unknown) {
      setStatus('idle')
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Hero Section ── */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 px-8 py-12 text-center shadow-lg">
        {/* Decorative circles */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-500/20 rounded-full translate-x-1/3 translate-y-1/3 pointer-events-none" />

        <div className="relative">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur rounded-2xl mb-5 shadow">
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 leading-tight">
            ค้นหารูปภาพด้วยใบหน้า 🔍
          </h1>
          <p className="text-blue-100 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            อัพโหลดรูปใบหน้า ระบบจะค้นหารูปทั้งหมดที่มีคนนั้นอยู่โดยอัตโนมัติ
          </p>
        </div>
      </div>

      {/* ── Stats ── */}
      <StatsBar />

      {/* ── How to use ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
          วิธีใช้งาน
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              step: '1',
              icon: '📸',
              title: 'เลือกรูปใบหน้า',
              desc: 'อัพโหลดรูปถ่ายที่เห็นหน้าชัดเจน',
            },
            {
              step: '2',
              icon: '🎚️',
              title: 'เลือกระดับการค้นหา',
              desc: 'เลือกว่าต้องการค้นหากว้างหรือแม่นยำ',
            },
            {
              step: '3',
              icon: '🔍',
              title: 'กดค้นหา',
              desc: 'ระบบจะค้นหาและแสดงผลทันที',
            },
          ].map((s) => (
            <div key={s.step} className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                {s.step}
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">
                  {s.icon} {s.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Warning box ── */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
        <span className="text-xl shrink-0 mt-0.5">⚠️</span>
        <p className="text-sm text-amber-800 leading-relaxed">
          <span className="font-semibold">เพื่อผลลัพธ์ที่ดี:</span>{' '}
          ใช้รูปที่เห็นหน้าชัด ไม่เบลอ ไม่มีแว่นกันแดดทึบ
          และเห็นใบหน้าหนึ่งคนต่อหนึ่งรูป
        </p>
      </div>

      {/* ── Search Card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          อัพโหลดรูปที่ต้องการค้นหา
        </h2>

        <DropZone
          onFileSelect={(file) => setSelectedFile(file)}
          label="ลากรูปใบหน้ามาวางหรือคลิกเพื่อเลือก"
          sublabel="รองรับ JPG, PNG, WEBP, HEIC (รูปจาก iPhone) • ไม่เกิน 10MB"
        />

        <ThresholdSlider value={threshold} onChange={setThreshold} />

        <button
          onClick={handleSearch}
          disabled={!selectedFile || status === 'searching'}
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700
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

      {/* ── Results Section ── */}
      {status === 'done' && (
        <div className="space-y-5 animate-slideUp">
          {/* Results header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-gray-800 text-lg">ผลการค้นหา</h2>
              {results.length > 0 && (
                <span className="bg-blue-600 text-white text-sm font-bold px-3 py-1 rounded-full">
                  {results.length} รูป
                </span>
              )}
            </div>
            {results.length > 0 && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                เรียงตามความแม่นยำ
              </span>
            )}
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {results.map((r) => (
                <ResultCard key={r.id} result={r} />
              ))}
            </div>
          ) : (
            /* ── Empty state ── */
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 px-8 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-700 text-lg mb-2">ไม่พบรูปภาพที่ตรงกัน</h3>
              <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                ลองเปลี่ยนระดับการค้นหาเป็น &ldquo;กว้างๆ&rdquo; หรืออัพโหลดรูปใหม่ที่เห็นหน้าชัดขึ้น
                ไม่มีแว่นกันแดด หรือไม่เบลอ
              </p>
              <button
                onClick={() => setStatus('idle')}
                className="mt-5 inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18" />
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
