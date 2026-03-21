/**
 * Base URL สำหรับ API calls
 * - ถ้ามี NEXT_PUBLIC_API_URL (deploy แยก frontend/backend) → ใช้ URL นั้น
 * - ถ้าไม่มี (รันทั้งคู่บนเครื่องเดียว Next.js) → ใช้ relative path
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}
