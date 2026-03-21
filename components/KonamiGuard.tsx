'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ↑ ↑ ↓ ↓ ← → ← → Enter
const KONAMI = [
  'ArrowUp','ArrowUp',
  'ArrowDown','ArrowDown',
  'ArrowLeft','ArrowRight',
  'ArrowLeft','ArrowRight',
  'Enter',
]

const SECRET = 'Jknowledge'
const STORAGE_KEY = 'fd_admin_unlocked'

export function useAdminAuth() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export default function KonamiGuard() {
  const router = useRouter()
  const seqRef = useRef<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Konami listener ──────────────────────────────────────────────
  const handleKey = useCallback((e: KeyboardEvent) => {
    // ไม่รับ key ขณะพิมพ์ใน input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    seqRef.current = [...seqRef.current, e.key].slice(-KONAMI.length)

    if (seqRef.current.join(',') === KONAMI.join(',')) {
      seqRef.current = []
      setShowModal(true)
      setPassword('')
      setError(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // ── Submit password ───────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === SECRET) {
      localStorage.setItem(STORAGE_KEY, '1')
      setShowModal(false)
      router.push('/admin')
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      setPassword('')
      inputRef.current?.focus()
    }
  }

  const handleClose = () => {
    setShowModal(false)
    setPassword('')
    setError(false)
  }

  if (!showModal) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className={`relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-6
          ${shake ? 'animate-shake' : ''}`}
        style={shake ? { animation: 'shake 0.4s ease' } : {}}
      >
        {/* Icon */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">พื้นที่สำหรับผู้ดูแล</h2>
          <p className="text-sm text-gray-500 mt-1">กรุณาใส่รหัสผ่านเพื่อเข้าใช้งาน</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              รหัสผ่าน
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false) }}
              placeholder="••••••••••••"
              className={`w-full border-2 rounded-xl px-4 py-3 text-sm outline-none transition-all
                ${error
                  ? 'border-red-400 bg-red-50 focus:border-red-500'
                  : 'border-gray-200 focus:border-blue-500 bg-white'
                }`}
            />
            {error && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                รหัสผ่านไม่ถูกต้อง กรุณาลองใหม่
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!password}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700
              disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed
              text-white font-semibold rounded-xl shadow-md transition-all"
          >
            เข้าสู่หน้าจัดการ
          </button>

          <button
            type="button"
            onClick={handleClose}
            className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            ยกเลิก
          </button>
        </form>
      </div>

      <style jsx global>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-10px); }
          40%       { transform: translateX(10px); }
          60%       { transform: translateX(-8px); }
          80%       { transform: translateX(8px); }
        }
      `}</style>
    </div>
  )
}
