'use client'

import { type SearchResult } from '@/lib/supabase'

interface ResultCardProps {
  result: SearchResult
}

function ConfidenceBadge({ value }: { value: number }) {
  if (value >= 90) {
    return (
      <span className="text-xs font-bold px-2 py-1 rounded-full bg-green-500 text-white shadow-sm">
        ✓ ตรงมาก {value}%
      </span>
    )
  }
  if (value >= 75) {
    return (
      <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-500 text-white shadow-sm">
        ~ น่าจะใช่ {value}%
      </span>
    )
  }
  return (
    <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-500 text-white shadow-sm">
      ? อาจจะใช่ {value}%
    </span>
  )
}

export default function ResultCard({ result }: ResultCardProps) {
  // Use proxy route instead of Drive URL directly to support OAuth + HEIC
  const imgSrc = `/api/image/${result.drive_file_id}`

  const formattedDate = result.event_date
    ? new Date(result.event_date).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 group animate-slideUp">
      {/* Image */}
      <a href={result.view_url} target="_blank" rel="noopener noreferrer">
        <div className="relative aspect-square bg-gray-100 overflow-hidden">
          <img
            src={imgSrc}
            alt={result.file_name ?? 'Photo'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />

          {/* Confidence badge overlay */}
          <div className="absolute top-2 left-2 right-2 flex justify-end">
            <ConfidenceBadge value={result.confidence} />
          </div>
        </div>
      </a>

      {/* Info */}
      <div className="p-3 space-y-2">
        {/* Event name */}
        {result.event_name && (
          <div className="flex items-center gap-1.5 min-w-0">
            <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a2 2 0 012-2z" />
            </svg>
            <p className="text-xs font-semibold text-blue-600 truncate">{result.event_name}</p>
          </div>
        )}

        {/* File name */}
        <p className="text-xs text-gray-500 truncate">
          {result.file_name ?? `photo_${result.drive_file_id.slice(0, 8)}`}
        </p>

        {/* Date */}
        {formattedDate && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>{formattedDate}</span>
          </div>
        )}

        {/* Download / View button */}
        <a
          href={result.view_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 w-full mt-1 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-medium transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          ดู / ดาวน์โหลด
        </a>
      </div>
    </div>
  )
}
