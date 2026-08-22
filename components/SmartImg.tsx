'use client'

import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { thumbCdnUrl, thumbProxyUrl } from '@/lib/thumb-url'

interface SmartImgProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  fileId: string
  /** ความกว้างสำหรับ fallback proxy */
  width?: number
  /** callback เมื่อทั้ง CDN และ proxy โหลดไม่ได้ */
  onAllFailed?: () => void
}

/**
 * รูป thumbnail ที่โหลดจาก CDN ก่อน (เร็ว) → ถ้าไม่มี fallback ไป proxy อัตโนมัติ
 */
export default function SmartImg({ fileId, width = 500, onAllFailed, ...rest }: SmartImgProps) {
  const [stage, setStage] = useState<'cdn' | 'proxy' | 'failed'>('cdn')

  // reset เมื่อเปลี่ยนรูป
  useEffect(() => { setStage('cdn') }, [fileId])

  if (stage === 'failed') return null

  const src = stage === 'cdn' ? thumbCdnUrl(fileId) : thumbProxyUrl(fileId, width)

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={src}
      onError={() => {
        if (stage === 'cdn') setStage('proxy')
        else { setStage('failed'); onAllFailed?.() }
      }}
    />
  )
}
