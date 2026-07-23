// Broker branded-page slug generation.
//
// A broker's slug becomes their public page URL, bensync.com/{slug}. It must
// never collide with a marketing page, an SPA route, an API prefix, or a
// static asset directory, or the branded page would either shadow one of
// those or be shadowed by it. RESERVED_SLUGS is the union of every reserved
// top-level path in the app (see server/marketing.ts, server/static.ts,
// client/src/App.tsx). Keep it in sync if new top-level routes are added.

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // marketing pages (server/marketing.ts serves marketing/*.html)
  "index", "benefits", "brand", "broker-demo", "brokers", "contact",
  "employers", "login", "members", "partner-network", "system",
  "whats-included",
  // marketing static assets
  "app", "styles", "app.js", "styles.css",
  // SPA routes (client/src/App.tsx)
  "broker-sign-up", "broker-log-in",
  "portal", "register", "forgot-password", "reset-password", "auth",
  "dashboard", "proposals", "report", "admin", "q",
  // API + build/static prefixes
  "api", "assets", "captive",
  // indexable static files
  "favicon", "favicon.png", "robots", "robots.txt", "sitemap",
  "sitemap.xml", "llms", "llms.txt",
  // reserve obvious future/system words
  "www", "app-store", "help", "support", "about", "privacy", "terms",
]);

// Turn an agency name into a URL-safe slug: lowercase, non-alphanumerics to
// hyphens, collapsed, trimmed. "Meridian Insurance Group" -> "meridian-insurance-group".
export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFKD") // decompose accents; combining marks fall out below
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, ""); // re-trim in case slice cut mid-hyphen
}

// Produce a unique, non-reserved slug from an agency name. `isTaken` returns
// true if a slug already belongs to another user. Appends -2, -3, … on
// collision, and prefixes reserved bases so a broker can never claim e.g.
// "brokers" or "login".
export async function generateUniqueSlug(
  agencyName: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  let base = slugify(agencyName);
  if (!base) base = "broker";
  if (RESERVED_SLUGS.has(base)) base = `${base}-agency`;

  let candidate = base;
  let n = 1;
  // Cap the loop so a pathological collision set can't spin forever.
  while ((RESERVED_SLUGS.has(candidate) || (await isTaken(candidate))) && n < 1000) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
