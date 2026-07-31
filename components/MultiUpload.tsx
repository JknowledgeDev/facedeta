'use client'

import { useCallback, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { apiUrl } from '@/lib/api-url'
import { compressIfNeeded } from '@/lib/client-compress'

type FileStatus = 'waiting' | 'uploading' | 'indexed' | 'no_face' | 'skipped' | 'error'

interface QueueItem {
  id: string
  file: File
  status: FileStatus
  faces?: number
  error?: string
}

interface MultiUploadProps {
  eventName: string
  eventDate: string
}

const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB ต่อไฟล์ (บีบอัดฝั่ง browser ให้ต่ำกว่า 4MB ก่อนส่ง)
const CONCURRENCY = 2                    // อัพโหลดพร้อมกันสูงสุด 2 ไฟล์

export default function MultiUpload({ eventName, eventDate }: MultiUploadProps) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [running, setRunning] = useState(false)
  const stopRef = useRef(false)

  const onDrop = useCallback((accepted: File[]) => {
    const items: QueueItem[] = []
    for (const f of accepted) {
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`"${f.name}" ใหญ่เกิน 10MB — ข้ามไฟล์นี้`)
        continue
      }
      items.push({
        id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: 'waiting',
      })
    }
    if (items.length > 0) {
      setQueue((prev) => [...prev, ...items])
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'] },
    multiple: true,
    disabled: running,
  })

  const setItem = (id: string, patch: Partial<QueueItem>) =>
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))

  // ── อัพโหลดทีละไฟล์ ─────────────────────────────────────────────
  const uploadOne = async (item: QueueItem) => {
    setItem(item.id, { status: 'uploading' })
    try {
      const blob = await compressIfNeeded(item.file)
      const form = new FormData()
      form.append('image', blob, item.file.name)
      if (eventName) form.append('eventName', eventName)
      if (eventDate) form.append('eventDate', eventDate)

      const res = await fetch(apiUrl('/api/index-face'), { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      if (data.message === 'File already indexed') {
        setItem(item.id, { status: 'skipped' })
      } else if ((data.facesIndexed ?? 0) === 0) {
        setItem(item.id, { status: 'no_face' })
      } else {
        setItem(item.id, { status: 'indexed', faces: data.facesIndexed })
      }
    } catch (err: unknown) {
      setItem(item.id, {
        status: 'error',
        error: err instanceof Error ? err.message : 'อัพโหลดไม่สำเร็จ',
      })
    }
  }

  // ── เริ่มอัพโหลดทั้ง queue (พร้อมกันสูงสุด CONCURRENCY) ─────────
  const handleStart = async () => {
    stopRef.current = false
    setRunning(true)

    const pending = queue.filter((q) => q.status === 'waiting' || q.status === 'error')
    // reset error ให้กลับเป็น waiting เพื่อ retry
    for (const p of pending) if (p.status === 'error') setItem(p.id, { status: 'waiting', error: undefined })

    let idx = 0
    const worker = async () => {
      while (idx < pending.length && !stopRef.current) {
        const item = pending[idx++]
        await uploadOne(item)
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    setRunning(false)
    if (!stopRef.current) {
      toast.success('อัพโหลดเสร็จแล้ว!')
    }
  }

  const handleStop = () => { stopRef.current = true }
  const handleClear = () => setQueue((prev) => prev.filter((q) => q.status === 'waiting' || q.status === 'uploading'))
  const handleRemove = (id: string) => setQueue((prev) => prev.filter((q) => q.id !== id))

  const counts = {
    waiting: queue.filter((q) => q.status === 'waiting').length,
    indexed: queue.filter((q) => q.status === 'indexed').length,
    noFace: queue.filter((q) => q.status === 'no_face').length,
    skipped: queue.filter((q) => q.status === 'skipped').length,
    error: queue.filter((q) => q.status === 'error').length,
  }
  const doneCount = counts.indexed + counts.noFace + counts.skipped + counts.error
  const pct = queue.length > 0 ? Math.round((doneCount / queue.length) * 100) : 0

  const statusBadge = (q: QueueItem) => {
    switch (q.status) {
      case 'waiting': return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">รอ</span>
      case 'uploading': return (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 flex items-center gap-1">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />กำลังอัพ...
        </span>
      )
      case 'indexed': return <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium">✓ {q.faces} ใบหน้า</span>
      case 'no_face': return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600">ไม่พบหน้า</span>
      case 'skipped': return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-400">ซ้ำ (ข้าม)</span>
      case 'error': return <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-500" title={q.error}>⚠ ผิดพลาด</span>
    }
  }

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all duration-200 py-8 px-6
          ${running ? 'opacity-50 cursor-not-allowed' : ''}
          ${isDragActive ? 'border-green-500 bg-green-50 scale-[1.01]' : 'border-gray-300 hover:border-green-400 hover:bg-green-50/40'}`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDragActive ? 'bg-green-200' : 'bg-green-100'}`}>
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <p className="font-semibold text-gray-700 text-sm">
            {isDragActive ? 'วางรูปได้เลย!' : 'ลากหลายรูปมาวาง หรือคลิกเลือกจากเครื่อง'}
          </p>
          <p className="text-xs text-gray-400">เลือกได้หลายรูปพร้อมกัน • JPG, PNG, WEBP, HEIC • ไม่เกิน 10MB/รูป</p>
        </div>
      </div>

      {/* Queue summary + actions */}
      {queue.length > 0 && (
        <>
          {/* Progress */}
          {(running || doneCount > 0) && (
            <div className="space-y-1">
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="h-2.5 rounded-full bg-green-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{doneCount} / {queue.length} รูป</span>
                <span className="flex gap-2">
                  {counts.indexed > 0 && <span className="text-green-600">✓ {counts.indexed}</span>}
                  {counts.noFace > 0 && <span className="text-yellow-600">ไม่พบหน้า {counts.noFace}</span>}
                  {counts.skipped > 0 && <span className="text-gray-400">ซ้ำ {counts.skipped}</span>}
                  {counts.error > 0 && <span className="text-red-500">⚠ {counts.error}</span>}
                </span>
              </div>
            </div>
          )}

          {/* File list */}
          <div className="border border-gray-100 rounded-xl max-h-56 overflow-y-auto divide-y divide-gray-50">
            {queue.map((q) => (
              <div key={q.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono text-xs text-gray-600 truncate flex-1 mr-2">{q.file.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {statusBadge(q)}
                  {!running && q.status === 'waiting' && (
                    <button onClick={() => handleRemove(q.id)}
                      className="w-5 h-5 rounded-full hover:bg-red-50 text-gray-300 hover:text-red-500 flex items-center justify-center transition-colors">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            {!running ? (
              <>
                <button
                  onClick={handleStart}
                  disabled={counts.waiting + counts.error === 0}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300
                    disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors
                    flex items-center justify-center gap-2 text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  อัพโหลด {counts.waiting + counts.error} รูป
                </button>
                {doneCount > 0 && (
                  <button onClick={handleClear}
                    className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium rounded-xl transition-colors text-sm">
                    ล้างรายการเสร็จแล้ว
                  </button>
                )}
              </>
            ) : (
              <button onClick={handleStop}
                className="flex-1 py-2.5 bg-red-100 hover:bg-red-200 text-red-600 font-semibold rounded-xl transition-colors text-sm">
                หยุดหลังไฟล์ปัจจุบัน
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
