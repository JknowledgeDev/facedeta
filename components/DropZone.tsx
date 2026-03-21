'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'

interface DropZoneProps {
  onFileSelect: (file: File) => void
  label?: string
  sublabel?: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function DropZone({ onFileSelect, label, sublabel }: DropZoneProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)
  const [tooLarge, setTooLarge] = useState(false)

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0]
      if (!file) return

      if (file.size > 10 * 1024 * 1024) {
        setTooLarge(true)
        return
      }

      setTooLarge(false)
      const url = URL.createObjectURL(file)
      setPreview(url)
      setFileName(file.name)
      setFileSize(file.size)
      onFileSelect(file)
    },
    [onFileSelect]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  })

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-2xl text-center cursor-pointer
          transition-all duration-200
          ${isDragActive
            ? 'border-blue-500 bg-blue-50 scale-[1.01]'
            : preview
            ? 'border-blue-300 bg-white'
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/40'
          }
        `}
      >
        <input {...getInputProps()} />

        {preview ? (
          /* ── Preview state ── */
          <div className="p-4 flex flex-col items-center gap-3">
            <div className="relative">
              <img
                src={preview}
                alt="Preview"
                className="max-h-52 max-w-full rounded-xl object-contain shadow-md"
              />
              {/* Change overlay */}
              <div className="absolute inset-0 rounded-xl bg-black/0 hover:bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-all duration-200">
                <span className="bg-white/90 text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full shadow">
                  คลิกเพื่อเปลี่ยนรูป
                </span>
              </div>
            </div>

            {/* File info */}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium truncate max-w-[200px]">{fileName}</span>
              <span className="text-gray-400 text-xs shrink-0">({formatBytes(fileSize)})</span>
            </div>

            <p className="text-xs text-gray-400">คลิกหรือลากรูปใหม่มาวางเพื่อเปลี่ยน</p>
          </div>
        ) : (
          /* ── Empty state ── */
          <div className="flex flex-col items-center gap-3 py-10 px-6">
            <div className={`
              w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm
              ${isDragActive ? 'bg-blue-200' : 'bg-blue-100'}
            `}>
              <svg className={`w-8 h-8 ${isDragActive ? 'text-blue-600' : 'text-blue-500'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>

            <div>
              <p className="font-semibold text-gray-700 text-base">
                {isDragActive ? 'วางรูปได้เลย!' : (label ?? 'ลากรูปมาวางหรือคลิกเพื่อเลือก')}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {sublabel ?? 'JPG, PNG, WEBP, HEIC • ไม่เกิน 10MB'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Too large warning ── */}
      {tooLarge && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 animate-fadeIn">
          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-red-600">
            ไฟล์มีขนาดใหญ่เกิน 10MB กรุณาลดขนาดรูปก่อนอัพโหลด
          </p>
        </div>
      )}
    </div>
  )
}
