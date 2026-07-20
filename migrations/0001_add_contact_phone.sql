-- Add contact_phone column to groups table
ALTER TABLE groups ADD COLUMN IF NOT EXISTS contact_phone TEXT;
