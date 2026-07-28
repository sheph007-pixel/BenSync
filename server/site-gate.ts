import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Site gate ("firewall") — a site-wide email + PIN lock screen.
//
// When enabled, EVERY request (marketing pages, the React portal, broker
// pages, and the API) is intercepted before it reaches any real handler and
// the visitor is shown a private lock screen. They must enter the correct
// email + PIN to get a signed cookie that unlocks the whole site for a week.
//
// This is deliberately independent of the Postgres-backed express-session
// stack: it runs first, uses a self-contained HMAC-signed cookie, and needs
// no database. That means it keeps working (and keeps the site locked) even
// if the DB is down while you push updates.
//
// Toggle it from Railway without a code change:
//   SITE_LOCK = on  | off      (default: ON — the gate is up)
//   SITE_LOCK_EMAIL = hunter@kennion.com   (override the allowed email)
//   SITE_LOCK_PIN   = 8787                 (override the PIN)
//
// To open the site to the public, set SITE_LOCK=off (or false/0/no) and
// redeploy. To lock it again while you work, set SITE_LOCK=on.
// ---------------------------------------------------------------------------

const COOKIE_NAME = "bensync_gate";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const DEFAULT_EMAIL = "hunter@kennion.com";
const DEFAULT_PIN = "8787";

const UNLOCK_PATH = "/__gate/unlock";
const LOGOUT_PATH = "/__gate/logout";

function isLocked(): boolean {
  const raw = (process.env.SITE_LOCK ?? "on").trim().toLowerCase();
  // Anything falsy explicitly disables the gate; unset or anything else = locked.
  return !["off", "false", "0", "no", "disabled", ""].includes(raw);
}

function allowedEmail(): string {
  return (process.env.SITE_LOCK_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
}

function allowedPin(): string {
  return String(process.env.SITE_LOCK_PIN || DEFAULT_PIN).trim();
}

// Secret binds the cookie signature to the deployment AND the current PIN, so
// rotating SITE_LOCK_PIN instantly invalidates every previously issued cookie.
function signingSecret(): string {
  return `${process.env.SESSION_SECRET || "bensync-gate"}::${allowedPin()}`;
}

function sign(value: string): string {
  return crypto.createHmac("sha256", signingSecret()).update(value).digest("hex");
}

// Constant-time string compare that tolerates differing lengths.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function makeToken(): string {
  const expiry = String(Date.now() + COOKIE_MAX_AGE_MS);
  return `${expiry}.${sign(expiry)}`;
}

function tokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const expiry = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!safeEqual(mac, sign(expiry))) return false;
  const expiryMs = Number(expiry);
  return Number.isFinite(expiryMs) && expiryMs > Date.now();
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function setGateCookie(res: Response) {
  const secure = process.env.NODE_ENV === "production";
  const attrs = [
    `${COOKIE_NAME}=${makeToken()}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(COOKIE_MAX_AGE_MS / 1000)}`,
  ];
  if (secure) attrs.push("Secure");
  res.setHeader("Set-Cookie", attrs.join("; "));
}

function clearGateCookie(res: Response) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
}

// Keep the post-unlock redirect target on-site (relative path) to avoid an
// open-redirect via the `next` field.
function safeNext(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/__gate")) return "/";
  return raw;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lockScreenHtml(opts: { next: string; error?: boolean; email?: string }): string {
  const next = escapeHtml(opts.next);
  const email = escapeHtml(opts.email || "");
  const errorBanner = opts.error
    ? `<p class="error" role="alert">That email and PIN don't match. Please try again.</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow, noarchive" />
<title>BenSync — Private</title>
<style>
  :root{
    --navy:#0F2A47; --navy-2:#0B2138; --green:#1F8A5B; --mint:#7FD6A8;
    --ink:#0F2A47; --muted:#47586B; --line:#e3e9ef; --panel:#ffffff;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    color:var(--ink);
    background:radial-gradient(1200px 600px at 50% -10%, #16385C 0%, var(--navy) 45%, var(--navy-2) 100%);
    display:flex;align-items:center;justify-content:center;padding:24px;
  }
  .card{
    width:100%;max-width:400px;background:var(--panel);border-radius:16px;
    box-shadow:0 24px 60px rgba(3,16,32,.45);padding:38px 34px 30px;
  }
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:26px}
  .brand svg{width:34px;height:34px;display:block}
  .brand .name{font-size:20px;font-weight:800;letter-spacing:.2px;color:var(--navy)}
  .brand .name span{color:var(--green)}
  .lock{
    display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;
    text-transform:uppercase;letter-spacing:.10em;color:var(--green);
    background:#E8F3ED;border-radius:999px;padding:5px 11px;margin-bottom:16px;
  }
  h1{font-size:21px;margin:0 0 6px;color:var(--navy)}
  p.sub{margin:0 0 22px;color:var(--muted);font-size:14px;line-height:1.5}
  label{display:block;font-size:13px;font-weight:600;color:var(--navy);margin:0 0 6px}
  input{
    width:100%;padding:12px 14px;font-size:15px;border:1.5px solid var(--line);
    border-radius:10px;background:#fff;color:var(--ink);outline:none;margin-bottom:16px;
    transition:border-color .15s,box-shadow .15s;
  }
  input:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(31,138,91,.15)}
  button{
    width:100%;padding:13px 16px;font-size:15px;font-weight:700;color:#fff;cursor:pointer;
    background:var(--green);border:0;border-radius:10px;transition:background .15s;
  }
  button:hover{background:var(--navy)}
  .error{
    background:#FDECEC;color:#B42318;border:1px solid #F6C9C4;border-radius:10px;
    padding:10px 12px;font-size:13px;margin:0 0 16px;
  }
  .foot{margin-top:20px;text-align:center;font-size:12px;color:#8695a4}
</style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">
        <path d="M20 58 V8 H31 A13 13 0 0 1 31 34 H20" fill="none" stroke="#0F2A47" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M20 34 H36 A12 12 0 0 1 36 58 H20" fill="none" stroke="#1F8A5B" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
      <div class="name">Ben<span>Sync</span></div>
    </div>
    <div class="lock">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 10V8a6 6 0 1 1 12 0v2m-9 0h6a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3z" stroke="#1F8A5B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Private
    </div>
    <h1>This site is protected</h1>
    <p class="sub">Access is restricted. Enter your email and PIN to continue.</p>
    ${errorBanner}
    <form method="POST" action="${UNLOCK_PATH}" autocomplete="off">
      <input type="hidden" name="next" value="${next}" />
      <label for="email">Email</label>
      <input id="email" name="email" type="email" inputmode="email" placeholder="you@example.com" value="${email}" required autofocus />
      <label for="pin">PIN</label>
      <input id="pin" name="pin" type="password" inputmode="numeric" placeholder="••••" required />
      <button type="submit">Unlock</button>
    </form>
    <div class="foot">BenSync · authorized access only</div>
  </main>
</body>
</html>`;
}

/**
 * Express middleware implementing the site gate. Mount it FIRST, before the
 * marketing static server, the API, and the SPA catch-all.
 */
export function siteGate(req: Request, res: Response, next: NextFunction) {
  if (!isLocked()) return next();

  const cookies = parseCookies(req.headers.cookie);
  const unlocked = tokenValid(cookies[COOKIE_NAME]);

  // Logout: clear the cookie and re-lock.
  if (req.path === LOGOUT_PATH) {
    clearGateCookie(res);
    res.redirect(302, "/");
    return;
  }

  // Unlock: validate email + PIN, issue the signed cookie.
  if (req.path === UNLOCK_PATH) {
    if (req.method !== "POST") {
      res.redirect(302, "/");
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const pin = String(body.pin ?? "").trim();
    const next = safeNext(body.next);

    const ok = safeEqual(email, allowedEmail()) && safeEqual(pin, allowedPin());
    if (ok) {
      setGateCookie(res);
      res.redirect(302, next);
      return;
    }
    res
      .status(401)
      .type("html")
      .send(lockScreenHtml({ next, error: true, email }));
    return;
  }

  // Already unlocked → let the request through to the real app.
  if (unlocked) return next();

  // Locked and no valid cookie. GET/HEAD → show the lock screen (200 so the
  // Railway healthcheck on "/" stays green). Everything else (API writes,
  // etc.) → 401 JSON so client code fails cleanly instead of parsing HTML.
  if (req.method === "GET" || req.method === "HEAD") {
    res
      .status(200)
      .type("html")
      .send(lockScreenHtml({ next: safeNext(req.originalUrl) }));
    return;
  }

  res.status(401).json({ message: "Site is locked. Please unlock to continue." });
}
