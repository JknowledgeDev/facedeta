'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

const SECRET = 'Jknowledge'
export const STORAGE_KEY = 'fd_admin_unlocked'

export default function AdminModal() {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const openModal = () => {
    setShowModal(true)
    setPassword('')
    setError(false)
    setTimeout(() => inputRef.current?.focus(), 100)
  }

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

  return (
    <>
      {/* ── Navbar Button ── */}
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-green-700
          px-3 py-2 rounded-lg hover:bg-green-50 font-medium transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        จัดการระบบ
      </button>

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

          {/* Card */}
          <div className={`relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-6 ${shake ? 'animate-shake' : ''}`}>
            {/* Icon */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg mb-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-1.5">รหัสผ่าน</label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(false) }}
                    placeholder="••••••••••••"
                    className={`w-full border-2 rounded-xl px-4 py-3 text-sm outline-none transition-all pr-11
                      ${error
                        ? 'border-red-400 bg-red-50 focus:border-red-500'
                        : 'border-gray-200 focus:border-green-500 bg-white'
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPw
                      ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
                {error && (
                  <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className="w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-600
                  hover:from-green-700 hover:to-emerald-700
                  disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed
                  text-white font-semibold rounded-xl shadow-md transition-all text-sm"
              >
                เข้าสู่หน้าจัดการ
              </button>

              <button type="button" onClick={handleClose}
                className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium">
                ยกเลิก
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
