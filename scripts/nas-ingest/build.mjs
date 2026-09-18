// รวมโค้ด ingest + lib เป็นไฟล์เดียว (nas-ingest-dist/nas-ingest.mjs) พร้อมไฟล์ deploy สำหรับ NAS
//   npm run build:nas
import { build } from 'esbuild'
import fs from 'fs'
import path from 'path'

const OUT = 'nas-ingest-dist'
fs.mkdirSync(OUT, { recursive: true })

await build({
  entryPoints: ['scripts/nas-ingest/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',          // sharp/heic-convert/aws/supabase ติดตั้งบน NAS ด้วย npm install
  tsconfig: 'tsconfig.json',     // ให้ @/lib/* resolve ได้
  outfile: path.join(OUT, 'nas-ingest.mjs'),
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
})

for (const f of fs.readdirSync('scripts/nas-ingest/deploy')) {
  fs.copyFileSync(path.join('scripts/nas-ingest/deploy', f), path.join(OUT, f))
}
console.log(`\nพร้อมใช้: โฟลเดอร์ ${OUT}/ (อัพโหลดทั้งโฟลเดอร์ขึ้น NAS ตาม README-TH.md)`)
