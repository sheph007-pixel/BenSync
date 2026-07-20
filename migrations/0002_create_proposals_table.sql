CREATE TABLE IF NOT EXISTS proposals (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id VARCHAR NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  pdf_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  rates_data JSONB,
  status TEXT NOT NULL DEFAULT 'generated',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
