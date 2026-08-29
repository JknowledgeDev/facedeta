// บีบอัดรูปฝั่ง browser ก่อนอัพโหลด
// Vercel จำกัด request body ~4.5 MB → บีบรูปที่ใหญ่เกินก่อนส่ง

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // 4 MB (เผื่อ margin จาก 4.5)

export interface CompressOptions {
  maxDim?: number    // px ด้านยาวสุด (default 1920)
  maxBytes?: number  // ขนาดสูงสุด (default 4MB)
}

export async function compressIfNeeded(file: File, opts: CompressOptions = {}): Promise<Blob> {
  const maxDim = opts.maxDim ?? 1920
  const maxBytes = opts.maxBytes ?? MAX_UPLOAD_BYTES
  const lower = file.name.toLowerCase()
  const isHeic = lower.endsWith('.heic') || lower.endsWith('.heif')

  // HEIC: browser render ไม่ได้ → ส่งตรง (ปกติ <4 MB อยู่แล้ว)
  if (isHeic) return file

  // เล็กพอแล้ว → ส่งตรง
  if (file.size <= maxBytes) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')

      // จำกัดด้านยาวสุด — ลดขนาดแต่ยังเห็นหน้าชัด
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
        else { width = Math.round(width * maxDim / height); height = maxDim }
      }

      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

      // ลด quality 0.9 → 0.8 → ... จนต่ำกว่า limit
      let quality = 0.9
      const tryNext = () => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return }
          if (blob.size <= maxBytes || quality <= 0.5) {
            resolve(blob)
          } else {
            quality = Math.round((quality - 0.1) * 10) / 10
            tryNext()
          }
        }, 'image/jpeg', quality)
      }
      tryNext()
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
