-- Kennion Risk Screen (KRS) — persistence table.
-- Stores deterministic group risk scores + the rendered PDF report.

CREATE TABLE IF NOT EXISTS risk_screens (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        VARCHAR NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  model_version   VARCHAR NOT NULL,
  model_hash      VARCHAR NOT NULL,
  kri             REAL    NOT NULL,
  tier            TEXT    NOT NULL,
  decision        TEXT    NOT NULL,
  result_json     JSONB   NOT NULL,
  pdf_base64      TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS risk_screens_group_idx   ON risk_screens(group_id);
CREATE INDEX IF NOT EXISTS risk_screens_created_idx ON risk_screens(created_at DESC);
