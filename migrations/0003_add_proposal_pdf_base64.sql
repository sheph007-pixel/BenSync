-- Add pdf_base64 column to proposals table for inline PDF storage
-- This lets us ship generated proposal PDFs back to the client without
-- relying on a filesystem path that won't persist on Railway restarts.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pdf_base64 TEXT;
