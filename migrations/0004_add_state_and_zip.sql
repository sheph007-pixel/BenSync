-- Add state + zip_code columns to users and groups tables.
-- These were introduced with the signup/new-group address capture flow
-- (commit b9c5157). The schema change never shipped a migration, so the
-- live database is missing the columns and every login/group query that
-- SELECT *'s from these tables fails with "column state does not exist".
ALTER TABLE users  ADD COLUMN IF NOT EXISTS state    TEXT;
ALTER TABLE users  ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS state    TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS zip_code TEXT;
