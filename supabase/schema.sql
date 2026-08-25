-- Run this in Supabase SQL Editor

-- Table: เก็บ mapping ระหว่าง AWS Rekognition faceId กับ Google Drive fileId
CREATE TABLE IF NOT EXISTS face_index (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  face_id TEXT NOT NULL UNIQUE,
  drive_file_id TEXT NOT NULL,
  file_name TEXT,
  event_name TEXT,
  event_date DATE,
  thumbnail_url TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index สำหรับค้นหา faceId เร็วๆ
CREATE INDEX IF NOT EXISTS idx_face_id ON face_index(face_id);
CREATE INDEX IF NOT EXISTS idx_drive_file_id ON face_index(drive_file_id);
CREATE INDEX IF NOT EXISTS idx_event_name ON face_index(event_name);
CREATE INDEX IF NOT EXISTS idx_uploaded_at ON face_index(uploaded_at DESC);

-- Table: เก็บ "ทุกรูป" ที่ sync แล้ว (1 แถว = 1 รูป) แม้รูปนั้นไม่มีใบหน้า
-- ใช้เป็น source of truth ของแกลเลอรี + สถิติจำนวนรูปจริง
CREATE TABLE IF NOT EXISTS photo_index (
  drive_file_id TEXT PRIMARY KEY,
  file_name TEXT,
  event_name TEXT,
  event_date DATE,
  thumbnail_url TEXT,
  has_face BOOLEAN NOT NULL DEFAULT FALSE,   -- ตรวจเจอใบหน้าอย่างน้อย 1 หน้าไหม
  face_count INT NOT NULL DEFAULT 0,         -- จำนวนใบหน้าในรูปนี้
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_event_name ON photo_index(event_name);
CREATE INDEX IF NOT EXISTS idx_photo_event_date ON photo_index(event_date);
CREATE INDEX IF NOT EXISTS idx_photo_uploaded_at ON photo_index(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_photo_has_face ON photo_index(has_face);

-- Backfill: เอารูปที่เคย index ใบหน้าไว้แล้วใน face_index มาลง photo_index
-- (has_face = true เพราะเคยเจอหน้า) — รันครั้งเดียวเวลาอัปเกรด ปลอดภัยถ้ารันซ้ำ
INSERT INTO photo_index (drive_file_id, file_name, event_name, event_date, thumbnail_url, has_face, face_count, uploaded_at)
SELECT
  drive_file_id,
  MAX(file_name),
  MAX(event_name),
  MAX(event_date),
  MAX(thumbnail_url),
  -- แถว face_id 'noface-%' คือ placeholder ภาพบรรยากาศ (ไม่ใช่ใบหน้าจริง)
  COUNT(*) FILTER (WHERE face_id NOT LIKE 'noface-%') > 0,
  COUNT(*) FILTER (WHERE face_id NOT LIKE 'noface-%'),
  MIN(uploaded_at)
FROM face_index
GROUP BY drive_file_id
ON CONFLICT (drive_file_id) DO NOTHING;

-- Table: เก็บ log การค้นหา
CREATE TABLE IF NOT EXISTS search_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  searched_at TIMESTAMPTZ DEFAULT NOW(),
  match_count INT DEFAULT 0,
  threshold FLOAT DEFAULT 80
);

-- View: สรุปสถิติ
-- total_photos = "ทุกรูป" ที่ sync แล้ว (จาก photo_index) รวมรูปที่ไม่มีใบหน้าด้วย
CREATE OR REPLACE VIEW stats AS
SELECT
  (SELECT COUNT(*) FROM face_index WHERE face_id NOT LIKE 'noface-%') AS total_faces_indexed,
  (SELECT COUNT(*) FROM photo_index) AS total_photos,
  (SELECT COUNT(*) FROM photo_index WHERE has_face) AS total_photos_with_face,
  (SELECT COUNT(*) FROM photo_index WHERE NOT has_face) AS total_photos_no_face,
  (SELECT COUNT(DISTINCT event_name) FROM photo_index WHERE event_name IS NOT NULL) AS total_events,
  (SELECT COUNT(*) FROM search_log) AS total_searches;
