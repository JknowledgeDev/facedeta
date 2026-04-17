'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { SyncEvent } from '@/app/api/sync-drive/route'
import { apiUrl } from '@/lib/api-url'
import { STORAGE_KEY } from '@/components/AdminModal'

/** แยก Folder ID จาก Google Drive URL หรือ ID ดิบ */
function extractFolderId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
  return trimmed
}

interface LogEntry {
  fileName: string
  status: 'indexed' | 'skipped' | 'no_face' | 'error'
  facesIndexed?: number
  error?: string
}

interface SyncStats {
  totalProcessed: number
  totalFaces: number
  countIndexed: number
  countSkipped: number
  countNoFace: number
  countError: number
}

export default function AdminPage() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem(STORAGE_KEY) !== '1') router.replace('/')
    }
  }, [router])

  // ── Settings (collapsible) ─────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)
  const [folderUrl, setFolderUrl] = useState('')
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')

  // ── Sync state ─────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false)
  const [done, setDone] = useState(false)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [stats, setStats] = useState<SyncStats>({
    totalProcessed: 0, totalFaces: 0,
    countIndexed: 0, countSkipped: 0, countNoFace: 0, countError: 0,
  })
  const [log, setLog] = useState<LogEntry[]>([])
  const [showLog, setShowLog] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const stopRef = useRef(false)

  const previewId = folderUrl.trim() ? extractFolderId(folderUrl) : null
  const isValidId = previewId && /^[a-zA-Z0-9_-]{10,}$/.test(previewId)

  // ── SSE หน้าเดียว → คืน nextPageToken ถ้ายังมีต่อ ─────────────────
  const syncOnePage = useCallback((
    pageToken: string | undefined,
    currentStats: SyncStats,
    signal: AbortSignal,
  ): Promise<{ nextPageToken?: string; stats: SyncStats; stopped: boolean }> => {
    return new Promise(async (resolve, reject) => {
      const folderId = extractFolderId(folderUrl)
      let latestStats = { ...currentStats }

      try {
        const res = await fetch(apiUrl('/api/sync-drive'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventName,
            eventDate,
            folderId,
            resumeToken: pageToken,
            prevProcessed: currentStats.totalProcessed,
            prevFaces: currentStats.totalFaces,
            prevIndexed: currentStats.countIndexed,
            prevSkipped: currentStats.countSkipped,
            prevNoFace: currentStats.countNoFace,
            prevError: currentStats.countError,
          }),
          signal,
        })

        if (!res.ok || !res.body) {
          reject(new Error('เชื่อมต่อล้มเหลว'))
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          if (stopRef.current) {
            reader.cancel()
            resolve({ stats: latestStats, stopped: true })
            return
          }

          const { done: streamDone, value } = await reader.read()
          if (streamDone) break

          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''

          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data: ')) continue
            const event: SyncEvent = JSON.parse(line.slice(6))

            if (event.type === 'error') {
              reject(new Error(event.errorMessage ?? 'เกิดข้อผิดพลาด'))
              return
            }

            // อัปเดต stats สะสม
            if (event.totalProcessed !== undefined) {
              latestStats = {
                totalProcessed: event.totalProcessed,
                totalFaces: event.totalFaces ?? latestStats.totalFaces,
                countIndexed: event.countIndexed ?? latestStats.countIndexed,
                countSkipped: event.countSkipped ?? latestStats.countSkipped,
                countNoFace: event.countNoFace ?? latestStats.countNoFace,
                countError: event.countError ?? latestStats.countError,
              }
              setStats(latestStats)
            }

            if (event.type === 'progress' && event.fileName) {
              setCurrentFile(event.fileName)
              if (event.status && event.status !== 'skipped') {
                setLog((prev) => [{
                  fileName: event.fileName!,
                  status: event.status!,
                  facesIndexed: event.facesIndexed,
                  error: event.errorMessage,
                }, ...prev].slice(0, 200)) // เก็บแค่ 200 รายการล่าสุด
              }
            }

            if (event.type === 'page-done') {
              resolve({ nextPageToken: event.nextPageToken, stats: latestStats, stopped: false })
              return
            }

            if (event.type === 'done') {
              resolve({ stats: latestStats, stopped: false })
              return
            }
          }
        }

        resolve({ stats: latestStats, stopped: false })
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          resolve({ stats: latestStats, stopped: true })
        } else {
          reject(err)
        }
      }
    })
  }, [folderUrl, eventName, eventDate])

  // ── เริ่ม Sync (วนทุก page อัตโนมัติ) ────────────────────────────
  const handleSync = async () => {
    setSyncing(true)
    setDone(false)
    setLog([])
    setCurrentFile(null)
    stopRef.current = false

    const abort = new AbortController()
    abortRef.current = abort

    let currentStats: SyncStats = {
      totalProcessed: 0, totalFaces: 0,
      countIndexed: 0, countSkipped: 0, countNoFace: 0, countError: 0,
    }
    setStats(currentStats)

    let pageToken: string | undefined = undefined
    let pageNum = 0

    try {
      while (true) {
        pageNum++
        const result = await syncOnePage(pageToken, currentStats, abort.signal)
        currentStats = result.stats

        if (result.stopped) {
          toast('หยุด Sync แล้ว', { icon: '⏹️' })
          break
        }

        if (!result.nextPageToken) {
          // ครบทุกรูปแล้ว
          toast.success(`✅ Sync ครบแล้ว! ${currentStats.totalProcessed} รูป, ${currentStats.totalFaces} ใบหน้า`)
          setDone(true)
          break
        }

        // ยังมีหน้าต่อ → วนต่อทันที
        pageToken = result.nextPageToken
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSyncing(false)
      setCurrentFile(null)
    }
  }

  const handleStop = () => {
    stopRef.current = true
    abortRef.current?.abort()
  }

  const handleReset = () => {
    setDone(false)
    setLog([])
    setStats({ totalProcessed: 0, totalFaces: 0, countIndexed: 0, countSkipped: 0, countNoFace: 0, countError: 0 })
  }

  const statCards = [
    { label: 'Index สำเร็จ', value: stats.countIndexed, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', icon: '✅' },
    { label: 'ข้ามแล้ว (ซ้ำ)', value: stats.countSkipped, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', icon: '⏭️' },
    { label: 'ไม่พบใบหน้า', value: stats.countNoFace, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', icon: '🔍' },
    { label: 'ผิดพลาด', value: stats.countError, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200', icon: '❌' },
  ]

  const logStatusStyle = (s: LogEntry['status']) => ({
    indexed: 'text-green-600 bg-green-50',
    skipped: 'text-gray-400 bg-gray-50',
    no_face: 'text-yellow-600 bg-yellow-50',
    error: 'text-red-500 bg-red-50',
  }[s])

  const logStatusLabel = (r: LogEntry) => {
    if (r.status === 'indexed') return `✓ ${r.facesIndexed} ใบหน้า`
    if (r.status === 'no_face') return 'ไม่พบหน้า'
    if (r.status === 'error') return `⚠ ${r.error?.slice(0, 40) ?? 'error'}`
    return 'ข้าม'
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">จัดการระบบ</h1>
          <p className="text-gray-400 text-sm mt-0.5">Sync รูปภาพจาก Google Drive เข้าระบบ</p>
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

      {/* Main Sync Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6 space-y-5">

        {/* Big icon + title */}
        <div className="text-center">
          <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3 transition-colors
            ${syncing ? 'bg-emerald-100' : done ? 'bg-green-100' : 'bg-green-50'}`}>
            {done ? (
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className={`w-8 h-8 text-emerald-600 ${syncing ? 'animate-spin' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </div>
          <h2 className="font-bold text-gray-800 text-lg">
            {done ? 'Sync เสร็จเรียบร้อย!' : syncing ? 'กำลัง Sync...' : 'Sync รูปทั้งหมดจาก Drive'}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            {done
              ? `ประมวลผลครบ ${stats.totalProcessed} รูป พบ ${stats.totalFaces} ใบหน้า`
              : syncing
              ? `กำลังประมวลผล... (ดึงทุกรูปจนครบ ไม่ต้องกดซ้ำ)`
              : 'ระบบจะดึงและ Index ทุกรูปใน Google Drive อัตโนมัติ'}
          </p>
        </div>

        {/* Current file (ระหว่าง sync) */}
        {syncing && currentFile && (
          <div className="bg-emerald-50 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
            <span className="text-emerald-700 font-medium truncate">{currentFile}</span>
          </div>
        )}

        {/* Stat cards */}
        {(syncing || done || stats.totalProcessed > 0) && (
          <div className="grid grid-cols-4 gap-2">
            {statCards.map((c) => (
              <div key={c.label} className={`rounded-xl border p-3 text-center ${c.bg} ${c.border}`}>
                <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{c.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Settings toggle */}
        {!syncing && !done && (
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="w-full flex items-center justify-between text-sm text-gray-500 hover:text-gray-700
              py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              ตั้งค่า (Folder, ชื่อกิจกรรม, วันที่)
            </span>
            <svg className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {/* Settings form */}
        {showSettings && !syncing && !done && (
          <div className="space-y-3 pt-1 border-t border-gray-100">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Google Drive Folder URL
                <span className="text-gray-400 font-normal ml-1">(ว่างไว้ = ใช้ค่า default จาก .env)</span>
              </label>
              <input
                type="text"
                placeholder="https://drive.google.com/drive/folders/..."
                value={folderUrl}
                onChange={(e) => setFolderUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {previewId && (
                <p className={`text-xs mt-1 flex items-center gap-1 ${isValidId ? 'text-green-600' : 'text-red-500'}`}>
                  {isValidId
                    ? <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>ID: <span className="font-mono">{previewId}</span></>
                    : '⚠ ไม่สามารถอ่าน Folder ID ได้'}
                </p>
              )}
            </div>
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
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {!done ? (
            <>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400
                  disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors
                  flex items-center justify-center gap-2"
              >
                {syncing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    กำลัง Sync ทุกรูป...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync ทุกรูปจาก Drive
                  </>
                )}
              </button>
              {syncing && (
                <button
                  onClick={handleStop}
                  className="py-3 px-5 bg-red-100 hover:bg-red-200 text-red-600 font-semibold
                    rounded-xl transition-colors text-sm"
                >
                  หยุด
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleReset}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold
                rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync ใหม่อีกครั้ง
            </button>
          )}
        </div>
      </div>

      {/* Log (collapsible) */}
      {log.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
          <button
            onClick={() => setShowLog((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              รายละเอียด
            </span>
            <span className="flex items-center gap-2 text-xs text-gray-400">
              {log.length} รายการ
              <svg className={`w-4 h-4 transition-transform ${showLog ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>

          {showLog && (
            <div className="border-t border-gray-100 max-h-72 overflow-y-auto">
              {log.map((r, i) => (
                <div key={i}
                  className="flex items-center justify-between px-5 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-mono text-gray-500 truncate flex-1 mr-3">{r.fileName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${logStatusStyle(r.status)}`}>
                    {logStatusLabel(r)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
