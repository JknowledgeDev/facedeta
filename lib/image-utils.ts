import sharp from 'sharp'

/**
 * ไฟล์จากกล้อง (NEF/TIFF/JPEG บางตัว) มี metadata ไม่เป๊ะ เช่น tag Artist มี null byte
 * ค่าเริ่มต้นของ sharp (failOn: 'warning') จะโยน error ทั้งที่ decode รูปได้ → ผ่อนปรนเป็น 'none'
 */
const LENIENT: sharp.SharpOptions = { failOn: 'none' }

/** AWS Rekognition hard limit สำหรับ image.bytes */
export const AWS_MAX_BYTES = 5 * 1024 * 1024 // 5 MB = 5,242,880 bytes
/** ด้านยาวสุดที่ส่งให้ Rekognition — รูปใหญ่กว่านี้ AWS ตอบ "invalid image format" (พาโนรามา/ไฟล์กราฟิก) */
const AWS_MAX_DIM = 4096

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

/** TIFF header: "II*\0" (little-endian) หรือ "MM\0*" (big-endian) — รวมถึง RAW ที่อิง TIFF (ARW/NEF/DNG) */
function isTiffBuffer(buf: Buffer): boolean {
  if (buf.length < 4) return false
  return (
    (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
    (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)
  )
}

/**
 * ตรวจไฟล์ RAW ที่รู้ magic bytes แน่นอน (sharp เปิดไม่ได้ → ต้องใช้ JPEG ที่ฝังในไฟล์)
 * - Canon CR3: ISO-BMFF, ftyp brand "crx"
 * - Canon CR2: TIFF-based, "II" + "CR" ที่ byte 8
 * - Panasonic RW2: "IIU\0"
 * (Sony ARW / Nikon NEF / DNG ใช้ header TIFF ปกติ → ตรวจตอน sharp เปิดไม่สำเร็จแทน)
 */
function isRawBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false
  if (buf.toString('ascii', 4, 8) === 'ftyp' && buf.toString('ascii', 8, 11) === 'crx') return true
  if (buf[0] === 0x49 && buf[1] === 0x49 && buf.toString('ascii', 8, 10) === 'CR') return true
  if (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x55 && buf[3] === 0x00) return true
  return false
}

/**
 * หาจุดจบของ JPEG ที่เริ่มที่ตำแหน่ง s โดยเดินตามโครงสร้าง marker จริง
 * (ห้ามใช้ FFD9 ตัวแรก — preview ในไฟล์ RAW มักมี thumbnail JPEG ซ้อนอยู่ใน EXIF
 *  ซึ่งมี FFD9 ของตัวเอง ทำให้ตัดสั้นแล้วไฟล์เสีย)
 * คืน index หลัง EOI หรือ -1 ถ้าโครงสร้างไม่ใช่ JPEG
 */
function jpegEndOffset(buf: Buffer, s: number): number {
  let p = s + 2
  for (let guard = 0; guard < 10000 && p + 4 <= buf.length; guard++) {
    if (buf[p] !== 0xff) return -1
    const marker = buf[p + 1]
    if (marker === 0xff) { p++; continue }                       // padding
    if (marker === 0xd9) return p + 2                            // EOI
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue }
    const len = buf.readUInt16BE(p + 2)
    if (len < 2) return -1
    if (marker !== 0xda) { p += 2 + len; continue }              // segment ปกติ (APPn/DQT/SOF/DHT...)
    // SOS → ข้ามข้อมูล entropy จนเจอ marker จริง (ไม่ใช่ FF00 หรือ RSTn)
    let q = p + 2 + len
    while (q + 1 < buf.length) {
      if (buf[q] !== 0xff) { q++; continue }
      const m = buf[q + 1]
      if (m === 0x00 || (m >= 0xd0 && m <= 0xd7)) { q += 2; continue }
      if (m === 0xff) { q++; continue }
      break
    }
    if (q + 1 >= buf.length) return -1
    p = q
  }
  return -1
}

/**
 * ดึง JPEG ที่ฝังในไฟล์ RAW/คอนเทนเนอร์ — หาทุกตำแหน่ง SOI(FFD8FF) แล้วคำนวณจุดจบ
 * ตามโครงสร้างจริง เลือก "อันใหญ่สุดที่ decode ได้" (บาง FFD8FF เป็น false positive
 * ในข้อมูล sensor → ต้องตรวจก่อนใช้)
 * คืน null ถ้าไม่มี JPEG ที่ใช้ได้ (กว้าง ≥ 480px)
 */
async function extractEmbeddedJpeg(buf: Buffer): Promise<Buffer | null> {
  const SOI = Buffer.from([0xff, 0xd8, 0xff])
  const spans: { s: number; e: number }[] = []
  let from = 0
  for (let n = 0; n < 400; n++) {
    const s = buf.indexOf(SOI, from)
    if (s === -1) break
    const e = jpegEndOffset(buf, s)
    if (e > s) { spans.push({ s, e }); from = e }
    else from = s + 3
  }
  spans.sort((a, b) => (b.e - b.s) - (a.e - a.s))
  for (const sp of spans.slice(0, 8)) {
    if (sp.e - sp.s < 2048) break
    const cand = buf.subarray(sp.s, sp.e)
    try {
      const m = await sharp(cand, LENIENT).metadata()
      if ((m.width ?? 0) >= 480) return cand
    } catch {
      // ไม่ใช่ JPEG จริง → ลองช่วงถัดไป
    }
  }
  return null
}

/**
 * เตรียม buffer ให้ sharp เปิดได้ + option ที่ต้องใช้
 *  - RAW ที่รู้จัก (CR3/CR2/RW2) → JPEG ที่ฝัง
 *  - HEIC/HEIF → แปลงเป็น JPEG (pure JS)
 *  - TIFF → เปิดแบบ unlimited (ไฟล์จาก Photoshop ขนาดหลายร้อย MB ชน memory limit ของ libtiff)
 *    ถ้า sharp เปิด TIFF ไม่ได้ = RAW ที่อิง TIFF (ARW/NEF/DNG) → ใช้ JPEG ที่ฝังแทน
 */
async function prepareInput(input: Buffer): Promise<{ buf: Buffer; opts: sharp.SharpOptions }> {
  let buf = input
  if (buf.length === 0) throw new Error('ไฟล์ว่าง (0 bytes)')

  if (isRawBuffer(buf)) {
    const embedded = await extractEmbeddedJpeg(buf)
    if (!embedded) throw new Error('RAW file has no usable embedded JPEG preview')
    return { buf: embedded, opts: LENIENT }
  }

  if (isHeicBuffer(buf)) {
    const heicConvert = (await import('heic-convert')).default
    const ab = await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.9 })
    buf = Buffer.from(ab)
    return { buf, opts: LENIENT }
  }

  if (isTiffBuffer(buf)) {
    const opts: sharp.SharpOptions = { ...LENIENT, unlimited: true }
    try {
      await sharp(buf, opts).metadata()
      return { buf, opts }
    } catch (e) {
      const embedded = await extractEmbeddedJpeg(buf)
      if (embedded) return { buf: embedded, opts: LENIENT }
      throw e
    }
  }

  return { buf, opts: LENIENT }
}

/**
 * แปลงรูปทุกฟอร์แมต (JPG/PNG/WEBP/TIFF/HEIC/RAW) → JPEG Buffer
 *
 * @param maxSize  0 = ไม่ resize, >0 = จำกัด px longest side
 * @param maxBytes 0 = ไม่จำกัด, >0 = บีบจนต่ำกว่า bytes ที่กำหนด (โหมดส่ง Rekognition)
 *
 * กลยุทธ์ (เรียงจากเร็วไปช้า):
 * 1. เตรียม input (RAW/HEIC/TIFF) → ให้ sharp เปิดได้
 * 2. ไม่มี constraint → rotate + JPEG เท่านั้น (เร็วสุด)
 * 3. maxSize เท่านั้น → resize + JPEG (เช่น image proxy)
 * 4. maxBytes → จำกัดด้านยาว ≤ 4096 (ลิมิต AWS) แล้วลองแบบไม่ย่อเพิ่ม ถ้ายังใหญ่เกินค่อยย่อลงซ้ำ
 */
export async function toJpegBuffer(
  input: Buffer,
  maxSize = 0,
  maxBytes = 0,
  quality = 85,   // คุณภาพ JPEG (ใช้เมื่อไม่มี maxBytes)
): Promise<Buffer> {
  const { buf, opts } = await prepareInput(input)
  const open = () => sharp(buf, opts).rotate()

  // ── ไม่มี constraint → เร็วสุด: แค่ rotate + convert ──────────────
  if (maxSize === 0 && maxBytes === 0) {
    return open().jpeg({ quality }).toBuffer()
  }

  // ── มีแค่ maxSize (เช่น image proxy /api/image) ─────────────────────
  if (maxSize > 0 && maxBytes === 0) {
    return open()
      .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer()
  }

  // ── มี maxBytes (ส่งให้ AWS Rekognition) ────────────────────────────
  // Step 1: จำกัดด้านยาว ≤ AWS_MAX_DIM (AWS ปฏิเสธรูปใหญ่มาก เช่น พาโนรามา/ไฟล์กราฟิก)
  //         แล้วลองแบบไม่ย่อเพิ่มก่อน (เส้นทางที่เร็วและเกิดบ่อยสุด)
  const capDim = maxSize > 0 ? Math.min(maxSize, AWS_MAX_DIM) : AWS_MAX_DIM
  const full = await open()
    .resize(capDim, capDim, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer()
  if (full.length <= maxBytes) {
    return full
  }

  // Step 2: ใหญ่เกิน → resize แล้วลด quality จนพอ
  const dimension = maxSize > 0 ? Math.min(maxSize, 1920) : 1920
  let q = 80
  let result = full

  while (q >= 40) {
    result = await open()
      .resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: q })
      .toBuffer()
    if (result.length <= maxBytes) return result
    q -= 10
  }

  // Step 3: fallback สุดท้าย → บีบให้เล็กลงอีก
  return open()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 60 })
    .toBuffer()
}
