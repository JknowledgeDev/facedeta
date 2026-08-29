'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import DropZone from '@/components/DropZone'
import ResultCard from '@/components/ResultCard'
import StatsBar from '@/components/StatsBar'
import ThresholdSlider from '@/components/ThresholdSlider'
import { type SearchResult } from '@/lib/supabase'
import { apiUrl } from '@/lib/api-url'
import { compressIfNeeded } from '@/lib/client-compress'

type Status = 'idle' | 'searching' | 'done'

export default function SearchPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  // รูปเพิ่มเติม (ไม่บังคับ) — หลายรูปช่วยเพิ่มความแม่นยำมาก (แนวทาง AWS)
  const [extraFiles, setExtraFiles] = useState<(File | null)[]>([null, null])
  const [threshold, setThreshold] = useState(95)
  const [status, setStatus] = useState<Status>('idle')
  const [results, setResults] = useState<SearchResult[]>([])
  const [probeWarnings, setProbeWarnings] = useState<string[]>([])
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())
  const [showMaybe, setShowMaybe] = useState(false)

  const handleSearch = async () => {
    if (!selectedFile) {
      toast.error('กรุณาเลือกรูปภาพก่อน')
      return
    }

    setStatus('searching')
    setResults([])
    setProbeWarnings([])
    setHiddenIds(new Set())
    setShowMaybe(false)

    try {
      // บีบรูปต้นแบบให้เล็ก (1600px พอสำหรับจับใบหน้า) — ส่งได้สูงสุด 3 รูปใน request เดียว
      const probeOpts = { maxDim: 1600, maxBytes: 1_300_000 }
      const allFiles = [selectedFile, ...extraFiles.filter((f): f is File => f !== null)]
      const form = new FormData()
      for (let i = 0; i < allFiles.length; i++) {
        const compressed = await compressIfNeeded(allFiles[i], probeOpts)
        form.append(`image${i}`, compressed, allFiles[i].name)
      }
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
      setProbeWarnings((data.probeWarnings as string[]) ?? [])
      setStatus('done')

      const total = (data.total as number) ?? 0
      const totalMaybe = (data.totalMaybe as number) ?? 0
      if (total === 0 && totalMaybe === 0) {
        toast('ไม่พบรูปภาพที่ตรงกัน ลองเพิ่มรูปต้นแบบหรือเปลี่ยนระดับการค้นหา', { icon: '🔍' })
      } else if (total === 0 && totalMaybe > 0) {
        toast(`พบ ${totalMaybe} รูปที่อาจจะใช่ — โปรดตรวจสอบ`, { icon: '🟡' })
        setShowMaybe(true)
      } else {
        toast.success(`พบ ${total} รูปภาพ`)
      }
    } catch (err: unknown) {
      setStatus('idle')
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
  }

  const sureResults = results.filter((r) => r.band !== 'maybe' && !hiddenIds.has(r.id))
  const maybeResults = results.filter((r) => r.band === 'maybe' && !hiddenIds.has(r.id))

  /** ผู้ปกครองกด "ไม่ใช่คนนี้" → ซ่อนการ์ด + ส่ง feedback เก็บไว้ปรับปรุงระบบ */
  const handleNotMatch = (r: SearchResult) => {
    setHiddenIds((prev) => { const n = new Set(prev); n.add(r.id); return n })
    fetch(apiUrl('/api/feedback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driveFileId: r.drive_file_id,
        confidence: r.confidence,
        threshold,
        verified: r.verified ?? false,
        eventName: r.event_name,
      }),
    }).catch(() => { /* best-effort */ })
    toast('ขอบคุณสำหรับข้อมูล ระบบจะนำไปปรับปรุงความแม่นยำ', { icon: '🙏' })
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
            { step: '1', icon: '📸', title: 'อัพรูปน้อง 1-3 รูป', desc: 'ยิ่งหลายรูป (หน้าตรง + มุมอื่น) ยิ่งแม่นยำ' },
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

        {/* รูปเพิ่มเติม (ไม่บังคับ) — multi-probe เพิ่มความแม่นยำ */}
        <div className="rounded-xl border border-dashed border-green-200 bg-green-50/40 p-3">
          <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1.5">
            <span className="text-base">✨</span>
            เพิ่มรูปน้องอีก 1-2 รูป <span className="text-gray-400 font-normal">(ไม่บังคับ — ช่วยให้แม่นยำขึ้นมาก)</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {extraFiles.map((f, i) => (
              <div key={i}>
                {f ? (
                  <div className="relative rounded-lg overflow-hidden border border-green-200 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-20 object-cover" />
                    <button
                      type="button"
                      onClick={() => setExtraFiles((prev) => prev.map((x, j) => (j === i ? null : x)))}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/50 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-xs transition-colors"
                    >✕</button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-20 rounded-lg border border-dashed border-gray-300 bg-white hover:border-green-400 hover:bg-green-50/50 cursor-pointer transition-colors">
                    <span className="text-xl text-gray-300">＋</span>
                    <span className="text-[11px] text-gray-400">รูปที่ {i + 2}</span>
                    <input
                      type="file" accept="image/*,.heic,.heif" className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setExtraFiles((prev) => prev.map((x, j) => (j === i ? file : x)))
                        e.target.value = ''
                      }}
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

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
          {/* คำแนะนำคุณภาพรูปต้นแบบ (ไม่บล็อกการค้นหา) */}
          {probeWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              {probeWarnings.map((w) => (
                <p key={w} className="text-xs text-amber-700 flex items-start gap-1.5">
                  <span className="shrink-0">💡</span>{w}
                </p>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-800 text-base sm:text-lg">ผลการค้นหา</h2>
              {sureResults.length > 0 && (
                <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  {sureResults.length} รูป
                </span>
              )}
            </div>
            {sureResults.length > 0 && (
              <span className="text-xs text-gray-400">ยืนยันใบหน้าซ้ำแล้ว • เรียงตามความแม่นยำ</span>
            )}
          </div>

          {sureResults.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
              {sureResults.map((r) => (
                <ResultCard key={r.id} result={r} onNotMatch={() => handleNotMatch(r)} />
              ))}
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
                ลองเพิ่มรูปต้นแบบอีก 1-2 รูป หรือเปลี่ยนเป็น &ldquo;ค้นหากว้าง&rdquo;
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

          {/* ── "อาจจะใช่" — ความมั่นใจต่ำกว่าเกณฑ์เล็กน้อย พับเก็บให้ตรวจเอง ── */}
          {maybeResults.length > 0 && (
            <div className="border border-amber-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowMaybe((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
              >
                <span className="text-sm font-semibold text-amber-700 flex items-center gap-2">
                  🟡 อาจจะใช่ — โปรดตรวจสอบด้วยตา ({maybeResults.length} รูป)
                </span>
                <svg className={`w-4 h-4 text-amber-500 transition-transform ${showMaybe ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showMaybe && (
                <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 bg-white">
                  {maybeResults.map((r) => (
                    <ResultCard key={r.id} result={r} onNotMatch={() => handleNotMatch(r)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
