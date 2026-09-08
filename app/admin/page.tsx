'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { SyncEvent } from '@/app/api/sync-drive/route'
import { apiUrl } from '@/lib/api-url'
import { STORAGE_KEY } from '@/components/AdminModal'
import MultiUpload from '@/components/MultiUpload'
import PhotoManager from '@/components/PhotoManager'

function extractFolderId(input: string): string {
  const trimmed = input.trim()
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
  return trimmed
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} วินาที`
  if (seconds < 3600) return `${Math.round(seconds / 60)} นาที`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `${h} ชม. ${m} นาที`
}

interface LogEntry {
  fileName: string
  status: 'indexed' | 'skipped' | 'no_face' | 'error'
  facesIndexed?: number
  error?: string
}

interface Counters {
  processed: number
  faces: number
  indexed: number
  skipped: number
  noFace: number
  error: number
}

type Phase = 'idle' | 'counting' | 'syncing' | 'done' | 'stopped'

const ZERO: Counters = { processed: 0, faces: 0, indexed: 0, skipped: 0, noFace: 0, error: 0 }

export default function AdminPage() {
  const router = useRouter()
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (localStorage.getItem(STORAGE_KEY) !== '1') router.replace('/')
    }
  }, [router])

  // Settings
  const [showSettings, setShowSettings] = useState(false)
  const [folderUrl, setFolderUrl] = useState('')
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')

  // อัพโหลดจากเครื่อง
  const [uploadEventName, setUploadEventName] = useState('')
  const [uploadEventDate, setUploadEventDate] = useState('')

  // กิจกรรมที่มีอยู่ (autocomplete + จัดการชื่อ)
  interface EventInfo { name: string; dates: string[]; count: number }
  const [existingEvents, setExistingEvents] = useState<EventInfo[]>([])
  const [eventsVersion, setEventsVersion] = useState(0)
  const [showEventManager, setShowEventManager] = useState(false)
  const [editingEvent, setEditingEvent] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  // โหลดรายชื่อกิจกรรม (ใช้ทั้ง autocomplete และตัวจัดการ)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/events'))
        if (res.ok) {
          const d = await res.json()
          setExistingEvents(
            (d.events ?? []).map((e: { name: string; dates?: string[]; count?: number }) => ({
              name: e.name,
              dates: e.dates ?? [],
              count: e.count ?? 0,
            })).sort((a: EventInfo, b: EventInfo) => b.count - a.count)
          )
        }
      } catch { /* ignore */ }
    })()
  }, [eventsVersion])

  // จำชื่อกิจกรรม/วันที่ล่าสุด — ไม่ต้องกรอกใหม่ทุกครั้ง
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('fd_last_upload_event') ?? '{}')
      if (u.name) setUploadEventName(u.name)
      if (u.date) setUploadEventDate(u.date)
      const s = JSON.parse(localStorage.getItem('fd_last_sync_event') ?? '{}')
      if (s.name) setEventName(s.name)
      if (s.date) setEventDate(s.date)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    localStorage.setItem('fd_last_upload_event', JSON.stringify({ name: uploadEventName, date: uploadEventDate }))
  }, [uploadEventName, uploadEventDate])
  useEffect(() => {
    localStorage.setItem('fd_last_sync_event', JSON.stringify({ name: eventName, date: eventDate }))
  }, [eventName, eventDate])

  /** เมื่อเลือกชื่อกิจกรรมที่มีอยู่ → เติมวันที่ล่าสุดของกิจกรรมนั้นให้อัตโนมัติ */
  const autofillDate = (name: string, currentDate: string, setDate: (d: string) => void) => {
    if (currentDate) return
    const ev = existingEvents.find((e) => e.name === name)
    const latest = ev?.dates.slice().sort().reverse()[0]
    if (latest) setDate(latest)
  }

  /** เปลี่ยนชื่อ/รวมกิจกรรม */
  const handleRename = async (from: string) => {
    const to = editValue.trim()
    if (!to || to === from) { setEditingEvent(null); return }
    const isMerge = existingEvents.some((e) => e.name === to)
    if (isMerge && !window.confirm(`มีกิจกรรม "${to}" อยู่แล้ว — ต้องการรวม "${from}" เข้ากับ "${to}" ใช่ไหม?`)) {
      return
    }
    setRenaming(true)
    try {
      const res = await fetch(apiUrl('/api/events/rename'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'เปลี่ยนชื่อไม่สำเร็จ')
      toast.success(isMerge
        ? `รวม "${from}" เข้ากับ "${to}" แล้ว (${d.updated} รายการ)`
        : `เปลี่ยนชื่อเป็น "${to}" แล้ว (${d.updated} รายการ)`)
      setEditingEvent(null)
      setEventsVersion((v) => v + 1)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setRenaming(false)
    }
  }

  // Sync state
  const [phase, setPhase] = useState<Phase>('idle')
  const [totalFiles, setTotalFiles] = useState(0)
  const [counters, setCounters] = useState<Counters>(ZERO)
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [showLog, setShowLog] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  // Stop/abort
  const stopRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  // รายการไฟล์ทั้งหมด (จาก /api/sync-list) — scan ครั้งเดียว
  const filesRef = useRef<{ id: string; name: string }[]>([])

  // elapsed timer
  useEffect(() => {
    if (phase !== 'syncing' || !startTime) return
    const id = setInterval(() => setElapsed((Date.now() - startTime) / 1000), 1000)
    return () => clearInterval(id)
  }, [phase, startTime])

  const folderId = folderUrl.trim() ? extractFolderId(folderUrl) : ''
  const previewId = folderId || null
  const isValidId = !previewId || /^[a-zA-Z0-9_-]{10,}$/.test(previewId)

  const pct = totalFiles > 0 ? Math.min(100, Math.round((counters.processed / totalFiles) * 100)) : 0
  const rate = elapsed > 5 ? counters.processed / elapsed : 0 // รูป/วินาที
  const remaining = rate > 0 && totalFiles > counters.processed
    ? (totalFiles - counters.processed) / rate
    : null

  // ─── ขั้น 1: scan รายการไฟล์ทั้งหมด (รวมทุก subfolder) ────────────
  const fetchFileList = useCallback(async (): Promise<{ id: string; name: string }[]> => {
    setPhase('counting')
    const params = new URLSearchParams()
    if (folderId) params.set('folderId', folderId)
    const res = await fetch(apiUrl(`/api/sync-list?${params}`))
    if (!res.ok) throw new Error('สแกนรายการรูปไม่สำเร็จ')
    const { files } = await res.json()
    const list: { id: string; name: string }[] = files ?? []
    filesRef.current = list
    setTotalFiles(list.length)
    return list
  }, [folderId])

  // ─── ขั้น 2: sync ทีละ batch (SSE) ───────────────────────────────
  const syncBatch = useCallback((
    batch: { id: string; name: string }[],
    prev: Counters,
    signal: AbortSignal,
  ): Promise<{ counters: Counters; stopped: boolean }> => {
    return new Promise(async (resolve, reject) => {
      let latest = { ...prev }
      let serverSignaled = false

      try {
        const res = await fetch(apiUrl('/api/sync-drive'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventName,
            eventDate,
            files: batch,
            prevProcessed: prev.processed,
            prevFaces: prev.faces,
            prevIndexed: prev.indexed,
            prevSkipped: prev.skipped,
            prevNoFace: prev.noFace,
            prevError: prev.error,
          }),
          signal,
        })
        if (!res.ok || !res.body) { reject(new Error('เชื่อมต่อล้มเหลว')); return }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''

        while (true) {
          if (stopRef.current) { reader.cancel(); resolve({ counters: latest, stopped: true }); return }
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''

          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data: ')) continue
            const ev: SyncEvent = JSON.parse(line.slice(6))

            if (ev.type === 'error') { reject(new Error(ev.errorMessage ?? 'error')); return }

            if (ev.totalProcessed !== undefined) {
              latest = {
                processed: ev.totalProcessed,
                faces: ev.totalFaces ?? latest.faces,
                indexed: ev.countIndexed ?? latest.indexed,
                skipped: ev.countSkipped ?? latest.skipped,
                noFace: ev.countNoFace ?? latest.noFace,
                error: ev.countError ?? latest.error,
              }
              setCounters(latest)
            }

            if (ev.type === 'progress' && ev.fileName) {
              setCurrentFile(ev.fileName)
              if (ev.status && ev.status !== 'skipped') {
                setLog(p => [{
                  fileName: ev.fileName!,
                  status: ev.status!,
                  facesIndexed: ev.facesIndexed,
                  error: ev.errorMessage,
                }, ...p].slice(0, 300))
              }
            }

            if (ev.type === 'done') {
              serverSignaled = true
              resolve({ counters: latest, stopped: false })
              return
            }
          }
        }

        // stream จบโดยไม่มี signal จาก server → network ขาด → throw เพื่อให้ retry
        if (!serverSignaled) {
          reject(new Error('Stream ended unexpectedly — will retry'))
        } else {
          resolve({ counters: latest, stopped: false })
        }
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          resolve({ counters: latest, stopped: true })
        } else {
          reject(err)
        }
      }
    })
  }, [eventName, eventDate])

  // ─── Main: นับ → sync ทีละ page จนครบ ─────────────────────────────
  const handleSync = async () => {
    stopRef.current = false
    const abort = new AbortController()
    abortRef.current = abort

    setCounters(ZERO)
    setLog([])
    setCurrentFile(null)
    setElapsed(0)

    try {
      // 1. สแกนรายการไฟล์ทั้งหมด (รวมทุก subfolder)
      const allFiles = await fetchFileList()
      const total = allFiles.length
      if (stopRef.current) { setPhase('stopped'); return }
      if (total === 0) { toast('ไม่พบรูปภาพในโฟลเดอร์นี้', { icon: '⚠️' }); setPhase('idle'); return }

      toast.success(`พบรูปทั้งหมด ${total.toLocaleString()} รูป (รวมทุกโฟลเดอร์ย่อย) เริ่ม Sync...`)

      // 2. Sync ทีละ batch จนครบ
      setPhase('syncing')
      setStartTime(Date.now())

      const BATCH = 10            // batch เล็ก → อัปเดตบ่อย (เกือบ realtime) + ไม่ timeout
      const MAX_RETRY = 10        // retry สูงสุดต่อ batch
      let current: Counters = ZERO
      let offset = 0

      while (offset < total) {
        if (stopRef.current) break

        const batch = allFiles.slice(offset, offset + BATCH)
        let attempt = 0
        let result: { counters: Counters; stopped: boolean } | null = null

        while (attempt < MAX_RETRY) {
          try {
            result = await syncBatch(batch, current, abort.signal)
            break
          } catch (err: unknown) {
            if ((err as Error).name === 'AbortError' || stopRef.current) {
              result = { counters: current, stopped: true }
              break
            }
            attempt++
            if (attempt >= MAX_RETRY) throw err
            // Exponential backoff: 3s, 6s, 12s, 24s, 30s, 30s, ...
            const wait = Math.min(3000 * Math.pow(2, attempt - 1), 30000)
            toast(`Network หลุด กำลัง retry (${attempt}/${MAX_RETRY})...`, { icon: '🔄', duration: wait })
            await new Promise(r => setTimeout(r, wait))
          }
        }

        if (!result || result.stopped) break
        current = result.counters
        offset += batch.length
      }

      if (offset >= total) {
        // ✅ ครบทุกรูปแล้ว
        setPhase('done')
        toast.success(`✅ Sync ครบแล้ว! ${current.processed.toLocaleString()} รูป, ${current.faces.toLocaleString()} ใบหน้า`)
        setCurrentFile(null)
        return
      }

      // หยุดกลางคัน
      setPhase('stopped')
      setCurrentFile(null)
      toast(`หยุด Sync แล้ว (${current.processed.toLocaleString()}/${total.toLocaleString()} รูป)`, { icon: '⏹️' })
    } catch (err: unknown) {
      setPhase('idle')
      toast.error(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    }
  }

  const handleStop = () => {
    stopRef.current = true
    abortRef.current?.abort()
  }

  const handleReset = () => {
    setPhase('idle')
    setTotalFiles(0)
    setCounters(ZERO)
    setLog([])
    setCurrentFile(null)
    setElapsed(0)
  }

  const isBusy = phase === 'counting' || phase === 'syncing'

  const statCards = [
    { label: 'Index สำเร็จ', val: counters.indexed, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { label: 'ข้ามแล้ว (ซ้ำ)', val: counters.skipped, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' },
    { label: 'ไม่พบใบหน้า', val: counters.noFace, color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200' },
    { label: 'ผิดพลาด', val: counters.error, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
  ]

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">จัดการระบบ</h1>
          <p className="text-gray-400 text-sm mt-0.5">Sync รูปภาพจาก Google Drive เข้าระบบ</p>
        </div>
        <button onClick={() => { localStorage.removeItem(STORAGE_KEY); router.replace('/') }}
          className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          ออกจากระบบ
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6 space-y-5">

        {/* Icon + title */}
        <div className="text-center space-y-1">
          <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-3 transition-all
            ${phase === 'done' ? 'bg-green-100' : isBusy ? 'bg-emerald-100' : 'bg-green-50'}`}>
            {phase === 'done' ? (
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : phase === 'counting' ? (
              <svg className="w-8 h-8 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className={`w-8 h-8 text-emerald-600 ${phase === 'syncing' ? 'animate-spin' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </div>

          <h2 className="font-bold text-gray-800 text-lg">
            {phase === 'done' ? 'Sync เสร็จสมบูรณ์!' :
             phase === 'counting' ? 'กำลังนับรูปทั้งหมด...' :
             phase === 'syncing' ? 'กำลัง Sync รูปภาพ...' :
             phase === 'stopped' ? 'หยุด Sync แล้ว' :
             'Sync รูปทั้งหมดจาก Drive'}
          </h2>

          <p className="text-gray-400 text-sm">
            {phase === 'counting' && 'กำลังนับจำนวนรูปทั้งหมดในโฟลเดอร์...'}
            {phase === 'syncing' && totalFiles > 0 && `${counters.processed.toLocaleString()} / ${totalFiles.toLocaleString()} รูป`}
            {phase === 'done' && `${counters.processed.toLocaleString()} รูป | ${counters.faces.toLocaleString()} ใบหน้า | ใช้เวลา ${fmtDuration(elapsed)}`}
            {phase === 'stopped' && `ประมวลผลไป ${counters.processed.toLocaleString()} / ${totalFiles.toLocaleString()} รูป`}
            {phase === 'idle' && 'ระบบจะดึงทุกรูปจนครบ ไม่จำกัดจำนวน กดครั้งเดียวรอได้เลย'}
          </p>
        </div>

        {/* Progress bar */}
        {(phase === 'syncing' || phase === 'done' || phase === 'stopped') && totalFiles > 0 && (
          <div className="space-y-1.5">
            <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${phase === 'done' ? 'bg-green-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>{pct}% ({counters.processed.toLocaleString()} รูป)</span>
              <span className="flex items-center gap-3">
                {remaining && phase === 'syncing' && (
                  <span>เหลือ ~{fmtDuration(remaining)}</span>
                )}
                {phase === 'syncing' && elapsed > 0 && (
                  <span>ผ่านไป {fmtDuration(elapsed)}</span>
                )}
                <span className="font-medium text-gray-600">/{totalFiles.toLocaleString()} รูปทั้งหมด</span>
              </span>
            </div>
          </div>
        )}

        {/* Current file */}
        {phase === 'syncing' && currentFile && (
          <div className="bg-emerald-50 rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
            <span className="text-emerald-700 truncate">{currentFile}</span>
          </div>
        )}

        {/* Stat cards */}
        {(isBusy || phase === 'done' || phase === 'stopped') && (
          <div className="grid grid-cols-4 gap-2">
            {statCards.map((c) => (
              <div key={c.label} className={`rounded-xl border p-3 text-center ${c.bg} ${c.border}`}>
                <p className={`text-2xl font-bold ${c.color}`}>{c.val.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-tight">{c.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Keep-open notice */}
        {phase === 'syncing' && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>กรุณาเปิดหน้าต่างนี้ไว้ระหว่าง Sync • หากหน้าปิดแล้วกด Sync ใหม่ได้เลย รูปที่ Index แล้วจะไม่ถูกซ้ำ</span>
          </div>
        )}

        {/* Settings toggle */}
        {phase === 'idle' && (
          <button onClick={() => setShowSettings(v => !v)}
            className="w-full flex items-center justify-between text-sm text-gray-500 hover:text-gray-700
              py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              ตั้งค่า Folder, ชื่อกิจกรรม, วันที่
            </span>
            <svg className={`w-4 h-4 transition-transform ${showSettings ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}

        {showSettings && phase === 'idle' && (
          <div className="space-y-3 pt-1 border-t border-gray-100">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Google Drive Folder URL
                <span className="text-gray-400 font-normal ml-1">(ว่างไว้ = ใช้ folder เริ่มต้นจาก .env)</span>
              </label>
              <input type="text" placeholder="https://drive.google.com/drive/folders/..."
                value={folderUrl} onChange={(e) => setFolderUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
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
                <input type="text" placeholder="เช่น Medcamp 2567" value={eventName} list="event-names"
                  onChange={(e) => {
                    setEventName(e.target.value)
                    autofillDate(e.target.value, eventDate, setEventDate)
                  }}
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

        {/* Buttons */}
        <div className="flex gap-3">
          {phase === 'idle' || phase === 'stopped' ? (
            <button onClick={handleSync}
              className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold
                rounded-xl transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {phase === 'stopped' ? 'Sync ต่อ (รูปที่เหลือ)' : 'Sync ทุกรูปจาก Drive'}
            </button>
          ) : phase === 'done' ? (
            <button onClick={handleReset}
              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold
                rounded-xl transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync ใหม่อีกครั้ง
            </button>
          ) : (
            <>
              <button disabled
                className="flex-1 py-3 bg-green-400 cursor-not-allowed text-white font-semibold
                  rounded-xl flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                {phase === 'counting' ? 'กำลังนับรูป...' : 'กำลัง Sync...'}
              </button>
              <button onClick={handleStop}
                className="py-3 px-5 bg-red-100 hover:bg-red-200 text-red-600 font-semibold rounded-xl transition-colors text-sm">
                หยุด
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── อัพโหลดจากเครื่อง (หลายรูปพร้อมกัน) ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
          </div>
          <div>
            <h2 className="font-bold text-gray-800">อัพโหลดจากเครื่อง</h2>
            <p className="text-xs text-gray-400">เลือกหลายรูปพร้อมกัน — ระบบจะอัพขึ้น Drive และ Index ใบหน้าให้อัตโนมัติ</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">ชื่อกิจกรรม</label>
            <input type="text" placeholder="เช่น Medcamp 2569" value={uploadEventName} list="event-names"
              onChange={(e) => {
                setUploadEventName(e.target.value)
                autofillDate(e.target.value, uploadEventDate, setUploadEventDate)
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">วันที่</label>
            <input type="date" value={uploadEventDate} onChange={(e) => setUploadEventDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>
        </div>

        <MultiUpload eventName={uploadEventName} eventDate={uploadEventDate} />
      </div>

      {/* Autocomplete รายชื่อกิจกรรมที่มีอยู่ (ใช้ร่วมทั้ง sync และอัพโหลด) */}
      <datalist id="event-names">
        {existingEvents.map((ev) => (
          <option key={ev.name} value={ev.name}>{`${ev.count} รูป`}</option>
        ))}
      </datalist>

      {/* ── จัดการชื่อกิจกรรม (เปลี่ยนชื่อ/รวมกิจกรรมซ้ำ) ── */}
      {existingEvents.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
          <button onClick={() => setShowEventManager((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
            <span className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
              </svg>
              จัดการชื่อกิจกรรม
            </span>
            <span className="flex items-center gap-2 text-xs text-gray-400">
              {existingEvents.length} กิจกรรม
              <svg className={`w-4 h-4 transition-transform ${showEventManager ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>

          {showEventManager && (
            <div className="border-t border-gray-100">
              <p className="text-xs text-gray-400 px-5 pt-3">
                💡 พิมพ์ชื่อใหม่เป็นชื่อกิจกรรมที่มีอยู่แล้ว = รวมสองกิจกรรมเข้าด้วยกัน
              </p>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
                {existingEvents.map((ev) => (
                  <div key={ev.name} className="flex items-center justify-between px-5 py-2.5 gap-2">
                    {editingEvent === ev.name ? (
                      <>
                        <input
                          type="text" value={editValue} autoFocus list="event-names"
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(ev.name)
                            if (e.key === 'Escape') setEditingEvent(null)
                          }}
                          className="flex-1 border border-green-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <button onClick={() => handleRename(ev.name)} disabled={renaming}
                          className="text-xs px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors shrink-0">
                          {renaming ? '...' : 'บันทึก'}
                        </button>
                        <button onClick={() => setEditingEvent(null)}
                          className="text-xs px-2 py-1.5 text-gray-400 hover:text-gray-600 transition-colors shrink-0">
                          ยกเลิก
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{ev.name}</p>
                          <p className="text-xs text-gray-400">
                            {ev.count.toLocaleString()} รูป{ev.dates.length > 0 ? ` • ${ev.dates.slice().sort().reverse()[0]}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => { setEditingEvent(ev.name); setEditValue(ev.name) }}
                          className="text-xs px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg font-medium transition-colors shrink-0 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                          แก้ชื่อ
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ลบรูปออกจากระบบ (อัพล่าสุดอยู่บนสุด) ── */}
      <PhotoManager onChanged={() => setEventsVersion((v) => v + 1)} />

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
          <button onClick={() => setShowLog(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
            <span className="font-semibold text-gray-700 text-sm">รายละเอียด</span>
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
                <div key={i} className="flex items-center justify-between px-5 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-xs font-mono text-gray-500 truncate flex-1 mr-3">{r.fileName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                    r.status === 'indexed' ? 'text-green-600 bg-green-50' :
                    r.status === 'no_face' ? 'text-yellow-600 bg-yellow-50' :
                    r.status === 'error' ? 'text-red-500 bg-red-50' : 'text-gray-400 bg-gray-50'
                  }`}>
                    {r.status === 'indexed' ? `✓ ${r.facesIndexed} ใบหน้า` :
                     r.status === 'no_face' ? 'ไม่พบหน้า' :
                     r.status === 'error' ? `⚠ ${r.error?.slice(0, 40)}` : 'ข้าม'}
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
