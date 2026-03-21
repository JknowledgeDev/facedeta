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

-- Table: เก็บ log การค้นหา
CREATE TABLE IF NOT EXISTS search_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  searched_at TIMESTAMPTZ DEFAULT NOW(),
  match_count INT DEFAULT 0,
  threshold FLOAT DEFAULT 80
);

-- View: สรุปสถิติ
CREATE OR REPLACE VIEW stats AS
SELECT
  (SELECT COUNT(*) FROM face_index) AS total_faces_indexed,
  (SELECT COUNT(DISTINCT drive_file_id) FROM face_index) AS total_photos,
  (SELECT COUNT(DISTINCT event_name) FROM face_index WHERE event_name IS NOT NULL) AS total_events,
  (SELECT COUNT(*) FROM search_log) AS total_searches;
