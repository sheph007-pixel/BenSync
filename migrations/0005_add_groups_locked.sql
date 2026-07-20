-- Add locked column to groups table.
-- Introduced with the admin Lock/Unlock row actions (commit be0c926) but
-- never shipped a migration, so the live DB is missing the column and
-- any SELECT */DELETE on groups from admin endpoints fails with
-- "column \"locked\" does not exist" (breaks user delete, group delete,
-- admin groups list, etc.).
ALTER TABLE groups ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;
