import sharp from 'sharp'

/** AWS Rekognition hard limit สำหรับ image.bytes */
export const AWS_MAX_BYTES = 5 * 1024 * 1024 // 5 MB = 5,242,880 bytes

/**
 * ตรวจสอบว่าเป็น HEIC/HEIF จาก magic bytes
 */
function isHeicBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false
  const ftyp = buf.toString('ascii', 4, 8)
  const brand = buf.toString('ascii', 8, 12).toLowerCase()
  return (
    ftyp === 'ftyp' &&
    (brand.startsWith('heic') ||
      brand.startsWith('heix') ||
      brand.startsWith('mif1') ||
      brand.startsWith('msf1') ||
      brand.startsWith('hevc') ||
      brand.startsWith('avif'))
  )
}

/**
 * แปลงรูปทุกฟอร์แมต (รวมถึง HEIC/HEIF) → JPEG Buffer
 * - HEIC → heic-convert (pure JS)
 * - อื่นๆ  → sharp (auto-rotate + compress)
 * - maxBytes > 0 → ลด quality ซ้ำจนต่ำกว่าขนาดที่กำหนด (สำหรับ AWS limit)
 */
export async function toJpegBuffer(
  input: Buffer,
  maxSize = 0,    // 0 = ไม่ resize, >0 = จำกัด px longest side
  maxBytes = 0    // 0 = ไม่จำกัด, >0 = บีบจนต่ำกว่า bytes ที่กำหนด
): Promise<Buffer> {
  let buf = input

  if (isHeicBuffer(buf)) {
    // dynamic import เพื่อหลีกเลี่ยง SSR/module issues
    const heicConvert = (await import('heic-convert')).default
    const ab = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.9 })
    buf = Buffer.from(ab)
  }

  // เริ่มที่ 1920px + quality 85 (พอดีกับหน้า)
  const dimension = maxSize > 0 ? maxSize : 1920

  let quality = 85
  let result: Buffer

  // วนลด quality จนต่ำกว่า maxBytes หรือถึง quality ต่ำสุด
  while (true) {
    result = await sharp(buf)
      .rotate()
      .resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer()

    // ไม่มี limit หรือเล็กพอแล้ว → ออก
    if (maxBytes <= 0 || result.length <= maxBytes) break

    // ลด quality ลง 10 ต่อรอบ
    quality -= 10
    if (quality < 40) {
      // ถ้า quality ต่ำมากแล้วแต่ยังใหญ่อยู่ → resize เพิ่มอีก
      result = await sharp(buf)
        .rotate()
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 60 })
        .toBuffer()
      break
    }
  }

  return result
}
