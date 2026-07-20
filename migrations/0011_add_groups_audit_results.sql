-- Adds the audit_results jsonb column to the groups table.
-- The dual-AI Actuary audit (server/ai-audit.ts) was originally
-- attached to the proposals row, but most cockpit views never
-- persist a proposals row — rates are recomputed live by priceGroup.
-- Moving the cache to the group itself means every group's cockpit
-- can show the audit panel and the public /q/:token page can render
-- "Audited 100%" badges without depending on a proposals row.

ALTER TABLE groups ADD COLUMN IF NOT EXISTS audit_results jsonb;
