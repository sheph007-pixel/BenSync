// Server for the Kennion 2027 renewal portal.
//
// The census carries employee names, ages, ZIPs and premiums for 1,318 people,
// so it is never served as a static file. It is loaded here and handed out one
// group at a time, only in exchange for that group's access code. Rate
// Administration gets a separate, PII-free projection.
import express from "express";
import compression from "compression";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { parseEmployeeNavigatorXml } from "./en-parse.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "dist", "public");
const indexHtml = path.join(publicDir, "index.html");

if (!fs.existsSync(indexHtml)) {
  console.error(`Build output missing at ${indexHtml}. Run \`npm run build\` first.`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "kennion.json"), "utf8"));

/**
 * Imported groups are written here, layered over the shipped census.
 *
 * Railway's container filesystem is ephemeral, so point DATA_DIR at a mounted
 * volume to make imports survive a redeploy. Without one, an import lasts until
 * the next deploy and the admin screen says so.
 */
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const IMPORTS_FILE = path.join(DATA_DIR, "imported-groups.json");
const DURABLE = !!process.env.DATA_DIR;

function loadImports() {
  try {
    return JSON.parse(fs.readFileSync(IMPORTS_FILE, "utf8"));
  } catch {
    return { groups: {}, splits: {} };
  }
}
let imported = loadImports();

function saveImports() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(IMPORTS_FILE, JSON.stringify(imported, null, 2));
}

// The census export carries a grand-total row alongside the real groups; it has
// no plans, members or rates and is not a client — filtered in rebuild().

/**
 * Group access code.
 *
 * Interim scheme, pending the Employee Navigator Company Identifiers: derived
 * from the group name. Once the identifier list arrives this becomes a lookup
 * of the identifier and nothing else in the app has to change, because codes
 * are resolved here and never shipped to the browser.
 */
function codeFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 100000;
  const letters = name.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4).padEnd(4, "X");
  return "KEN-" + letters + "-" + String(h).padStart(5, "0").slice(0, 4);
}

// Kennion staff sign-in. Defaults are the credentials Hunter asked for; both
// are overridable by environment variable so the deployed values need not stay
// in a public repository.
let groups = [];
let byCode = new Map();
let adminGroups = [];

function rebuild() {
  const base = data.groups.filter((g) => (g.plans || []).length > 0);
  const merged = new Map(base.map((g) => [g.name, g]));
  // An imported group replaces the census row of the same name outright.
  for (const [name, g] of Object.entries(imported.groups || {})) merged.set(name, g);

  groups = [...merged.values()];
  byCode = new Map();
  groups.forEach((g) => {
    g.code = codeFor(g.name);
    byCode.set(g.code, g);
  });
  adminGroups = groups.map((g) => ({
    name: g.name,
    code: g.code,
    tpa: g.tpa,
    enrolled: g.enrolled,
    lives: g.lives,
    plans: g.plans,
    rates: g.rates,
    imported: !!(imported.groups || {})[g.name],
  }));
}

const splitFor = (name) =>
  (imported.splits || {})[name] || data.splits[name] || null;

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "hunter@kennion.com").trim().toLowerCase();
const ADMIN_CODE = String(process.env.ADMIN_CODE || "87878787").trim();
/**
 * Staff sessions. Import endpoints must not accept the admin code on every
 * call, so signing in mints a short-lived bearer token held in memory.
 * Single-instance by design; a restart signs staff out, which is acceptable
 * for an internal rate desk.
 */
const sessions = new Map();
const SESSION_MS = 8 * 60 * 60 * 1000;

function mintSession() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}
function requireStaff(req, res, next) {
  const t = (req.get("authorization") || "").replace(/^Bearer /i, "").trim();
  const exp = sessions.get(t);
  if (!exp || exp < Date.now()) {
    sessions.delete(t);
    return res.status(401).json({ error: "sign in again" });
  }
  next();
}

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use(express.json({ limit: "256kb" }));

app.get("/healthz", (_req, res) => res.type("text/plain").send("ok"));

app.post("/api/signin", (req, res) => {
  const body = req.body || {};

  // Staff sign-in: email + code. One generic failure for either field, so a
  // wrong guess reveals nothing about which half was right.
  if (body.email != null) {
    const email = String(body.email).trim().toLowerCase();
    const code = String(body.code || "").trim();
    if (email !== ADMIN_EMAIL || code !== ADMIN_CODE) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    return res.json({
      kind: "admin",
      token: mintSession(),
      durable: DURABLE,
      meta: data.meta,
      groups: adminGroups,
      planDesigns: data.planDesigns,
    });
  }

  const code = String(body.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "code required" });

  const g = byCode.get(code);
  if (!g) return res.status(404).json({ error: "no such group" });

  return res.json({
    kind: "group",
    meta: data.meta,
    group: g,
    planDesigns: data.planDesigns,
    // Carrier menu and quoted rates: no personal data, and the 2027 pricing
    // needs the reference rows to scale un-quoted plans.
    uhc: data.uhc,
    // Only this group's contribution split, when Employee Navigator has one.
    splits: splitFor(g.name) ? { [g.name]: splitFor(g.name) } : {},
  });
});

/**
 * Preview an Employee Navigator XML export. Parses and reports what it would
 * change, without touching anything — an import legitimately moves headline
 * numbers (a newer export has different enrollment), so it is shown first.
 */
app.post("/api/admin/import/preview", requireStaff, express.text({ type: "*/*", limit: "60mb" }), (req, res) => {
  let parsed;
  try {
    parsed = parseEmployeeNavigatorXml(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const g = parsed.group;
  const current = groups.find((x) => x.name === g.name) || null;
  res.json({
    group: {
      name: g.name,
      tpa: g.tpa,
      pyStart: g.pyStart,
      pyEnd: g.pyEnd,
      enrolled: g.enrolled,
      lives: g.lives,
      monthly: g.monthly,
      plans: g.plans,
    },
    stats: parsed.stats,
    hasSplit: !!parsed.split,
    current: current && {
      enrolled: current.enrolled,
      lives: current.lives,
      monthly: current.plans.reduce((s, p) => s + (p.monthly || 0), 0),
      plans: current.plans.length,
    },
    isNew: !current,
  });
});

/** Apply a previewed import. Replaces that group outright. */
app.post("/api/admin/import", requireStaff, express.text({ type: "*/*", limit: "60mb" }), (req, res) => {
  let parsed;
  try {
    parsed = parseEmployeeNavigatorXml(req.body);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const g = parsed.group;
  imported.groups = imported.groups || {};
  imported.splits = imported.splits || {};
  imported.groups[g.name] = g;
  if (parsed.split) imported.splits[g.name] = parsed.split;
  try {
    saveImports();
  } catch (e) {
    return res.status(500).json({ error: "Parsed fine, but could not save: " + e.message });
  }
  rebuild();
  const fresh = byCode.get(codeFor(g.name));
  res.json({
    ok: true,
    durable: DURABLE,
    name: g.name,
    code: fresh ? fresh.code : null,
    enrolled: g.enrolled,
    monthly: g.monthly,
    groups: adminGroups,
  });
});

app.use(
  "/assets",
  express.static(path.join(publicDir, "assets"), { maxAge: "1y", immutable: true }),
);
app.use(express.static(publicDir, { index: false, maxAge: "1h" }));

// SPA fallback — the portal owns every non-API route.
app.use((_req, res) => res.sendFile(indexHtml));

const port = Number(process.env.PORT) || 5000;
rebuild();

app.listen(port, "0.0.0.0", () => {
  const n = Object.keys(imported.groups || {}).length;
  console.log(
    `Kennion renewal portal listening on :${port} — ${groups.length} groups` +
      (n ? `, ${n} imported (${DURABLE ? "durable" : "ephemeral: set DATA_DIR to a volume"})` : ""),
  );
});
