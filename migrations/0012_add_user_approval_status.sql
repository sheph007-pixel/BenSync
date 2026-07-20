-- Adds manual gatekeeper-approval columns to the users table.
--
-- New signups land in approval_status='pending' and cannot log in until
-- Hunter clicks the one-click Approve link in the email sent on register.
-- Existing rows default to 'approved' so anyone who already registered
-- (including admin@kennion.com) keeps full access immediately after this
-- migration applies.
--
-- The approval_token + expiry are used by the GET /api/auth/approve/:token
-- and /reject/:token endpoints; both are nulled out once a decision is
-- recorded.

ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_token text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_token_expiry timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at timestamp;
