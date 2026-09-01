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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "dist", "public");
const indexHtml = path.join(publicDir, "index.html");

if (!fs.existsSync(indexHtml)) {
  console.error(`Build output missing at ${indexHtml}. Run \`npm run build\` first.`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "kennion.json"), "utf8"));

// The census export carries a grand-total row alongside the real groups; it has
// no plans, members or rates and is not a client.
const groups = data.groups.filter((g) => (g.plans || []).length > 0);

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
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "hunter@kennion.com").trim().toLowerCase();
const ADMIN_CODE = String(process.env.ADMIN_CODE || "87878787").trim();
const byCode = new Map();
groups.forEach((g) => {
  g.code = codeFor(g.name);
  byCode.set(g.code, g);
});

/** Rate administration needs names, plans and rates — never member records. */
const adminGroups = groups.map((g) => ({
  name: g.name,
  code: g.code,
  tpa: g.tpa,
  enrolled: g.enrolled,
  lives: g.lives,
  plans: g.plans,
  rates: g.rates,
}));

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
    splits: data.splits[g.name] ? { [g.name]: data.splits[g.name] } : {},
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
app.listen(port, "0.0.0.0", () => {
  console.log(`Kennion renewal portal listening on :${port} — ${groups.length} groups`);
});
