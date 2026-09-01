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
import { parseEnStream } from "./en-parse.js";
import { createDb } from "./db.js";
import { assignCodes, sizeFor } from "./group-id.js";
import { eligibilityOf } from "./eligibility.js";

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

/**
 * Postgres, when DATABASE_URL is set, is the source of truth for everything a
 * human enters: imported groups, their splits, and hand-keyed rates. The JSON
 * file remains as the fallback for a deployment without a database.
 */
const db = createDb(process.env.DATABASE_URL);
let overrides = {};
/** Staff-set company IDs and ALE buckets, keyed by group name. */
let meta = {};
/** When each group's data last came in from an export. */
let importedAt = {};
let recentImports = [];

function saveImports() {
  if (db) return; // Postgres holds it; no file to write.
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(IMPORTS_FILE, JSON.stringify(imported, null, 2));
}

/** Overrides for one group, in the `group||plan||tier` shape the client uses. */
function overridesFor(name) {
  const out = {};
  const prefix = name + "||";
  for (const [k, v] of Object.entries(overrides)) if (k.startsWith(prefix)) out[k] = v;
  return out;
}

// The census export carries a grand-total row alongside the real groups; it has
// no plans, members or rates and is not a client — filtered in rebuild().

/** Superseded scheme, still accepted so codes already sent out keep working. */
function legacyCodeFor(name) {
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

  // Derive a code for every group, then let any staff-assigned one win. Derived
  // codes are computed over the whole roster so they stay collision-free.
  const derived = assignCodes(groups.map((g) => g.name));
  const claimed = new Set(
    Object.values(meta).map((m) => m && m.companyId).filter(Boolean),
  );

  byCode = new Map();
  groups.forEach((g) => {
    const m = meta[g.name] || {};
    // Hand-edited details win over whatever the export supplied, so a
    // correction survives the next import.
    Object.entries(m.fields || {}).forEach(([k, v]) => {
      if (v != null && v !== "") g[k] = v;
    });
    g.archived = !!m.archived;
    // Program eligibility: EBPA, HealthEZ or BCBS of Alabama, with enrollment.
    const el = eligibilityOf(g);
    g.eligible = el.eligible;
    g.programs = el.programs;
    g.carriersSeen = el.carriers;
    let code = m.companyId || derived.get(g.name);
    // A derived code must not shadow one a human assigned to another group.
    if (!m.companyId && claimed.has(code)) code = code.slice(0, 3) + "9" + code.slice(4);
    g.code = code;
    g.sizeCategory = m.sizeCategory || sizeFor(g.enrolled);
    // Archived, or not on a program carrier: the row stays for staff, but the
    // code is refused at sign-in.
    if (!g.archived && g.eligible) {
      byCode.set(code.toUpperCase(), g);
      byCode.set(legacyCodeFor(g.name).toUpperCase(), g);
    }
  });

  adminGroups = groups.map((g) => ({
    name: g.name,
    code: g.code,
    sizeCategory: g.sizeCategory,
    sizeIsSet: !!(meta[g.name] || {}).sizeCategory,
    codeIsSet: !!(meta[g.name] || {}).companyId,
    address1: g.address1 || null,
    city: g.city || null,
    state: g.state || null,
    zip: g.zip || null,
    sic: g.sic || null,
    sicDesc: g.sicDesc || null,
    taxId: g.taxId || null,
    phone: g.phone || null,
    contacts: g.contacts || [],
    tpa: g.tpa,
    enrolled: g.enrolled,
    lives: g.lives,
    plans: g.plans,
    rates: g.rates,
    imported: !!(imported.groups || {})[g.name],
    importedAt: importedAt[g.name] || null,
    archived: !!g.archived,
    eligible: !!g.eligible,
    programs: g.programs || [],
    carriersSeen: g.carriersSeen || [],
    corporationType: g.corporationType || null,
    situsState: g.situsState || null,
    editedFields: Object.keys((meta[g.name] || {}).fields || {}),
    pyStart: g.pyStart || null,
    pyEnd: g.pyEnd || null,
    members: undefined,
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

function mintSession(email) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, { exp: Date.now() + SESSION_MS, email });
  return token;
}
function requireStaff(req, res, next) {
  const t = (req.get("authorization") || "").replace(/^Bearer /i, "").trim();
  const s = sessions.get(t);
  if (!s || s.exp < Date.now()) {
    sessions.delete(t);
    return res.status(401).json({ error: "sign in again" });
  }
  req.staffEmail = s.email;
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
      token: mintSession(email),
      durable: !!db || DURABLE,
      storage: db ? "postgres" : DURABLE ? "volume" : "ephemeral",
      overrides,
      imports: recentImports,
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
    overrides: overridesFor(g.name),
  });
});

/**
 * Read an upload. The request body is streamed straight into the parser rather
 * than buffered, because a full Data API export runs to hundreds of megabytes
 * and holding one in memory is what broke the first version of this.
 */
async function readUpload(req) {
  return parseEnStream(req);
}

const summarise = (parsed) => {
  const g = parsed.group;
  const current = groups.find((x) => x.name === g.name) || null;
  return {
    name: g.name,
    enIdentifier: g.enIdentifier,
    tpa: g.tpa,
    pyStart: g.pyStart,
    pyEnd: g.pyEnd,
    enrolled: g.enrolled,
    lives: g.lives,
    monthly: g.monthly,
    plans: g.plans,
    hasSplit: !!parsed.split,
    stats: parsed.stats,
    isNew: !current,
    current: current && {
      enrolled: current.enrolled,
      lives: current.lives,
      monthly: (current.plans || []).reduce((s, p) => s + (p.monthly || 0), 0),
      plans: (current.plans || []).length,
    },
  };
};

/** Preview: parse and report what would change. Saves nothing. */
app.post("/api/admin/import/preview", requireStaff, async (req, res) => {
  try {
    const { companies, failures } = await readUpload(req);
    res.json({
      companies: companies.map(summarise),
      failures,
      totalEnrolled: companies.reduce((n, c) => n + c.group.enrolled, 0),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** Apply. `only` (a list of company names) limits which are written. */
app.post("/api/admin/import", requireStaff, async (req, res) => {
  const only = String(req.query.only || "").trim();
  const wanted = only ? new Set(only.split("\n").filter(Boolean)) : null;
  try {
    const { companies, failures } = await readUpload(req);
    imported.groups = imported.groups || {};
    imported.splits = imported.splits || {};
    const applied = [];
    for (const parsed of companies) {
      const g = parsed.group;
      if (wanted && !wanted.has(g.name)) continue;
      // The export has the SIC code but not its description, so carry that
      // across from the census rather than losing it on import.
      const prior = groups.find((x) => x.name === g.name);
      if (prior && prior.sicDesc && !g.sicDesc) g.sicDesc = prior.sicDesc;
      imported.groups[g.name] = g;
      if (parsed.split) imported.splits[g.name] = parsed.split;
      if (db) await db.saveGroup(g, parsed.split, req.staffEmail || null);
      applied.push({ name: g.name, enrolled: g.enrolled, monthly: g.monthly });
    }
    if (!applied.length) return res.status(400).json({ error: "Nothing selected to import." });
    saveImports();

    if (db) {
      const at = await db.logImport(
        String(req.query.filename || "").slice(0, 200) || null,
        req.staffEmail || null,
        companies.length,
        applied.length,
        applied.map((a) => a.name),
      );
      applied.forEach((a) => {
        importedAt[a.name] = at;
      });
      recentImports = await db.recentImports();
    }
    rebuild();

    res.json({
      ok: true,
      durable: !!db || DURABLE,
      storage: db ? "postgres" : DURABLE ? "volume" : "ephemeral",
      imports: recentImports,
      applied,
      skipped: failures,
      groups: adminGroups,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** Set a group's access code or ALE bucket. */
/** Company details a human may correct. Name is excluded on purpose: it is the
 *  key an import matches on, so renaming would orphan the group. */
const EDITABLE_FIELDS = new Set([
  "address1", "city", "state", "zip", "sic", "sicDesc",
  "taxId", "phone", "corporationType", "situsState",
]);

app.post("/api/admin/group-meta", requireStaff, express.json({ limit: "16kb" }), async (req, res) => {
  const { group, field, value } = req.body || {};
  const isCompanyField = EDITABLE_FIELDS.has(field);
  if (!group || !(["companyId", "sizeCategory", "archived"].includes(field) || isCompanyField)) {
    return res.status(400).json({ error: "group and a valid field are required" });
  }
  if (!groups.some((g) => g.name === group)) {
    return res.status(404).json({ error: "no such group" });
  }

  if (isCompanyField) {
    const v = value == null ? null : String(value).trim();
    meta[group] = { ...(meta[group] || {}), fields: { ...((meta[group] || {}).fields || {}), [field]: v } };
    try {
      if (db) await db.setField(group, field, v, req.staffEmail || null);
    } catch (e) {
      return res.status(500).json({ error: "Could not save: " + e.message });
    }
    rebuild();
    return res.json({ ok: true, groups: adminGroups });
  }

  if (field === "archived") {
    meta[group] = { ...(meta[group] || {}), archived: !!value };
    try {
      if (db) await db.setMeta(group, "archived", !!value, req.staffEmail || null);
    } catch (e) {
      return res.status(500).json({ error: "Could not save: " + e.message });
    }
    rebuild();
    return res.json({ ok: true, groups: adminGroups });
  }

  let clean = value == null || value === "" ? null : String(value).trim();

  if (field === "companyId" && clean) {
    clean = clean.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length < 4) return res.status(400).json({ error: "Code must be at least 4 characters." });
    const holder = byCode.get(clean);
    if (holder && holder.name !== group) {
      return res.status(409).json({ error: `${clean} is already used by ${holder.name}.` });
    }
  }
  if (field === "sizeCategory" && clean && !["2-50", "51+"].includes(clean)) {
    return res.status(400).json({ error: "Size must be 2-50 or 51+." });
  }

  meta[group] = { ...(meta[group] || {}), [field]: clean };
  try {
    if (db) await db.setMeta(group, field, clean, req.staffEmail || null);
  } catch (e) {
    return res.status(500).json({ error: "Could not save: " + e.message });
  }
  rebuild();
  res.json({ ok: true, groups: adminGroups });
});

/** Persist one hand-keyed rate. Shared across the team, not per-browser. */
app.post("/api/admin/override", requireStaff, express.json({ limit: "16kb" }), async (req, res) => {
  const { group, plan, censusTier, rate } = req.body || {};
  if (!group || !plan || !censusTier) {
    return res.status(400).json({ error: "group, plan and censusTier are required" });
  }
  const key = `${group}||${plan}||${censusTier}`;
  const clean = rate === "" || rate == null ? null : Number(String(rate).replace(/[^0-9.]/g, ""));
  if (clean != null && !isFinite(clean)) return res.status(400).json({ error: "rate must be a number" });

  if (clean == null) delete overrides[key];
  else overrides[key] = String(clean);

  try {
    if (db) await db.setOverride(group, plan, censusTier, clean, req.staffEmail || null);
  } catch (e) {
    return res.status(500).json({ error: "Could not save: " + e.message });
  }
  res.json({ ok: true, key, rate: clean });
});

app.use(
  "/assets",
  express.static(path.join(publicDir, "assets"), { maxAge: "1y", immutable: true }),
);
app.use(express.static(publicDir, { index: false, maxAge: "1h" }));

// SPA fallback — the portal owns every non-API route.
app.use((_req, res) => res.sendFile(indexHtml));

// Errors on API routes must stay JSON; the default handler returns an HTML
// stack trace, which the client could only report as "could not read that file".
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  const msg =
    status === 413
      ? "That file is larger than the server accepts."
      : err.message || "Server error";
  if (req.path.startsWith("/api/")) return res.status(status).json({ error: msg });
  return res.status(status).type("text/plain").send(msg);
});

const port = Number(process.env.PORT) || 5000;
async function boot() {
  if (db) {
    try {
      await db.init();
      const state = await db.load();
      imported = { groups: state.groups, splits: state.splits };
      overrides = state.overrides;
      meta = state.meta || {};
      importedAt = state.importedAt || {};
      recentImports = await db.recentImports();
      const st = await db.stats();
      console.log(`postgres connected — ${st.groups} imported groups, ${st.overrides} rate overrides`);
    } catch (e) {
      // A database that is configured but unreachable must not take the site
      // down; fall back to the shipped census and say so loudly.
      console.error("postgres unavailable, serving the shipped census only:", e.message);
    }
  }
  rebuild();
}

await boot();

app.listen(port, "0.0.0.0", () => {
  const n = Object.keys(imported.groups || {}).length;
  const store = db ? "postgres" : DURABLE ? "volume" : "ephemeral disk";
  console.log(
    `Kennion renewal portal listening on :${port} — ${groups.length} groups, ` +
      `${n} imported, storage: ${store}`,
  );
});
