'use client'

import { useState } from 'react'
import { type SearchResult } from '@/lib/supabase'
import SmartImg from '@/components/SmartImg'
import { displayCdnUrl } from '@/lib/thumb-url'

interface ResultCardProps {
  result: SearchResult
  /** ผู้ปกครองยืนยันว่าไม่ใช่คนที่ค้นหา → ซ่อน + เก็บ feedback */
  onNotMatch?: () => void
}

/** แปลง faceArea (0–1) เป็นข้อความอธิบาย */
function faceAreaLabel(area: number): string {
  const pct = area * 100
  if (pct >= 10) return 'ใบหน้าขนาดใหญ่ (หลักของภาพ)'
  if (pct >= 3)  return 'ใบหน้าขนาดกลาง (เห็นชัด)'
  if (pct >= 0.5) return 'ใบหน้าขนาดเล็ก (อยู่ในกลุ่ม)'
  return 'ใบหน้าขนาดเล็กมาก'
}

/** แปลง confidence เป็นขั้น (เกณฑ์ใหม่: 97/90) */
function confidenceLevel(pct: number): { label: string; color: string; bg: string; border: string; barColor: string } {
  if (pct >= 97) return { label: 'ตรงมาก', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', barColor: 'bg-green-500' }
  if (pct >= 90) return { label: 'น่าจะใช่', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', barColor: 'bg-blue-500' }
  return { label: 'โปรดตรวจสอบ', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', barColor: 'bg-amber-500' }
}

/** Badge บนรูป */
function ConfidenceBadge({ value, verified }: { value: number; verified?: boolean }) {
  const lv = confidenceLevel(value)
  return (
    <span className={`text-xs font-bold px-2 py-1 rounded-full shadow-sm ${
      value >= 97 ? 'bg-green-500 text-white' :
      value >= 90 ? 'bg-blue-500 text-white' :
      'bg-amber-500 text-white'
    }`}>
      {verified ? '✓✓' : value >= 97 ? '✓' : value >= 90 ? '~' : '?'} {lv.label} {value}%
    </span>
  )
}

/** crop ใบหน้าที่ match — ให้ผู้ปกครองรู้ว่า match ใครในรูปหมู่ */
function FaceCrop({ fileId, bbox }: { fileId: string; bbox: NonNullable<SearchResult['bbox']> }) {
  if (bbox.width <= 0 || bbox.height <= 0) return null
  // ขยาย bbox เล็กน้อยให้เห็นทั้งหน้า
  const pad = 0.35
  const w = Math.min(bbox.width * (1 + pad * 2), 1)
  const h = Math.min(bbox.height * (1 + pad * 2), 1)
  const l = Math.max(Math.min(bbox.left - bbox.width * pad, 1 - w), 0)
  const t = Math.max(Math.min(bbox.top - bbox.height * pad, 1 - h), 0)
  return (
    <span
      className="w-10 h-10 rounded-full border-2 border-white shadow-md bg-gray-200 bg-no-repeat shrink-0"
      title="ใบหน้าที่ระบบจับคู่ได้"
      style={{
        backgroundImage: `url(${displayCdnUrl(fileId)})`,
        backgroundSize: `${100 / w}% ${100 / h}%`,
        backgroundPosition: `${(l / (1 - w || 1)) * 100}% ${(t / (1 - h || 1)) * 100}%`,
      }}
    />
  )
}

export default function ResultCard({ result, onNotMatch }: ResultCardProps) {
  const [showWhy, setShowWhy] = useState(false)
  // ไฟล์ถูกลบ/ย้าย/ยกเลิกแชร์ใน Drive → แสดงรูปไม่ได้
  const [missing, setMissing] = useState(false)
  const fullSrc = `/api/image/${result.drive_file_id}?w=1600`
  const dlName = result.file_name ?? `photo_${result.drive_file_id.slice(0, 8)}`
  const downloadSrc = `/api/image/${result.drive_file_id}?download=1&name=${encodeURIComponent(dlName)}`
  const lv = confidenceLevel(result.confidence)

  const formattedDate = result.event_date
    ? new Date(result.event_date).toLocaleDateString('th-TH', {
        year: 'numeric', month: 'short', day: 'numeric',
      })
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 group animate-slideUp">

      {/* Image */}
      {missing ? (
        <div className="relative aspect-square bg-gray-50 flex flex-col items-center justify-center text-center px-4 gap-2">
          <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 3l18 18M10.5 8.25H19.5A2.25 2.25 0 0121.75 10.5v7.5M3.75 7.5A2.25 2.25 0 016 5.25h1.5M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159" />
          </svg>
          <p className="text-xs font-medium text-gray-500">ไม่สามารถแสดงรูปนี้ได้</p>
          <p className="text-[11px] text-gray-400 leading-snug">ไฟล์ถูกลบหรือย้ายออกจาก Google Drive แล้ว</p>
          <div className="absolute top-2 left-2 right-2 flex justify-end">
            <ConfidenceBadge value={result.confidence} verified={result.verified} />
          </div>
        </div>
      ) : (
        <a href={fullSrc} target="_blank" rel="noopener noreferrer">
          <div className="relative aspect-square bg-gray-100 overflow-hidden">
            <SmartImg
              fileId={result.drive_file_id}
              width={600}
              alt={result.file_name ?? 'Photo'}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
              onAllFailed={() => setMissing(true)}
            />
            <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
              {result.bbox ? <FaceCrop fileId={result.drive_file_id} bbox={result.bbox} /> : <span />}
              <ConfidenceBadge value={result.confidence} verified={result.verified} />
            </div>
          </div>
        </a>
      )}

      {/* Info */}
      <div className="p-3 space-y-2">
        {result.event_name && (
          <div className="flex items-center gap-1.5 min-w-0">
            <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
            </svg>
            <p className="text-xs font-semibold text-blue-600 truncate">{result.event_name}</p>
          </div>
        )}

        <p className="text-xs text-gray-500 truncate">
          {result.file_name ?? `photo_${result.drive_file_id.slice(0, 8)}`}
        </p>

        {formattedDate && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{formattedDate}</span>
          </div>
        )}

        {/* ปุ่ม "ทำไมถึง Match" */}
        <button
          onClick={() => setShowWhy(v => !v)}
          className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-gray-600
            py-1 px-2 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ทำไมถึง Match?
          </span>
          <svg className={`w-3.5 h-3.5 transition-transform ${showWhy ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* คำอธิบาย */}
        {showWhy && (
          <div className={`rounded-xl border p-3 space-y-2.5 text-xs ${lv.bg} ${lv.border}`}>

            {/* 1. ความคล้ายของใบหน้า */}
            <div className="space-y-1">
              <div className="flex justify-between font-medium text-gray-700">
                <span>ความคล้ายของใบหน้า</span>
                <span className={lv.color}>{result.confidence}%</span>
              </div>
              <div className="w-full bg-white/70 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full ${lv.barColor}`}
                  style={{ width: `${result.confidence}%` }} />
              </div>
              <p className="text-gray-500">
                AWS Rekognition วิเคราะห์โครงสร้างใบหน้า 128 จุด และให้คะแนนความคล้าย{' '}
                <span className={`font-semibold ${lv.color}`}>{result.confidence}%</span>{' '}
                — ระดับ <span className="font-semibold">{lv.label}</span>
              </p>
            </div>

            {/* 2. ขนาดใบหน้าในภาพ */}
            <div className="space-y-1">
              <div className="flex justify-between font-medium text-gray-700">
                <span>ขนาดใบหน้าในภาพ</span>
                <span className="text-gray-600">{(result.faceArea * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-white/70 rounded-full h-1.5">
                <div className="h-1.5 rounded-full bg-purple-400"
                  style={{ width: `${Math.min(result.faceArea * 500, 100)}%` }} />
              </div>
              <p className="text-gray-500">
                ใบหน้าในรูปต้นฉบับครอบพื้นที่{' '}
                <span className="font-semibold text-purple-600">{(result.faceArea * 100).toFixed(2)}%</span>{' '}
                ของภาพ → {faceAreaLabel(result.faceArea)}
              </p>
            </div>

            {/* 3. สรุปการตัดสินใจ */}
            <div className={`rounded-lg p-2 bg-white/60 border ${lv.border}`}>
              <p className={`font-semibold ${lv.color}`}>
                {result.confidence >= 90
                  ? '✅ ใบหน้าตรงกันมาก — มั่นใจสูงว่าเป็นคนเดียวกัน'
                  : result.confidence >= 75
                  ? '🔵 ใบหน้าน่าจะตรงกัน — แนะนำให้ดูรูปยืนยันเพิ่มเติม'
                  : '🟡 ใบหน้าอาจตรงกัน — กรุณาตรวจสอบด้วยตาอีกครั้ง'}
              </p>
            </div>
          </div>
        )}

        {/* ปุ่มดาวน์โหลด (ซ่อนถ้าไฟล์หาย) */}
        {!missing && (
        <a
          href={downloadSrc}
          download={dlName}
          className="flex items-center justify-center gap-1.5 w-full mt-1 py-1.5 rounded-lg
            bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          ดาวน์โหลด
        </a>
        )}

        {/* feedback: ไม่ใช่คนที่ค้นหา → ซ่อน + เก็บข้อมูลปรับปรุงระบบ */}
        {onNotMatch && !missing && (
          <button
            onClick={onNotMatch}
            className="w-full text-center text-[11px] text-gray-300 hover:text-red-400 transition-colors py-0.5"
          >
            ✕ ไม่ใช่คนนี้
          </button>
        )}
      </div>
    </div>
  )
}
