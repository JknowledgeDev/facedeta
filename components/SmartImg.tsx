'use client'

import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { thumbCdnUrl, thumbProxyUrl, privateImageUrl } from '@/lib/thumb-url'
import type { Zone } from '@/lib/zone'

interface SmartImgProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  fileId: string
  /** ความกว้างสำหรับ fallback proxy */
  width?: number
  /** โซนของรูป — 'private' โหลดผ่าน API ที่ตรวจรหัสผู้ดูแล */
  zone?: Zone
  /** callback เมื่อทั้ง CDN และ proxy โหลดไม่ได้ */
  onAllFailed?: () => void
}

/**
 * รูป thumbnail ที่โหลดจาก CDN ก่อน (เร็ว) → ถ้าไม่มี fallback ไป proxy อัตโนมัติ
 * (โซนส่วนตัวมีทางเดียว: API ตรวจรหัส → signed URL)
 */
export default function SmartImg({ fileId, width = 500, zone = 'public', onAllFailed, ...rest }: SmartImgProps) {
  const [stage, setStage] = useState<'cdn' | 'proxy' | 'failed'>('cdn')

  // reset เมื่อเปลี่ยนรูป
  useEffect(() => { setStage('cdn') }, [fileId, zone])

  if (stage === 'failed') return null

  const src = zone === 'private'
    ? privateImageUrl(fileId, 'thumb')
    : stage === 'cdn' ? thumbCdnUrl(fileId) : thumbProxyUrl(fileId, width)

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={src}
      onError={() => {
        if (zone !== 'private' && stage === 'cdn') setStage('proxy')
        else { setStage('failed'); onAllFailed?.() }
      }}
    />
  )
}
