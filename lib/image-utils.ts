import sharp from 'sharp'

/** AWS Rekognition hard limit สำหรับ image.bytes */
export const AWS_MAX_BYTES = 5 * 1024 * 1024 // 5 MB = 5,242,880 bytes

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
 * แปลงรูปทุกฟอร์แมต (รวมถึง HEIC) → JPEG Buffer
 *
 * @param maxSize  0 = ไม่ resize, >0 = จำกัด px longest side
 * @param maxBytes 0 = ไม่จำกัด, >0 = บีบจนต่ำกว่า bytes ที่กำหนด
 *
 * กลยุทธ์ (เรียงจากเร็วไปช้า):
 * 1. HEIC → แปลงก่อนเสมอ
 * 2. ไม่มี constraint → rotate + JPEG เท่านั้น (เร็วสุด)
 * 3. maxSize เท่านั้น → resize + JPEG (เช่น image proxy)
 * 4. maxBytes → ลองแปลงแบบไม่ resize ก่อน ถ้ายังใหญ่เกินค่อย resize ลงซ้ำ
 *    (ป้องกัน resize โดยไม่จำเป็น = รูปส่วนใหญ่จะผ่านใน step นี้เลย)
 */
export async function toJpegBuffer(
  input: Buffer,
  maxSize = 0,
  maxBytes = 0,
): Promise<Buffer> {
  let buf = input

  // ── HEIC → JPEG (pure JS, รองรับ Windows + Vercel) ─────────────────
  if (isHeicBuffer(buf)) {
    const heicConvert = (await import('heic-convert')).default
    const ab = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.9 })
    buf = Buffer.from(ab)
  }

  // ── ไม่มี constraint → เร็วสุด: แค่ rotate + convert ──────────────
  if (maxSize === 0 && maxBytes === 0) {
    return sharp(buf).rotate().jpeg({ quality: 85 }).toBuffer()
  }

  // ── มีแค่ maxSize (เช่น image proxy /api/image) ─────────────────────
  if (maxSize > 0 && maxBytes === 0) {
    return sharp(buf)
      .rotate()
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()
  }

  // ── มี maxBytes (ส่งให้ AWS Rekognition) ────────────────────────────
  // Step 1: ลองแปลงแบบไม่ resize ก่อน (เส้นทางที่เร็วและเกิดบ่อยสุด)
  const full = await sharp(buf).rotate().jpeg({ quality: 85 }).toBuffer()
  if (full.length <= maxBytes) {
    // รูปเล็กพอแล้ว → ไม่ต้อง resize เลย
    return full
  }

  // Step 2: ใหญ่เกิน → resize แล้วลด quality จนพอ
  const dimension = maxSize > 0 ? maxSize : 1920
  let quality = 80
  let result = full

  while (quality >= 40) {
    result = await sharp(buf)
      .rotate()
      .resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer()
    if (result.length <= maxBytes) return result
    quality -= 10
  }

  // Step 3: fallback สุดท้าย → บีบให้เล็กลงอีก
  return sharp(buf)
    .rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 60 })
    .toBuffer()
}
