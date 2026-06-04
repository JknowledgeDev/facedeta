'use client'

import { useState, useMemo } from 'react'

interface PhotoCalendarProps {
  days: Record<string, number>          // { "YYYY-MM-DD": count }
  events: Record<string, string[]>      // { "YYYY-MM-DD": [eventName] }
  selectedDate: string | null
  onSelect: (date: string | null) => void
  loading?: boolean
}

const TH_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

/** วันที่วันนี้ (เวลาไทย) เป็น YYYY-MM-DD */
function todayThai(): string {
  const now = new Date()
  const thai = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60 * 1000)
  return thai.toISOString().slice(0, 10)
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

export default function PhotoCalendar({ days, events, selectedDate, onSelect, loading }: PhotoCalendarProps) {
  const today = todayThai()

  // เดือนเริ่มต้น = เดือนล่าสุดที่มีรูป (หรือเดือนปัจจุบัน)
  const initialMonth = useMemo(() => {
    const keys = Object.keys(days)
    const base = keys.length > 0 ? keys.sort().reverse()[0] : today
    const [y, m] = base.split('-').map(Number)
    return { year: y, month: m - 1 } // month 0-indexed
  }, [days]) // eslint-disable-line react-hooks/exhaustive-deps

  const [view, setView] = useState(initialMonth)

  const grid = useMemo(() => {
    const firstDay = new Date(view.year, view.month, 1).getDay() // 0=อา
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
    const cells: (string | null)[] = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${view.year}-${pad(view.month + 1)}-${pad(d)}`)
    }
    return cells
  }, [view])

  const monthTotal = useMemo(() => {
    const prefix = `${view.year}-${pad(view.month + 1)}-`
    return Object.entries(days)
      .filter(([k]) => k.startsWith(prefix))
      .reduce((s, [, v]) => s + v, 0)
  }, [days, view])

  const totalDaysWithPhotos = Object.keys(days).length
  const totalPhotos = Object.values(days).reduce((s, v) => s + v, 0)

  const prevMonth = () => setView((v) => {
    const m = v.month - 1
    return m < 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: m }
  })
  const nextMonth = () => setView((v) => {
    const m = v.month + 1
    return m > 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: m }
  })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-green-100 p-4 sm:p-5 space-y-4">

      {/* Summary */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">ปฏิทินรูปภาพ</p>
            <p className="text-xs text-gray-400">
              {loading ? 'กำลังโหลด...' : `มีรูป ${totalDaysWithPhotos} วัน • รวม ${totalPhotos.toLocaleString()} รูป`}
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex gap-1.5">
          <button
            onClick={() => {
              const [y, m] = today.split('-').map(Number)
              setView({ year: y, month: m - 1 })
              onSelect(today)
            }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
              ${selectedDate === today ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
          >
            วันนี้
          </button>
          <button
            onClick={() => onSelect(null)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors
              ${selectedDate === null ? 'bg-green-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
          >
            ทั้งหมด
          </button>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth}
          className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <p className="font-semibold text-gray-700 text-sm">
          {TH_MONTHS[view.month]} {view.year + 543}
          {monthTotal > 0 && <span className="text-green-600 font-normal ml-1.5">({monthTotal} รูป)</span>}
        </p>
        <button onClick={nextMonth}
          className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {TH_DOW.map((d, i) => (
          <div key={d} className={`text-xs font-medium py-1 ${i === 0 ? 'text-red-400' : 'text-gray-400'}`}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />
          const count = days[date] ?? 0
          const hasPhotos = count > 0
          const isToday = date === today
          const isSelected = date === selectedDate
          const dayNum = parseInt(date.split('-')[2], 10)
          const dow = i % 7

          return (
            <button
              key={date}
              disabled={!hasPhotos}
              onClick={() => onSelect(isSelected ? null : date)}
              className={`relative aspect-square rounded-lg flex flex-col items-center justify-center
                text-sm transition-all
                ${isSelected
                  ? 'bg-green-600 text-white font-bold shadow-md scale-105'
                  : hasPhotos
                  ? 'bg-green-50 text-green-700 font-semibold hover:bg-green-100 hover:scale-105 cursor-pointer'
                  : `text-gray-300 cursor-default ${dow === 0 ? 'text-red-200' : ''}`}
                ${isToday && !isSelected ? 'ring-2 ring-green-400 ring-offset-1' : ''}`}
            >
              <span>{dayNum}</span>
              {hasPhotos && (
                <span className={`text-[9px] leading-none mt-0.5 ${isSelected ? 'text-green-100' : 'text-green-500'}`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
              {/* dot indicator ถ้ามีกิจกรรม */}
              {events[date]?.length > 0 && (
                <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full
                  ${isSelected ? 'bg-white' : 'bg-amber-400'}`} />
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-gray-400 pt-1 border-t border-gray-50">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-50 border border-green-200" /> มีรูป
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> มีกิจกรรม
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded ring-2 ring-green-400" /> วันนี้
        </span>
      </div>
    </div>
  )
}
