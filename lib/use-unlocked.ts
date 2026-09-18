'use client'

import { useEffect, useState } from 'react'
import { apiUrl } from '@/lib/api-url'

/**
 * สถานะ "ใส่รหัสผู้ดูแลแล้ว" จาก server (cookie httpOnly) — null = กำลังตรวจ
 * ใช้ตัดสินว่าจะโชว์สวิตช์โซนส่วนตัวไหม (ตัวข้อมูลจริง server ตรวจซ้ำทุกครั้งอยู่แล้ว)
 */
export function useUnlocked(): boolean | null {
  const [unlocked, setUnlocked] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    fetch(apiUrl('/api/auth/unlock'), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (alive) setUnlocked(!!d.unlocked) })
      .catch(() => { if (alive) setUnlocked(false) })
    return () => { alive = false }
  }, [])
  return unlocked
}
