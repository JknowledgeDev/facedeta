'use client'

import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import SmartImg from '@/components/SmartImg'
import { apiUrl } from '@/lib/api-url'

interface AdminPhoto {
  id: string
  name: string
  event: string | null
  date: string
  uploadedAt: string
  faceCount: number
}

const PAGE = 120          // แสดงทีละกี่รูป (กด "แสดงเพิ่ม" เพื่อดูต่อ)
const DELETE_BATCH = 25   // ลบทีละกี่รูปต่อ request (กัน timeout)

function fmtDay(iso: string): string {
  if (!iso) return 'ไม่ทราบวันที่'
  try {
    return new Date(iso).toLocaleDateString('th-TH', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return iso.slice(0, 10) }
}

/**
 * จัดการรูปในระบบ — ดู/เลือก/ลบรูปถาวร
 * เรียงรูปที่อัพเข้าระบบล่าสุดไว้บนสุด จัดกลุ่มตามวันที่อัพ
 */
export default function PhotoManager({ onChanged }: { onChanged?: () => void }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [photos, setPhotos] = useState<AdminPhoto[]>([])
  const [filter, setFilter] = useState('')   // '' = ทุกกิจกรรม
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [visible, setVisible] = useState(PAGE)
  const [deleting, setDeleting] = useState<{ done: number; total: number } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/admin/photos'))
      if (!res.ok) throw new Error('โหลดรายการรูปไม่สำเร็จ')
      const d = await res.json()
      const evs: string[] = d.events ?? []
      setPhotos(
        (d.photos ?? []).map((p: [string, string, number, string, string, number]) => ({
          id: p[0], name: p[1], event: p[2] >= 0 ? evs[p[2]] : null,
          date: p[3], uploadedAt: p[4], faceCount: p[5],
        }))
      )
      setLoaded(true)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && !loaded && !loading) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // รายชื่อกิจกรรม + จำนวนรูป (สำหรับ dropdown กรอง)
  const events = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of photos) if (p.event) m.set(p.event, (m.get(p.event) ?? 0) + 1)
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [photos])

  const filtered = useMemo(
    () => (filter ? photos.filter((p) => p.event === filter) : photos),
    [photos, filter]
  )

  // จัดกลุ่มตามวันที่อัพเข้าระบบ (API เรียงใหม่สุดก่อนมาแล้ว)
  const groups = useMemo(() => {
    const out: { day: string; items: AdminPhoto[] }[] = []
    for (const p of filtered.slice(0, visible)) {
      const day = p.uploadedAt ? p.uploadedAt.slice(0, 10) : ''
      if (out.length === 0 || out[out.length - 1].day !== day) out.push({ day, items: [] })
      out[out.length - 1].items.push(p)
    }
    return out
  }, [filtered, visible])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const handleDelete = async () => {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!window.confirm(
      `ลบ ${ids.length.toLocaleString()} รูปออกจากระบบถาวร?\n\n` +
      'รูปจะหายจากหน้าค้นหาและแกลเลอรี่ และสำเนาในระบบทั้งหมดจะถูกลบ — กู้คืนไม่ได้'
    )) return

    setDeleting({ done: 0, total: ids.length })
    let done = 0
    let failed = 0
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
      const batch = ids.slice(i, i + DELETE_BATCH)
      try {
        const res = await fetch(apiUrl('/api/admin/delete-photos'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileIds: batch }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error ?? 'ลบไม่สำเร็จ')
        done += batch.length
        const gone = new Set(batch)
        setPhotos((prev) => prev.filter((p) => !gone.has(p.id)))
        setSelected((prev) => {
          const n = new Set(prev)
          for (const b of batch) n.delete(b)
          return n
        })
        setDeleting({ done, total: ids.length })
      } catch {
        failed += batch.length
        // batch นี้ล้มเหลว (network/timeout) → ข้ามไปลอง batch ถัดไป รูปที่เหลือยังเลือกอยู่ ลบซ้ำได้
      }
    }
    setDeleting(null)
    if (failed > 0) toast.error(`ลบได้ ${done.toLocaleString()}/${ids.length.toLocaleString()} รูป — ที่เหลือยังถูกเลือกอยู่ กดลบอีกครั้งได้เลย`)
    else toast.success(`ลบ ${done.toLocaleString()} รูปออกจากระบบแล้ว`)
    onChanged?.()
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-green-100 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
        <span className="font-semibold text-gray-700 text-sm flex items-center gap-2">
          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          ลบรูปออกจากระบบ
        </span>
        <span className="flex items-center gap-2 text-xs text-gray-400">
          {loaded ? `${photos.length.toLocaleString()} รูป` : 'อัพล่าสุดอยู่บนสุด'}
          <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              กำลังโหลดรายการรูปทั้งหมด...
            </div>
          ) : (
            <>
              {/* แถบควบคุม */}
              <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b border-gray-50 sticky top-0 bg-white z-10">
                <select value={filter}
                  onChange={(e) => { setFilter(e.target.value); setVisible(PAGE) }}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 max-w-[45%]">
                  <option value="">ทุกกิจกรรม ({photos.length.toLocaleString()})</option>
                  {events.map(([name, count]) => (
                    <option key={name} value={name}>{name} ({count.toLocaleString()})</option>
                  ))}
                </select>

                <button onClick={() => setSelected(new Set(filtered.map((p) => p.id)))}
                  className="text-xs px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg font-medium transition-colors">
                  เลือกทั้งหมด{filter ? 'ในกิจกรรม' : ''}
                </button>
                {selected.size > 0 && (
                  <button onClick={() => setSelected(new Set())}
                    className="text-xs px-2.5 py-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                    ล้าง ({selected.size.toLocaleString()})
                  </button>
                )}

                <div className="flex-1" />

                {deleting ? (
                  <span className="text-xs text-red-500 font-medium flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    กำลังลบ {deleting.done.toLocaleString()}/{deleting.total.toLocaleString()}...
                  </span>
                ) : (
                  <button onClick={handleDelete} disabled={selected.size === 0}
                    className="text-xs px-3.5 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-400
                      text-white rounded-lg font-semibold transition-colors">
                    🗑️ ลบที่เลือก{selected.size > 0 ? ` (${selected.size.toLocaleString()})` : ''}
                  </button>
                )}
              </div>

              {/* กริดรูป จัดกลุ่มตามวันที่อัพเข้าระบบ */}
              <div className="max-h-[32rem] overflow-y-auto px-5 py-3 space-y-4">
                {filtered.length === 0 && (
                  <p className="text-center text-sm text-gray-400 py-8">ไม่มีรูปในระบบ</p>
                )}
                {groups.map((g) => (
                  <div key={g.day || 'unknown'}>
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                      </svg>
                      อัพเข้าระบบ {fmtDay(g.items[0].uploadedAt)}
                      <span className="text-gray-300 font-normal">• {g.items.length.toLocaleString()} รูป</span>
                    </p>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                      {g.items.map((p) => {
                        const isSel = selected.has(p.id)
                        return (
                          <button key={p.id} onClick={() => toggle(p.id)}
                            title={`${p.name}${p.event ? ` • ${p.event}` : ''}`}
                            className={`relative aspect-square rounded-lg overflow-hidden bg-gray-100 group
                              ${isSel ? 'ring-2 ring-red-500 ring-offset-1' : 'hover:opacity-90'}`}>
                            <SmartImg fileId={p.id} width={200} alt={p.name} loading="lazy"
                              className="w-full h-full object-cover" />
                            {isSel && (
                              <span className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                                <span className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow">
                                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </span>
                              </span>
                            )}
                            {p.faceCount === 0 && !isSel && (
                              <span className="absolute bottom-1 left-1 text-[9px] px-1 py-px bg-black/40 text-white rounded">
                                บรรยากาศ
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {visible < filtered.length && (
                  <button onClick={() => setVisible((v) => v + PAGE)}
                    className="w-full py-2.5 text-xs text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl font-medium transition-colors">
                    แสดงเพิ่ม ({(filtered.length - visible).toLocaleString()} รูปที่เหลือ)
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
