import sharp from 'sharp'

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
 */
export async function toJpegBuffer(
  input: Buffer,
  maxSize = 0   // 0 = ไม่ resize, >0 = จำกัด px longest side
): Promise<Buffer> {
  let buf = input

  if (isHeicBuffer(buf)) {
    // dynamic import เพื่อหลีกเลี่ยง SSR/module issues
    const heicConvert = (await import('heic-convert')).default
    const ab = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.9 })
    buf = Buffer.from(ab)
  }

  let pipeline = sharp(buf).rotate()

  if (maxSize > 0) {
    pipeline = pipeline.resize(maxSize, maxSize, {
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  return pipeline.jpeg({ quality: 85 }).toBuffer()
}
