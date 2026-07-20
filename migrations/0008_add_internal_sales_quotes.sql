-- Internal sales bulk proposals.
-- A new admin-driven path mints groups on behalf of prospects and shares
-- a public link (/q/:token) to the same cockpit. Customer self-service
-- flow is unchanged: those rows keep userId NOT NULL semantics in
-- application code, default source='self_service', and never get a
-- public token.

ALTER TABLE groups ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS created_by_admin_id VARCHAR REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS source              TEXT NOT NULL DEFAULT 'self_service',
  ADD COLUMN IF NOT EXISTS public_token        TEXT,
  ADD COLUMN IF NOT EXISTS first_viewed_at     TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_viewed_at      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS view_count          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_accepted_at  TIMESTAMP;

-- Partial unique: a NULL token doesn't collide with other NULLs.
CREATE UNIQUE INDEX IF NOT EXISTS groups_public_token_uq
  ON groups (public_token) WHERE public_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS groups_source_idx ON groups (source);
