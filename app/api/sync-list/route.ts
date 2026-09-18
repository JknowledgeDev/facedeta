import { NextRequest, NextResponse } from 'next/server'
import { listAllImageFiles, listPrivateDriveImages } from '@/lib/drive'
import { getAllFileIds } from '@/lib/supabase'
import { isUnlocked } from '@/lib/auth'
import { parseZone } from '@/lib/zone'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * รายการไฟล์ที่จะ sync
 *  - โซนสาธารณะ: scan ต้นไม้โฟลเดอร์ (รวมทุก subfolder) → id+name
 *  - โซนส่วนตัว (?zone=private, ต้องใส่รหัสแล้ว): กวาดรูป "ทั้งบัญชี" Drive ส่วนตัว
 *      ตัดรูปที่อยู่ในระบบแล้วออก (ทั้งสองโซน — ไม่เก็บซ้ำ ไม่เสียค่า index ซ้ำ)
 *      พร้อมชื่อกิจกรรม/วันที่อัตโนมัติจากโฟลเดอร์ ในรูปแบบย่อ:
 *      { events: string[], files: [id, name, eventIdx, date][] }
 */
export async function GET(req: NextRequest) {
  try {
    const zone = parseZone(req.nextUrl.searchParams.get('zone'))

    if (zone === 'private') {
      if (!isUnlocked(req)) {
        return NextResponse.json({ error: 'กรุณาใส่รหัสผู้ดูแลก่อน' }, { status: 401 })
      }
      const [all, inPublic, inPrivate] = await Promise.all([
        listPrivateDriveImages(),
        getAllFileIds('public'),
        getAllFileIds('private'),
      ])

      const events: string[] = []
      const eventIdx = new Map<string, number>()
      const files: [string, string, number, string][] = []
      let alreadyPublic = 0
      let alreadyPrivate = 0
      for (const f of all) {
        if (inPublic.has(f.id)) { alreadyPublic++; continue }
        if (inPrivate.has(f.id)) { alreadyPrivate++; continue }
        let e = eventIdx.get(f.eventName)
        if (e === undefined) { e = events.length; events.push(f.eventName); eventIdx.set(f.eventName, e) }
        files.push([f.id, f.name, e, f.eventDate])
      }

      return NextResponse.json(
        { zone, events, files, total: files.length, found: all.length, alreadyPublic, alreadyPrivate },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const folderId = req.nextUrl.searchParams.get('folderId') ?? undefined
    const files = await listAllImageFiles(folderId)
    return NextResponse.json({ files, total: files.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
