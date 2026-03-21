import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import KonamiGuard from '@/components/KonamiGuard'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'FaceDeta — ค้นหาใบหน้าในภาพ',
  description: 'ระบบค้นหารูปภาพด้วยใบหน้า powered by AWS Rekognition',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className={inter.className}>
        {/* ─── Navigation ─── */}
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            {/* Logo */}
            <a href="/" className="flex items-center gap-2.5 font-bold text-blue-700 text-xl">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                FaceDeta
              </span>
            </a>

            {/* Links — Admin ถูกซ่อน เข้าได้ผ่าน Konami Code เท่านั้น */}
            <div className="flex items-center gap-3">
              <a
                href="/"
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-50 font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                ค้นหารูป
              </a>
            </div>
          </div>
        </nav>

        {/* ─── Main Content ─── */}
        <main className="max-w-5xl mx-auto px-4 py-8 min-h-screen">
          {children}
        </main>

        {/* ─── Footer ─── */}
        <footer className="mt-16 border-t border-gray-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-6 text-center">
            <p className="text-sm text-gray-400">
              สร้างด้วย{' '}
              <span className="text-red-400">❤️</span>
              {' '}เพื่อช่วยค้นหารูปเด็ก
            </p>
          </div>
        </footer>

        <KonamiGuard />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: '12px',
              fontFamily: 'inherit',
              fontSize: '14px',
            },
          }}
        />
      </body>
    </html>
  )
}
