'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import DropZone from '@/components/DropZone'
import type { SyncEvent } from '@/app/api/sync-drive/route'
import { apiUrl } from '@/lib/api-url'
import { STORAGE_KEY } from '@/components/AdminModal'

interface IndexResult {
  fileName: string
  fileId: string
  status: 'indexed' | 'skipped' | 'no_face' | 'error'
  facesIndexed?: number
  error?: string
}

/** แยก Folder ID จาก Google Drive URL หรือ ID ดิบ */
function extractFolderId(input: string): string {
  const trimmed = input.trim()
  // URL: https://drive.google.com/drive/folders/FOLDER_ID?...
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  // ID ดิบ (ไม่มี / )
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
  return trimmed
}

export default function AdminPage() {
  const router = useRouter()

  // ── Guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem(STORAGE_KEY) !== '1') router.replace('/')
    }
  }, [router])

  // ── Upload single ──────────────────────────────────────────────────
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [uploading, setUploading] = useState(false)

  // ── Sync Drive ─────────────────────────────────────────────────────
  const [folderUrl, setFolderUrl] = useState('')   // URL หรือ ID
  const [syncEventName, setSyncEventName] = useState('')
  const [syncEventDate, setSyncEventDate] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [totalProcessed, setTotalProcessed] = useState(0)
  const [totalFaces, setTotalFaces] = useState(0)
  const [results, setResults] = useState<IndexResult[]>([])
  const abortRef = useRef<AbortController | null>(null)

  // ── Upload handler ─────────────────────────────────────────────────
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

  // ── Sync handler (SSE streaming) ──────────────────────────────────
  const handleSync = async () => {
    const folderId = extractFolderId(folderUrl)

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
        body: JSON.stringify({ eventName: syncEventName, eventDate: syncEventDate, folderId }),
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
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

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
            if (event.totalProcessed) setTotalProcessed(event.totalProcessed)
            if (event.totalFaces) setTotalFaces(event.totalFaces)
            setResults((prev) => [{
              fileName: event.fileName!,
              fileId: event.fileId!,
              status: event.status!,
              facesIndexed: event.facesIndexed,
              error: event.errorMessage,
            }, ...prev])
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
    return `ผิดพลาด: ${r.error ?? ''}`
  }

  // ── Preview extracted ID ───────────────────────────────────────────
  const previewId = folderUrl.trim() ? extractFolderId(folderUrl) : null
  const isValidId = previewId && /^[a-zA-Z0-9_-]{10,}$/.test(previewId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">จัดการรูปภาพ</h1>
          <p className="text-gray-500 mt-1 text-sm">อัพโหลดรูปหรือ Sync จาก Google Drive</p>
        </div>
        <button
          onClick={() => { localStorage.removeItem(STORAGE_KEY); router.replace('/') }}
          className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          ออกจากระบบ
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-5">

        {/* ── Upload Single ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm sm:text-base">
            <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            อัพโหลดรูปทีละรูป
          </h2>

          <DropZone onFileSelect={(f) => setUploadFile(f)}
            label="เลือกรูปภาพ"
            sublabel="JPG, PNG, WEBP, HEIC • ไม่เกิน 10MB" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">ชื่อกิจกรรม</label>
              <input type="text" placeholder="เช่น Medcamp 2567" value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">วันที่</label>
              <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          <button onClick={handleUpload} disabled={!uploadFile || uploading}
            className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
            {uploading
              ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>กำลัง Index...</>
              : 'อัพโหลดและ Index'}
          </button>
        </div>

        {/* ── Sync Drive ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-5 space-y-4">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2 text-sm sm:text-base">
            <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync จาก Google Drive
          </h2>

          {/* ── URL Input ── */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              ลิงก์ Google Drive Folder
            </label>
            <input
              type="text"
              placeholder="วาง URL หรือ Folder ID เช่น https://drive.google.com/drive/folders/..."
              value={folderUrl}
              onChange={(e) => setFolderUrl(e.target.value)}
              disabled={syncing}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50"
            />
            {/* Preview */}
            {previewId && (
              <p className={`text-xs mt-1.5 flex items-center gap-1 ${isValidId ? 'text-green-600' : 'text-red-500'}`}>
                {isValidId
                  ? <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Folder ID: <span className="font-mono font-medium">{previewId}</span></>
                  : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>ไม่สามารถอ่าน Folder ID ได้</>
                }
              </p>
            )}
            {!folderUrl.trim() && (
              <p className="text-xs text-gray-400 mt-1">ว่างไว้ = ใช้ folder เริ่มต้นจาก .env</p>
            )}
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

          {totalProcessed > 0 && (
            <div className="bg-green-50 rounded-xl p-3 text-sm grid grid-cols-2 gap-2">
              <div className="text-center">
                <p className="text-xl font-bold text-green-700">{totalProcessed}</p>
                <p className="text-xs text-gray-500">รูปที่ประมวลผล</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-emerald-700">{totalFaces}</p>
                <p className="text-xs text-gray-500">ใบหน้าที่ Index</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSync} disabled={syncing}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
              {syncing
                ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>กำลัง Sync...</>
                : 'เริ่ม Sync Drive'}
            </button>
            {syncing && (
              <button onClick={() => abortRef.current?.abort()}
                className="py-2.5 px-4 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors text-sm">
                หยุด
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Results Log ── */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 text-sm">ผลการ Sync</h3>
            <span className="text-xs text-gray-400">{results.length} รายการ</span>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-1 overscroll-contain">
            {results.map((r, i) => (
              <div key={i}
                className="flex items-center justify-between text-sm py-2 border-b border-gray-50 last:border-0 animate-fadeIn">
                <span className="text-gray-600 truncate flex-1 mr-3 font-mono text-xs">{r.fileName}</span>
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
