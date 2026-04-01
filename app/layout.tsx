import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import AdminModal from '@/components/AdminModal'
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
        <nav className="bg-white border-b border-green-100 sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">

            {/* Logo */}
            <a href="/" className="flex items-center gap-2.5 font-bold text-green-700 text-xl">
              <div className="w-9 h-9 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
              <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                FaceDeta
              </span>
            </a>

            {/* Right side */}
            <div className="flex items-center gap-2">
              <a href="/"
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-green-700
                  px-3 py-2 rounded-lg hover:bg-green-50 font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <span className="hidden sm:inline">ค้นหารูป</span>
              </a>

              <a href="/gallery"
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-green-700
                  px-3 py-2 rounded-lg hover:bg-green-50 font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3.75 3h16.5A.75.75 0 0121 3.75v13.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 17.25V3.75A.75.75 0 013.75 3z" />
                </svg>
                <span className="hidden sm:inline">แกลเลอรี่</span>
              </a>

              {/* Admin button → opens password modal */}
              <AdminModal />
            </div>
          </div>
        </nav>

        {/* ─── Main ─── */}
        <main className="max-w-5xl mx-auto px-4 py-6 sm:py-8 min-h-screen">
          {children}
        </main>

        {/* ─── Footer ─── */}
        <footer className="mt-12 border-t border-green-100 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-5 text-center">
            <p className="text-sm text-gray-400">
              สร้างด้วย <span className="text-red-400">❤️</span> เพื่อช่วยค้นหารูปเด็ก
            </p>
          </div>
        </footer>

        <Toaster
          position="top-center"
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
