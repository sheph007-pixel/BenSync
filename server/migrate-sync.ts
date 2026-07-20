import type { Express, Request, Response } from "express";
import { pool } from "./db";

// Temporary, admin-only data import used by the one-time migration of
// the old system's data into this database. Accepts row chunks and
// inserts them verbatim, preserving ids so foreign keys stay intact.
// Remove this file and its registration in server/index.ts once the
// migration is confirmed complete.

const TABLES = ["users", "groups", "census_entries", "proposals", "risk_screens"];
const COLUMN_RE = /^[a-z0-9_]+$/;

async function isAdmin(req: Request): Promise<boolean> {
  const userId = (req.session as any)?.userId;
  if (!userId) return false;
  const r = await pool.query("SELECT role FROM users WHERE id = $1", [userId]);
  return r.rows[0]?.role === "admin";
}

export function registerMigrateImport(app: Express) {
  app.post("/api/admin/migrate-import", async (req: Request, res: Response) => {
    try {
      if (!(await isAdmin(req))) {
        return res.status(401).json({ ok: false, message: "Admin access required" });
      }
      const { table, rows } = (req.body ?? {}) as {
        table?: string;
        rows?: Record<string, unknown>[];
      };
      if (!table || !TABLES.includes(table)) {
        return res.status(400).json({ ok: false, message: "Unknown table" });
      }
      if (!Array.isArray(rows)) {
        return res.status(400).json({ ok: false, message: "rows must be an array" });
      }
      if (rows.length === 0) {
        return res.json({ ok: true, table, received: 0, inserted: 0 });
      }

      if (table === "users") {
        // The fresh database seeded its own admin with a different id but
        // the same email. Clear email collisions so the incoming rows,
        // which the rest of the data references by id, win. This also
        // ends the current session; the caller logs in again afterwards.
        const emails = rows.map((r) => r.email).filter(Boolean);
        const ids = rows.map((r) => r.id).filter(Boolean);
        await pool.query(
          "DELETE FROM users WHERE email = ANY($1::text[]) AND NOT (id = ANY($2::varchar[]))",
          [emails, ids],
        );
      }

      let inserted = 0;
      for (const row of rows) {
        const cols = Object.keys(row).filter((c) => COLUMN_RE.test(c));
        if (cols.length === 0) continue;
        const vals = cols.map((c) => {
          const v = row[c];
          // jsonb payloads arrive as objects or arrays; stringify so the
          // driver does not misread arrays as Postgres array literals.
          return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
        });
        const colSql = cols.map((c) => `"${c}"`).join(", ");
        const params = cols.map((_, i) => `$${i + 1}`).join(", ");
        const r = await pool.query(
          `INSERT INTO ${table} (${colSql}) VALUES (${params}) ON CONFLICT (id) DO NOTHING`,
          vals,
        );
        inserted += r.rowCount ?? 0;
      }
      return res.json({ ok: true, table, received: rows.length, inserted });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message ?? "import failed" });
    }
  });
}
