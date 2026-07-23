// Dynamic per-broker branded pages served at bensync.com/{slug}.
//
// Registered AFTER serveMarketing (so reserved marketing slugs win) and the
// API routes, but BEFORE the SPA static catch-all (so an unknown /{slug}
// isn't swallowed into the React app). A slug that doesn't resolve to an
// approved broker calls next(), falling through to the SPA NotFound.
//
// These pages are private (noindex) and text-driven: only the broker's
// agency name, producer name, and contact vary. The BenSync monogram is the
// mark (no per-broker logo asset needed), so a page needs zero uploads.

import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { log } from "./index";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The BenSync monogram path (from marketing/brand/svg/BenSync-monogram-navy.svg),
// scaled/centred into a 40x40 rounded tile. White fill on navy.
const MONOGRAM_PATH =
  "M382 5L90 5L90-735L352-735Q476-735 540.5000-683Q605-631 605-534L605-520Q605-452 573-412Q556-390 532-376Q576-358 603-324Q635-283 635-214L635-200Q635-135 606.5000-89.5000Q578-44 521.5000-19.5000Q465 5 382 5M392-313L229-313L229-109L392-109Q442-109 468-136.5000Q494-164 494-212Q494-260 468-286.5000Q442-313 392-313M365-621L229-621L229-423L365-423Q416-423 440-450Q464-477 464-522Q464-567 440-594Q416-621 365-621";

function monogramTile(size: number, radius: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true" style="flex:none;">
    <rect width="40" height="40" rx="${radius}" fill="#0F2A47"/>
    <path transform="translate(7.31 32.78) scale(0.035)" fill="#ffffff" d="${MONOGRAM_PATH}"/>
  </svg>`;
}

interface BrokerView {
  agency: string;
  producer: string;
  phone: string;
  email: string;
  slug: string;
}

function renderBrokerPage(b: BrokerView): string {
  const agency = escapeHtml(b.agency);
  const producer = escapeHtml(b.producer);
  const phone = escapeHtml(b.phone);
  const email = escapeHtml(b.email);
  const slug = escapeHtml(b.slug);
  const telHref = `tel:${escapeHtml(b.phone.replace(/[^0-9+]/g, ""))}`;
  const mailHref = `mailto:${escapeHtml(b.email)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${agency} Employee Benefits, Powered by BenSync</title>
<meta name="description" content="${agency}'s employee benefits program, powered by BenSync: better benefits, lower rates, one bill. Upload your census and see your proposal.">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffffff">
<link rel="icon" type="image/svg+xml" href="/brand/svg/BenSync-monogram-color.svg">
<link rel="icon" type="image/png" sizes="32x32" href="/brand/png/BenSync-favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/brand/png/BenSync-favicon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div style="min-height:100vh;display:flex;flex-direction:column;">

<!-- BRANDED HEADER -->
<header style="background:#ffffff;border-bottom:1px solid rgba(15,42,71,.08);">
  <div class="demo-header-inner" style="max-width:1080px;margin:0 auto;padding:0 clamp(20px,5vw,32px);min-height:74px;display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;">
    <span style="display:flex;align-items:center;gap:12px;">
      ${monogramTile(40, 10)}
      <span style="font-family:'Sora',sans-serif;font-size:20px;font-weight:700;letter-spacing:-.015em;color:#0F2A47;">${agency}</span>
    </span>
    <span class="demo-header-brand" style="margin-left:auto;display:flex;align-items:center;">
      <a href="/" style="display:flex;align-items:center;gap:8px;" aria-label="BenSync home">
        <span style="font-size:12px;color:#7A8A99;font-weight:600;">Powered by</span>
        <img src="/brand/wordmark-header.png" alt="BenSync" width="369" height="96" style="height:19px;width:auto;display:block;">
      </a>
    </span>
  </div>
</header>

<!-- HERO -->
<section style="background:linear-gradient(180deg,#F6F8F7 0%,#ffffff 100%);border-bottom:1px solid rgba(15,42,71,.06);">
  <div style="max-width:1080px;margin:0 auto;padding:72px clamp(20px,5vw,32px) 64px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:56px;align-items:center;">
    <div style="display:flex;flex-direction:column;gap:18px;">
      <span style="font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1F8A5B;">A complete benefits program</span>
      <h1 style="font-family:'Sora',sans-serif;font-size:clamp(30px,4vw,42px);line-height:1.12;letter-spacing:-.025em;margin:0;font-weight:700;">Better Benefits. Lower Rates. One Bill.</h1>
      <p style="font-size:16.5px;line-height:1.68;color:#47586B;margin:0;max-width:520px;text-wrap:pretty;">We've partnered with BenSync to bring our clients a complete employee benefits program: medical, pharmacy, dental, vision, and supplemental, delivered as one package. Upload your census and see your proposal, all online.</p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:4px;">
        <a id="hero-cta" class="btn-green" href="#get-started" style="align-self:flex-start;background:#1F8A5B;color:#ffffff;padding:17px 32px;border-radius:12px;font-weight:700;font-size:17px;">Get Your Proposal</a>
        <span style="font-size:13px;color:#7A8A99;">Takes minutes. No obligation. Your census stays secure.</span>
      </div>
    </div>
    <!-- Agency badge card -->
    <div style="background:#ffffff;border:1px solid rgba(15,42,71,.10);border-radius:18px;padding:28px 26px;display:flex;flex-direction:column;align-items:center;gap:14px;box-shadow:0 20px 48px -26px rgba(15,42,71,.28);text-align:center;">
      <span style="position:relative;width:112px;height:112px;display:flex;align-items:center;justify-content:center;">
        <svg aria-hidden="true" viewBox="0 0 112 112" style="position:absolute;inset:0;width:112px;height:112px;">
          <circle cx="56" cy="56" r="54" fill="none" stroke="#7FD6A8" stroke-width="2" stroke-dasharray="3 8"/>
          <circle cx="56" cy="56" r="46" fill="#EAF4EE"/>
        </svg>
        ${monogramTile(52, 14)}
      </span>
      <span style="display:flex;flex-direction:column;gap:3px;">
        <span style="font-family:'Sora',sans-serif;font-size:17.5px;font-weight:700;color:#0F2A47;">${producer}</span>
        <span style="font-size:13px;color:#47586B;font-weight:600;">Benefits Advisor · ${agency}</span>
      </span>
      <span style="display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;color:#16714A;background:#E8F3ED;border:1px solid rgba(31,138,91,.25);padding:7px 13px;border-radius:999px;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
        BenSync Program Partner
      </span>
      <div style="width:100%;display:flex;flex-direction:column;gap:8px;border-top:1px dashed rgba(15,42,71,.12);padding-top:16px;text-align:left;">
        <span style="display:flex;align-items:baseline;gap:10px;"><span style="font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9AA8B5;width:46px;">Phone</span><a href="${telHref}" style="font-size:14.5px;font-weight:700;color:#16385C;">${phone}</a></span>
        <span style="display:flex;align-items:baseline;gap:10px;"><span style="font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9AA8B5;width:46px;">Email</span><a href="${mailHref}" style="font-size:14px;font-weight:600;color:#1F8A5B;">${email}</a></span>
        <span style="display:flex;align-items:baseline;gap:10px;"><span style="font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#9AA8B5;width:46px;">Page</span><span style="font-size:13.5px;font-family:ui-monospace,Menlo,monospace;color:#47586B;">bensync.com/${slug}</span></span>
      </div>
      <span style="font-size:12.5px;line-height:1.55;color:#7A8A99;text-align:left;">Questions before you start? Call or email any time. Everything you submit on this page comes straight to us.</span>
    </div>
  </div>
</section>

<!-- THREE STEPS -->
<section style="max-width:1080px;margin:0 auto;padding:56px clamp(20px,5vw,32px) 60px;width:100%;box-sizing:border-box;">
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
    <h2 style="font-family:'Sora',sans-serif;font-size:26px;letter-spacing:-.02em;margin:0;font-weight:700;">From census to proposal in three steps.</h2>
    <p style="font-size:15px;color:#47586B;margin:0;">Every step is connected to your team at ${agency}.</p>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr));gap:16px;">
    <div style="display:flex;align-items:center;gap:16px;border:1px solid rgba(15,42,71,.10);border-radius:16px;padding:20px 22px;background:#ffffff;">
      <svg width="52" height="52" aria-hidden="true" style="flex:none;"><use href="/brand/spots.svg#spot-enroll"/></svg>
      <span style="display:flex;flex-direction:column;gap:2px;"><span style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#1F8A5B;">01</span><span style="font-family:'Sora',sans-serif;font-size:16px;font-weight:600;letter-spacing:-.01em;color:#0F2A47;">Enter your details</span></span>
    </div>
    <div style="display:flex;align-items:center;gap:16px;border:1px solid rgba(15,42,71,.10);border-radius:16px;padding:20px 22px;background:#ffffff;">
      <svg width="52" height="52" aria-hidden="true" style="flex:none;"><use href="/brand/spots.svg#spot-cobra"/></svg>
      <span style="display:flex;flex-direction:column;gap:2px;"><span style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#1F8A5B;">02</span><span style="font-family:'Sora',sans-serif;font-size:16px;font-weight:600;letter-spacing:-.01em;color:#0F2A47;">Upload your census</span></span>
    </div>
    <div style="display:flex;align-items:center;gap:16px;border:1px solid rgba(15,42,71,.10);border-radius:16px;padding:20px 22px;background:#ffffff;">
      <svg width="52" height="52" aria-hidden="true" style="flex:none;"><use href="/brand/spots.svg#spot-billing"/></svg>
      <span style="display:flex;flex-direction:column;gap:2px;"><span style="font-family:'Sora',sans-serif;font-size:13px;font-weight:700;color:#1F8A5B;">03</span><span style="font-family:'Sora',sans-serif;font-size:16px;font-weight:600;letter-spacing:-.01em;color:#0F2A47;">Review your proposal</span></span>
    </div>
  </div>
</section>

<!-- GET STARTED: census submission -->
<section id="get-started" style="background:#F6F8F7;border-top:1px solid rgba(15,42,71,.06);border-bottom:1px solid rgba(15,42,71,.06);">
<div style="max-width:640px;margin:0 auto;padding:64px clamp(20px,5vw,32px) 72px;width:100%;box-sizing:border-box;">
  <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;text-align:center;">
    <span style="font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1F8A5B;">Get your proposal</span>
    <h2 style="font-family:'Sora',sans-serif;font-size:clamp(24px,3vw,30px);letter-spacing:-.02em;margin:0;font-weight:700;color:#0F2A47;">Upload your census. See your numbers.</h2>
    <p style="font-size:15px;line-height:1.6;color:#47586B;margin:0;">Tell us about your group and upload your employee census. We build your proposal and send you a secure link, no account needed.</p>
  </div>
  <div id="bp-sent" style="display:none;flex-direction:column;gap:10px;background:#E8F3ED;border:1px solid rgba(31,138,91,.3);border-radius:14px;padding:24px;text-align:center;">
    <span style="font-family:'Sora',sans-serif;font-size:17px;font-weight:700;color:#16714A;">Your proposal is ready.</span>
    <span style="font-size:14px;line-height:1.6;color:#3B5A4C;">Opening your secure proposal now. ${producer} at ${agency} has been notified.</span>
  </div>
  <form id="bp-form" style="display:flex;flex-direction:column;gap:12px;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <input id="bp-company" name="company" placeholder="Company name" required autocomplete="organization" style="min-width:0;border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:13px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;">
      <input id="bp-count" name="employees" placeholder="# of employees" inputmode="numeric" style="min-width:0;border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:13px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;">
    </div>
    <input id="bp-name" name="contactName" placeholder="Your name" required autocomplete="name" style="border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:13px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <input id="bp-email" name="contactEmail" type="email" placeholder="Work email" required autocomplete="email" style="min-width:0;border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:13px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;">
      <input id="bp-phone" name="contactPhone" type="tel" placeholder="Phone" autocomplete="tel" style="min-width:0;border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:13px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <input id="bp-state" name="state" placeholder="State (e.g. AL)" maxlength="2" autocapitalize="characters" style="min-width:0;border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:13px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;">
      <input id="bp-zip" name="zip" placeholder="ZIP code" inputmode="numeric" style="min-width:0;border:1.5px solid rgba(15,42,71,.14);border-radius:10px;padding:13px 14px;font-size:14px;color:#0F2A47;outline:none;background:#ffffff;">
    </div>
    <label style="display:flex;flex-direction:column;gap:6px;">
      <span style="font-size:13px;font-weight:700;color:#16385C;">Employee census (.csv)</span>
      <input id="bp-file" name="file" type="file" accept=".csv,text/csv" required style="font-size:13px;color:#47586B;">
      <span style="font-size:12px;color:#9AA8B5;">First name, last name, date of birth, gender, ZIP, and relationship. Sensitive columns like SSN are dropped automatically.</span>
    </label>
    <button id="bp-send" type="submit" class="btn-green" style="border:none;cursor:pointer;background:#1F8A5B;color:#ffffff;border-radius:11px;padding:15px;font-family:'Manrope',sans-serif;font-size:15.5px;font-weight:700;text-align:center;">Get Your Proposal</button>
    <span id="bp-error" style="display:none;font-size:13px;color:#B4483E;text-align:center;"></span>
    <span style="font-size:11.5px;color:#9AA8B5;text-align:center;">Prefer to talk first? Call ${producer} at <a href="${telHref}" style="color:#16385C;font-weight:700;">${phone}</a>.</span>
  </form>
</div>
</section>

<!-- FOOTER -->
<footer style="background:#0B2138;margin-top:auto;">
  <div style="max-width:1080px;margin:0 auto;padding:26px clamp(20px,5vw,32px);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;">
    <span style="display:flex;align-items:center;gap:10px;">
      <span style="font-family:'Sora',sans-serif;font-size:14px;font-weight:700;color:#ffffff;">${agency}</span>
      <span style="width:1px;height:14px;background:rgba(255,255,255,.25);"></span>
      <a href="/" style="font-size:12.5px;color:rgba(255,255,255,.6);" aria-label="BenSync home">Powered by <img src="/brand/wordmark-header-reversed.png" alt="BenSync" width="369" height="96" style="height:13px;width:auto;display:inline-block;vertical-align:-2px;"></a>
    </span>
    <span style="font-size:12.5px;color:rgba(255,255,255,.45);">${producer} · <a href="${telHref}" style="color:rgba(255,255,255,.6);">${phone}</a></span>
  </div>
</footer>

</div>
<script>
(function () {
  var form = document.getElementById('bp-form');
  var sent = document.getElementById('bp-sent');
  var errEl = document.getElementById('bp-error');
  var btn = document.getElementById('bp-send');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errEl.style.display = 'none';
    var file = document.getElementById('bp-file').files[0];
    if (!file) { errEl.textContent = 'Please attach your census CSV.'; errEl.style.display = 'block'; return; }
    var fd = new FormData(form);
    btn.disabled = true; btn.textContent = 'Building your proposal…';
    fetch('/api/p/${slug}/submit', { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok && res.j && res.j.token) {
          form.style.display = 'none';
          sent.style.display = 'flex';
          setTimeout(function () { window.location.href = '/q/' + res.j.token; }, 900);
          return;
        }
        throw new Error((res.j && res.j.message) || 'Something went wrong. Please try again.');
      })
      .catch(function (err) {
        btn.disabled = false; btn.textContent = 'Get Your Proposal';
        errEl.textContent = err.message || 'Something went wrong. Please try again.';
        errEl.style.display = 'block';
      });
  });
})();
</script>
</body>
</html>`;
}

export function serveBrokerPages(app: Express): void {
  app.get("/:slug", async (req: Request, res: Response, next: NextFunction) => {
    const slug = req.params.slug;
    // Only handle a single clean path segment: no dots (asset requests),
    // no api prefix, no encoded slashes. Everything else falls through.
    if (!slug || slug.includes(".") || slug.includes("/") || !/^[a-z0-9-]+$/.test(slug)) {
      return next();
    }
    try {
      const broker = await storage.getUserBySlug(slug);
      if (!broker || broker.role !== "broker" || broker.approvalStatus !== "approved") {
        return next();
      }
      const html = renderBrokerPage({
        agency: broker.companyName || broker.fullName || "Your Agency",
        producer: broker.fullName || "Your Advisor",
        phone: broker.phone || "",
        email: broker.email || "",
        slug,
      });
      res.set("Cache-Control", "no-cache");
      res.set("X-Robots-Tag", "noindex, nofollow");
      res.type("html").send(html);
    } catch (err: any) {
      log(`[BROKER-PAGE] Render failed for /${slug}: ${err.message}`);
      next();
    }
  });
}
