'use client'

import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/api-url'

interface Stats {
  totalFaces: number
  totalPhotos: number
  totalEvents: number
  totalSearches: number
}

const ITEMS = [
  {
    key: 'totalFaces' as const,
    label: 'ใบหน้าทั้งหมด',
    icon: '👤',
    iconBg: 'bg-blue-100',
    valueCls: 'text-blue-600',
    cardBorder: 'border-blue-100',
  },
  {
    key: 'totalPhotos' as const,
    label: 'รูปภาพ',
    icon: '🖼️',
    iconBg: 'bg-purple-100',
    valueCls: 'text-purple-600',
    cardBorder: 'border-purple-100',
  },
  {
    key: 'totalEvents' as const,
    label: 'กิจกรรม',
    icon: '📅',
    iconBg: 'bg-green-100',
    valueCls: 'text-green-600',
    cardBorder: 'border-green-100',
  },
  {
    key: 'totalSearches' as const,
    label: 'ค้นหาแล้ว',
    icon: '🔍',
    iconBg: 'bg-orange-100',
    valueCls: 'text-orange-600',
    cardBorder: 'border-orange-100',
  },
]

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-gray-100 animate-skeleton shrink-0" />
      <div className="space-y-2 flex-1">
        <div className="h-5 w-16 bg-gray-100 rounded animate-skeleton" />
        <div className="h-3 w-20 bg-gray-100 rounded animate-skeleton" />
      </div>
    </div>
  )
}

export default function StatsBar() {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    fetch(apiUrl('/api/stats'))
      .then((r) => r.json())
      .then(setStats)
      .catch(() => null)
  }, [])

  if (!stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {ITEMS.map((item) => (
          <SkeletonCard key={item.key} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {ITEMS.map((item) => {
        const raw = stats[item.key]
        const display = (raw ?? 0).toLocaleString('th-TH')
        return (
          <div
            key={item.key}
            className={`bg-white rounded-2xl p-5 border shadow-sm flex items-center gap-4 ${item.cardBorder} animate-fadeIn`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${item.iconBg} shrink-0`}>
              {item.icon}
            </div>
            <div className="min-w-0">
              <p className={`text-2xl font-bold leading-tight ${item.valueCls}`}>{display}</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{item.label}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
