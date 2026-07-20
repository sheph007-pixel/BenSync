-- Adds the audit_results jsonb column to the proposals table.
-- Backs the dual-AI Actuary audit: server/ai-audit.ts writes the
-- AuditPair into this column after every successful proposal
-- generation, and the badge UI on the admin cockpit + public quote
-- page reads it for display. NULL on legacy proposals — those show
-- "Audit pending — Run audit" until the admin clicks the button.

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS audit_results jsonb;
