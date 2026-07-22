// BenSync Captive Analytics — isolated backend module.
//
// Mounted under /captive (UI) and /api/captive/* (API) on the existing Kennion
// Express app. It reuses the app's Postgres pool and its session middleware, but
// keeps everything else namespaced under `captive_*` so it cannot affect the
// rate engine, proposals, users, or any existing table. Access is limited to a
// single admin (CAPTIVE_ADMIN_EMAIL, default hunter@kennion.com); the password is
// set either from CAPTIVE_ADMIN_PASSWORD or via a one-time setup screen — never
// committed to the repo.
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "path";
import bcrypt from "bcryptjs";
import { pool } from "../db";
import * as SEED from "./seed-data";

const ADMIN_EMAIL = (process.env.CAPTIVE_ADMIN_EMAIL || "hunter@kennion.com").trim().toLowerCase();
const PERIOD_ID = "2026-05";
const PERIOD_LABEL = "May 2026";
const DEFAULT_THRESHOLDS = { lossPct: 50, minLoss: 0 };

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 12 * 60 * 1000;
const attempts = new Map<string, { count: number; until: number }>();

function seedDataset() {
  return {
    meta: (SEED as any).META,
    fs: (SEED as any).FS,
    yearTotals: (SEED as any).YEAR_TOTALS,
    groups: (SEED as any).GROUPS,
    moves: (SEED as any).MOVES,
    cash: (SEED as any).CASH,
  };
}

/* --------------------------------- init --------------------------------- */

export async function initCaptive() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS captive_users (
      email         TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS captive_periods (
      id           TEXT PRIMARY KEY,
      label        TEXT NOT NULL,
      is_active    BOOLEAN NOT NULL DEFAULT true,
      data         JSONB NOT NULL,
      committed_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS captive_notes (
      id         SERIAL PRIMARY KEY,
      group_code TEXT NOT NULL,
      author     TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS captive_notes_group_idx ON captive_notes (group_code);
    CREATE TABLE IF NOT EXISTS captive_settings (
      key   TEXT PRIMARY KEY,
      value JSONB NOT NULL
    );
  `);

  const seeded = await pool.query("SELECT 1 FROM captive_periods WHERE id=$1", [PERIOD_ID]);
  if (seeded.rowCount === 0) {
    await pool.query(
      "INSERT INTO captive_periods (id, label, is_active, data) VALUES ($1,$2,true,$3)",
      [PERIOD_ID, PERIOD_LABEL, JSON.stringify(seedDataset())]
    );
    console.log("[captive] seeded May 2026 dataset");
  }
  await pool.query(
    "INSERT INTO captive_settings (key, value) VALUES ('thresholds', $1) ON CONFLICT (key) DO NOTHING",
    [JSON.stringify(DEFAULT_THRESHOLDS)]
  );

  // Optional: provision the admin password from an env var. If unset, the
  // one-time /api/captive/setup screen handles it instead.
  const envPw = process.env.CAPTIVE_ADMIN_PASSWORD;
  if (envPw) {
    const existing = await getUser(ADMIN_EMAIL);
    if (!existing || !(await bcrypt.compare(envPw, existing.password_hash))) {
      const hash = await bcrypt.hash(envPw, 12);
      await upsertUser(ADMIN_EMAIL, hash);
      console.log(`[captive] admin provisioned from env for ${ADMIN_EMAIL}`);
    }
  }
  console.log("[captive] initialized");
}

/* ------------------------------- db helpers ----------------------------- */

async function getUser(email: string) {
  const { rows } = await pool.query("SELECT email, password_hash FROM captive_users WHERE email=$1", [email]);
  return rows[0] || null;
}
async function upsertUser(email: string, hash: string) {
  await pool.query(
    `INSERT INTO captive_users (email, password_hash) VALUES ($1,$2)
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
    [email, hash]
  );
}
async function adminExists() {
  const { rows } = await pool.query("SELECT 1 FROM captive_users WHERE email=$1", [ADMIN_EMAIL]);
  return rows.length > 0;
}
async function getActiveDataset() {
  const { rows } = await pool.query(
    "SELECT id, label, data FROM captive_periods WHERE is_active=true ORDER BY id DESC LIMIT 1"
  );
  if (!rows[0]) return null;
  return { periodId: rows[0].id, periodLabel: rows[0].label, ...rows[0].data };
}
async function getThresholds() {
  const { rows } = await pool.query("SELECT value FROM captive_settings WHERE key='thresholds'");
  return rows[0]?.value || { ...DEFAULT_THRESHOLDS };
}
async function setThresholds(v: any) {
  const value = { lossPct: Number(v?.lossPct) || 0, minLoss: Number(v?.minLoss) || 0 };
  await pool.query(
    `INSERT INTO captive_settings (key, value) VALUES ('thresholds', $1)
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`,
    [JSON.stringify(value)]
  );
  return value;
}
function fmtNoteTs(date: Date, author: string) {
  const s = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${s} · ${author}`;
}
async function getNotes() {
  const { rows } = await pool.query(
    "SELECT group_code, author, body, created_at FROM captive_notes ORDER BY created_at ASC"
  );
  const out: Record<string, { ts: string; text: string }[]> = {};
  for (const n of rows) {
    (out[n.group_code] ||= []).push({ ts: fmtNoteTs(new Date(n.created_at), n.author), text: n.body });
  }
  return out;
}
async function addNote(groupCode: string, author: string, body: string) {
  const now = new Date();
  await pool.query("INSERT INTO captive_notes (group_code, author, body) VALUES ($1,$2,$3)", [groupCode, author, body]);
  return { ts: fmtNoteTs(now, author), text: body };
}

/* --------------------------------- auth --------------------------------- */

function lockState(email: string) {
  const a = attempts.get(email);
  if (a && a.until > Date.now()) return { locked: true, minutes: Math.ceil((a.until - Date.now()) / 60000) };
  return { locked: false, minutes: 0 };
}
function requireCaptiveAuth(req: Request, res: Response, next: NextFunction) {
  if ((req.session as any)?.captiveEmail === ADMIN_EMAIL) return next();
  return res.status(401).json({ error: "unauthorized" });
}

/* ------------------------------- routes --------------------------------- */

export function registerCaptiveRoutes(app: Express) {
  const captiveDir =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public", "captive") // dist/public/captive
      : path.resolve(process.cwd(), "client", "public", "captive");

  // --- API ---
  app.get("/api/captive/me", async (req: Request, res: Response) => {
    if ((req.session as any)?.captiveEmail === ADMIN_EMAIL) return res.json({ authed: true, email: ADMIN_EMAIL });
    const exists = await adminExists();
    return res.json({ authed: false, needsSetup: !exists, email: ADMIN_EMAIL });
  });

  app.post("/api/captive/setup", async (req: Request, res: Response) => {
    if (await adminExists()) return res.status(409).json({ ok: false, error: "exists" });
    const password = String((req.body || {}).password || "");
    if (password.length < 8) return res.status(400).json({ ok: false, error: "weak" });
    const hash = await bcrypt.hash(password, 12);
    await upsertUser(ADMIN_EMAIL, hash);
    (req.session as any).captiveEmail = ADMIN_EMAIL;
    req.session.save(() => res.json({ ok: true, email: ADMIN_EMAIL }));
  });

  app.post("/api/captive/login", async (req: Request, res: Response) => {
    const email = String((req.body || {}).email || "").trim().toLowerCase();
    const password = String((req.body || {}).password || "");
    const ls = lockState(email);
    if (ls.locked) return res.status(429).json({ authed: false, locked: true, minutes: ls.minutes });

    const user = email === ADMIN_EMAIL ? await getUser(ADMIN_EMAIL) : null;
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) {
      const a = attempts.get(email) || { count: 0, until: 0 };
      a.count += 1;
      if (a.count >= MAX_ATTEMPTS) { a.until = Date.now() + LOCKOUT_MS; a.count = 0; }
      attempts.set(email, a);
      const after = lockState(email);
      return res.status(after.locked ? 429 : 401).json({ authed: false, locked: after.locked, minutes: after.minutes });
    }
    attempts.delete(email);
    (req.session as any).captiveEmail = ADMIN_EMAIL;
    req.session.save(() => res.json({ authed: true, email: ADMIN_EMAIL }));
  });

  app.post("/api/captive/logout", (req: Request, res: Response) => {
    if (req.session) (req.session as any).captiveEmail = undefined;
    res.json({ ok: true });
  });

  app.get("/api/captive/data", requireCaptiveAuth, async (_req: Request, res: Response) => {
    const [dataset, thresholds, notes] = await Promise.all([getActiveDataset(), getThresholds(), getNotes()]);
    if (!dataset) return res.status(503).json({ error: "no-data" });
    res.json({ ...dataset, thresholds, notes });
  });

  app.get("/api/captive/settings/thresholds", requireCaptiveAuth, async (_req: Request, res: Response) => {
    res.json(await getThresholds());
  });
  app.put("/api/captive/settings/thresholds", requireCaptiveAuth, async (req: Request, res: Response) => {
    res.json(await setThresholds(req.body || {}));
  });

  app.get("/api/captive/notes", requireCaptiveAuth, async (_req: Request, res: Response) => {
    res.json(await getNotes());
  });
  app.post("/api/captive/notes", requireCaptiveAuth, async (req: Request, res: Response) => {
    const { groupCode, text } = req.body || {};
    if (!groupCode || !text || !String(text).trim()) return res.status(400).json({ error: "groupCode and text required" });
    res.json(await addNote(String(groupCode), "you", String(text).trim()));
  });

  // --- Static UI (hidden: noindex) ---
  app.use("/captive", (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    next();
  });
  app.use("/captive", express.static(captiveDir, { index: false, redirect: false, maxAge: "1h" }));
  const shell = (_req: Request, res: Response) => res.sendFile(path.join(captiveDir, "index.html"));
  app.get("/captive", shell);
  app.get("/captive/", shell);

  console.log(`[captive] routes mounted at /captive (assets: ${captiveDir})`);
}
