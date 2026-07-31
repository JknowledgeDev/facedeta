// บีบอัดรูปฝั่ง browser ก่อนอัพโหลด
// Vercel จำกัด request body ~4.5 MB → บีบรูปที่ใหญ่เกินก่อนส่ง

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // 4 MB (เผื่อ margin จาก 4.5)

export async function compressIfNeeded(file: File): Promise<Blob> {
  const lower = file.name.toLowerCase()
  const isHeic = lower.endsWith('.heic') || lower.endsWith('.heif')

  // HEIC: browser render ไม่ได้ → ส่งตรง (ปกติ <4 MB อยู่แล้ว)
  if (isHeic) return file

  // เล็กพอแล้ว → ส่งตรง
  if (file.size <= MAX_UPLOAD_BYTES) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')

      // จำกัดด้านยาวสุด 1920px — ลดขนาดแต่ยังเห็นหน้าชัด
      const MAX_DIM = 1920
      let { width, height } = img
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width >= height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM }
      }

      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

      // ลด quality 0.9 → 0.8 → ... จนต่ำกว่า limit
      let quality = 0.9
      const tryNext = () => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(file); return }
          if (blob.size <= MAX_UPLOAD_BYTES || quality <= 0.5) {
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
