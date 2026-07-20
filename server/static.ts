import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// Paths that should be discoverable by search engines / LLM crawlers. Only the
// marketing homepage is indexable; everything else is private SPA routes
// (dashboard, admin, login, register, individual quote tokens) and gets
// X-Robots-Tag: noindex, nofollow, noarchive on the HTTP response. This is
// the belt half of belt-and-braces with /robots.txt - it ensures even if a
// crawler ignores robots.txt or follows a link directly, the response itself
// tells them not to index.
const INDEXABLE_PATHS = new Set<string>([
  "/",
  "/index.html",
]);
const INDEXABLE_FILES = new Set<string>([
  "/favicon.png",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
]);

function setRobotsHeaders(req: express.Request, res: express.Response, next: express.NextFunction) {
  const p = req.path;
  // Public files served as-is.
  if (INDEXABLE_FILES.has(p)) return next();
  // Indexable homepage.
  if (INDEXABLE_PATHS.has(p)) return next();
  // Static build assets (hashed JS/CSS/images) - irrelevant for indexing,
  // safe to leave alone so crawlers can fetch them when rendering the homepage.
  if (/\.[a-z0-9]+$/i.test(p)) return next();
  // API responses are JSON, not HTML; skip the noindex theatre.
  if (p.startsWith("/api/")) return next();
  // Every other path is a private SPA route (/dashboard, /admin, /login, /q/:token, etc.)
  // Block indexing at the HTTP-response layer.
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  return next();
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Apply the noindex header BEFORE static + SPA fallback so it reaches every
  // SPA route including those that fall through to index.html.
  app.use(setRobotsHeaders);

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
