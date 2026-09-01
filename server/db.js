// Postgres storage for imported groups and hand-keyed rates.
//
// Optional by design: with no DATABASE_URL the portal runs exactly as before,
// serving the shipped census and keeping imports in a JSON file. That keeps a
// missing or misconfigured database from taking the site down.
//
// Where a database IS configured it is the source of truth for everything a
// human has entered — imported groups, their contribution splits, and rate
// overrides — so it survives redeploys and is shared across the team rather
// than living in one browser.
import pg from "pg";

// Everything lives in its own `kennion` schema. The database may already carry
// tables from a previous application — the first import failed because a
// legacy `public.groups` existed with a different shape, so CREATE TABLE IF NOT
// EXISTS silently did nothing and the insert hit the wrong columns. A dedicated
// schema cannot collide, and leaves anything already in `public` untouched.
const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS kennion;

CREATE TABLE IF NOT EXISTS kennion.groups (
  name            text PRIMARY KEY,
  en_identifier   text,
  access_code     text,
  payload         jsonb NOT NULL,
  split           jsonb,
  source          text NOT NULL DEFAULT 'import',
  imported_at     timestamptz NOT NULL DEFAULT now(),
  imported_by     text
);
CREATE INDEX IF NOT EXISTS groups_access_code_idx ON kennion.groups (access_code);

-- Editable identity for every group, imported or straight from the census:
-- the access code staff assign, and the ALE bucket, which is a judgement they
-- make rather than something the enrollment count can settle on its own.
CREATE TABLE IF NOT EXISTS kennion.group_meta (
  group_name     text PRIMARY KEY,
  company_id     text UNIQUE,
  size_category  text CHECK (size_category IN ('2-50','51+')),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  updated_by     text
);

CREATE TABLE IF NOT EXISTS kennion.rate_overrides (
  group_name   text NOT NULL,
  plan         text NOT NULL,
  census_tier  text NOT NULL,
  rate         numeric(12,2) NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text,
  PRIMARY KEY (group_name, plan, census_tier)
);
`;

export function createDb(url) {
  if (!url) return null;

  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Railway's internal Postgres presents a self-signed certificate.
    ssl: /\bsslmode=disable\b/.test(url) || /localhost|127\.0\.0\.1/.test(url)
      ? false
      : { rejectUnauthorized: false },
  });

  pool.on("error", (e) => console.error("postgres pool error:", e.message));

  return {
    async init() {
      await pool.query(SCHEMA);
    },

    /** Everything a human has entered, as the overlay the server applies. */
    async load() {
      const groups = {};
      const splits = {};
      const { rows } = await pool.query(
        "SELECT name, payload, split FROM kennion.groups ORDER BY name",
      );
      for (const r of rows) {
        groups[r.name] = r.payload;
        if (r.split) splits[r.name] = r.split;
      }

      const meta = {};
      const mrows = await pool.query(
        "SELECT group_name, company_id, size_category FROM kennion.group_meta",
      );
      for (const r of mrows.rows) {
        meta[r.group_name] = { companyId: r.company_id, sizeCategory: r.size_category };
      }

      const overrides = {};
      const ov = await pool.query(
        "SELECT group_name, plan, census_tier, rate FROM kennion.rate_overrides",
      );
      for (const r of ov.rows) {
        overrides[`${r.group_name}||${r.plan}||${r.census_tier}`] = String(r.rate);
      }
      return { groups, splits, overrides, meta };
    },

    /** One imported group. Re-importing the same group replaces it. */
    async saveGroup(group, split, by) {
      await pool.query(
        `INSERT INTO kennion.groups (name, en_identifier, access_code, payload, split, imported_by)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (name) DO UPDATE SET
           en_identifier = EXCLUDED.en_identifier,
           access_code   = EXCLUDED.access_code,
           payload       = EXCLUDED.payload,
           split         = EXCLUDED.split,
           imported_at   = now(),
           imported_by   = EXCLUDED.imported_by`,
        [group.name, group.enIdentifier || null, group.code || null, group, split || null, by || null],
      );
    },

    /** Staff edit to a group's code or ALE bucket. */
    async setMeta(groupName, field, value, by) {
      const col = field === "companyId" ? "company_id" : "size_category";
      await pool.query(
        `INSERT INTO kennion.group_meta (group_name, ${col}, updated_by)
         VALUES ($1,$2,$3)
         ON CONFLICT (group_name) DO UPDATE SET
           ${col} = EXCLUDED.${col}, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [groupName, value || null, by || null],
      );
    },

    async setOverride(groupName, plan, censusTier, rate, by) {
      if (rate == null || rate === "") {
        await pool.query(
          "DELETE FROM kennion.rate_overrides WHERE group_name=$1 AND plan=$2 AND census_tier=$3",
          [groupName, plan, censusTier],
        );
        return;
      }
      await pool.query(
        `INSERT INTO kennion.rate_overrides (group_name, plan, census_tier, rate, updated_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (group_name, plan, census_tier) DO UPDATE SET
           rate = EXCLUDED.rate, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [groupName, plan, censusTier, rate, by || null],
      );
    },

    async stats() {
      const g = await pool.query("SELECT count(*)::int n FROM kennion.groups");
      const o = await pool.query("SELECT count(*)::int n FROM kennion.rate_overrides");
      return { groups: g.rows[0].n, overrides: o.rows[0].n };
    },

    async close() {
      await pool.end();
    },
  };
}
