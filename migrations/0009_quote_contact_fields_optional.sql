-- Internal-sales quotes can be created without contact info up-front
-- so reps can crank quotes fast and let the prospect fill in their
-- own details via the Accept modal. Self-service customer rows are
-- unaffected: /api/groups/confirm always populates these from the
-- logged-in user's profile (which carries NOT NULL fullName + email).

ALTER TABLE groups ALTER COLUMN contact_name  DROP NOT NULL;
ALTER TABLE groups ALTER COLUMN contact_email DROP NOT NULL;
