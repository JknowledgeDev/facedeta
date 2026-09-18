/**
 * โซนของรูปในระบบ — แยกขาดจากกันทุกชั้น (ตาราง / คลังใบหน้า AWS / bucket)
 *  - public  : รูปงานอีเวนต์ ผู้ปกครองค้นหา/ดูได้ทุกคน
 *  - private : รูปจาก Drive บัญชีส่วนตัว เห็นได้เฉพาะเมื่อใส่รหัสผู้ดูแล (ตรวจฝั่ง server)
 */
export type Zone = 'public' | 'private'

export function parseZone(v: unknown): Zone {
  return v === 'private' ? 'private' : 'public'
}
