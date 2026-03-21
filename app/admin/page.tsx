'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import DropZone from '@/components/DropZone'
import type { SyncEvent } from '@/app/api/sync-drive/route'
import { apiUrl } from '@/lib/api-url'

const STORAGE_KEY = 'fd_admin_unlocked'

interface IndexResult {
  fileName: string
  fileId: string
  status: 'indexed' | 'skipped' | 'no_face' | 'error'
  facesIndexed?: number
  error?: string
}

export default function AdminPage() {
  const router = useRouter()

  // ── Guard: ต้อง unlock ผ่าน Konami Code ก่อน ──────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ok = localStorage.getItem(STORAGE_KEY) === '1'
      if (!ok) router.replace('/')
    }
  }, [router])

  // Upload single
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [uploading, setUploading] = useState(false)

  // Sync Drive
  const [syncEventName, setSyncEventName] = useState('')
  const [syncEventDate, setSyncEventDate] = useState('')
  const [folderId, setFolderId] = useState('')   // custom folder id
  const [syncing, setSyncing] = useState(false)
  const [totalProcessed, setTotalProcessed] = useState(0)
  const [totalFaces, setTotalFaces] = useState(0)
  const [results, setResults] = useState<IndexResult[]>([])
  const abortRef = useRef<AbortController | null>(null)

  // ─── Upload single ───────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile) return
    setUploading(true)

    try {
      const form = new FormData()
      form.append('image', uploadFile)
      if (eventName) form.append('eventName', eventName)
      if (eventDate) form.append('eventDate', eventDate)

      const res = await fetch(apiUrl('/api/index-face'), { method: 'POST', body: form })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      if (data.facesIndexed === 0) {
        toast('ไม่พบใบหน้าในรูปนี้', { icon: '⚠️' })
      } else {
        toast.success(`Index สำเร็จ พบ ${data.facesIndexed} ใบหน้า`)
      }
      setUploadFile(null)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setUploading(false)
    }
  }

  // ─── Sync Drive (Streaming SSE) ──────────────────────────────────
  const handleSync = async () => {
    setSyncing(true)
    setResults([])
    setTotalProcessed(0)
    setTotalFaces(0)

    const abort = new AbortController()
    abortRef.current = abort

    try {
      const res = await fetch(apiUrl('/api/sync-drive'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName: syncEventName,
          eventDate: syncEventDate,
          folderId: folderId.trim(),   // ส่ง folder id ที่กรอก
        }),
        signal: abort.signal,
      })

      if (!res.ok || !res.body) throw new Error('เชื่อมต่อล้มเหลว')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // แยก SSE events ด้วย double newline
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''   // ส่วนที่ยังไม่สมบูรณ์เก็บไว้

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue

          const event: SyncEvent = JSON.parse(line.slice(6))

          if (event.type === 'done') {
            toast.success(`Sync เสร็จ! ${event.totalProcessed} รูป, ${event.totalFaces} ใบหน้า`)
            setSyncing(false)
            break
          }

          if (event.type === 'error') {
            toast.error(event.errorMessage ?? 'เกิดข้อผิดพลาด')
            setSyncing(false)
            break
          }

          if (event.type === 'progress' && event.fileName && event.fileId && event.status) {
            // อัพเดท counter
            if (event.totalProcessed) setTotalProcessed(event.totalProcessed)
            if (event.totalFaces) setTotalFaces(event.totalFaces)

            // เพิ่มผลใน list ทันที
            setResults((prev) => [
              {
                fileName: event.fileName!,
                fileId: event.fileId!,
                status: event.status!,
                facesIndexed: event.facesIndexed,
                error: event.errorMessage,
              },
              ...prev,  // ใหม่อยู่บนสุด
            ])
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        toast('หยุด Sync แล้ว', { icon: '⏹️' })
      } else {
        toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  // ─── UI helpers ──────────────────────────────────────────────────
  const statusColor = (s: IndexResult['status']) => ({
    indexed: 'text-green-600 bg-green-50',
    skipped: 'text-gray-400 bg-gray-50',
    no_face: 'text-yellow-600 bg-yellow-50',
    error: 'text-red-600 bg-red-50',
  }[s])

  const statusLabel = (r: IndexResult) => {
    if (r.status === 'indexed') return `✓ ${r.facesIndexed} ใบหน้า`
    if (r.status === 'skipped') return 'ข้าม (ซ้ำ)'
    if (r.status === 'no_face') return 'ไม่พบหน้า'
    if (r.status === 'error') return `ผิดพลาด: ${r.error ?? ''}`
    return r.status
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">จัดการรูปภาพ</h1>
        <p className="text-gray-500 mt-1">อัพโหลดรูปเพื่อเพิ่มเข้าระบบหรือ Sync จาก Google Drive</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* ── Upload Single ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            อัพโหลดรูปทีละรูป
          </h2>

          <DropZone onFileSelect={(file) => setUploadFile(file)} label="เลือกรูปภาพ" sublabel="JPG, PNG, WEBP, HEIC • ไม่เกิน 10MB" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">ชื่อกิจกรรม</label>
              <input type="text" placeholder="เช่น วันเด็ก 2567" value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">วันที่</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <button onClick={handleUpload} disabled={!uploadFile || uploading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
            {uploading ? (
              <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>กำลัง Index...</>
            ) : 'อัพโหลดและ Index'}
          </button>
        </div>

        {/* ── Sync Drive ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync จาก Google Drive
          </h2>

          {/* Folder ID input */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Google Drive Folder ID
              <span className="text-gray-400 font-normal ml-1">(ว่างไว้ = ใช้ค่าเริ่มต้นจาก .env)</span>
            </label>
            <input
              type="text"
              placeholder="วาง Folder ID ที่นี่ เช่น 1BxiMVs0XRA5nFM..."
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              disabled={syncing}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
            />
            <p className="text-xs text-gray-400 mt-1">
              เปิด Drive folder → copy ID จาก URL: drive.google.com/drive/folders/<span className="text-green-600 font-medium">FOLDER_ID</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">ชื่อกิจกรรม</label>
              <input type="text" placeholder="เช่น งานกีฬาสี" value={syncEventName}
                onChange={(e) => setSyncEventName(e.target.value)} disabled={syncing}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">วันที่</label>
              <input type="date" value={syncEventDate} onChange={(e) => setSyncEventDate(e.target.value)}
                disabled={syncing}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50" />
            </div>
          </div>

          {/* Stats */}
          {totalProcessed > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600">
                <span>ประมวลผลแล้ว</span>
                <span className="font-medium">{totalProcessed} รูป</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>ใบหน้าที่ Index</span>
                <span className="font-medium text-green-600">{totalFaces} ใบหน้า</span>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <button onClick={handleSync} disabled={syncing}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
              {syncing ? (
                <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>กำลัง Sync...</>
              ) : 'เริ่ม Sync Drive'}
            </button>

            {syncing && (
              <button onClick={handleStop}
                className="py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors text-sm">
                หยุด
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Realtime Results Log ── */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">ผลการ Sync</h3>
            <span className="text-xs text-gray-400">{results.length} รายการ</span>
          </div>
          <div className="max-h-96 overflow-y-auto space-y-1">
            {results.map((r, i) => (
              <div key={i}
                className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0 animate-fadeIn">
                <span className="text-gray-700 truncate flex-1 mr-3 font-mono text-xs">{r.fileName}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor(r.status)}`}>
                  {statusLabel(r)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
