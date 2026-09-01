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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  name            text PRIMARY KEY,
  en_identifier   text,
  access_code     text,
  payload         jsonb NOT NULL,
  split           jsonb,
  source          text NOT NULL DEFAULT 'import',
  imported_at     timestamptz NOT NULL DEFAULT now(),
  imported_by     text
);
CREATE INDEX IF NOT EXISTS groups_access_code_idx ON groups (access_code);

CREATE TABLE IF NOT EXISTS rate_overrides (
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
        "SELECT name, payload, split FROM groups ORDER BY name",
      );
      for (const r of rows) {
        groups[r.name] = r.payload;
        if (r.split) splits[r.name] = r.split;
      }

      const overrides = {};
      const ov = await pool.query(
        "SELECT group_name, plan, census_tier, rate FROM rate_overrides",
      );
      for (const r of ov.rows) {
        overrides[`${r.group_name}||${r.plan}||${r.census_tier}`] = String(r.rate);
      }
      return { groups, splits, overrides };
    },

    /** One imported group. Re-importing the same group replaces it. */
    async saveGroup(group, split, by) {
      await pool.query(
        `INSERT INTO groups (name, en_identifier, access_code, payload, split, imported_by)
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

    async setOverride(groupName, plan, censusTier, rate, by) {
      if (rate == null || rate === "") {
        await pool.query(
          "DELETE FROM rate_overrides WHERE group_name=$1 AND plan=$2 AND census_tier=$3",
          [groupName, plan, censusTier],
        );
        return;
      }
      await pool.query(
        `INSERT INTO rate_overrides (group_name, plan, census_tier, rate, updated_by)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (group_name, plan, census_tier) DO UPDATE SET
           rate = EXCLUDED.rate, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [groupName, plan, censusTier, rate, by || null],
      );
    },

    async stats() {
      const g = await pool.query("SELECT count(*)::int n FROM groups");
      const o = await pool.query("SELECT count(*)::int n FROM rate_overrides");
      return { groups: g.rows[0].n, overrides: o.rows[0].n };
    },

    async close() {
      await pool.end();
    },
  };
}
