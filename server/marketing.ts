import type { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";

// Serves the BenSync marketing site (static HTML/CSS/assets in /marketing)
// at the site root: "/", "/employers", "/brokers", "/members",
// "/whats-included", "/partner-network", "/system", "/contact", and
// "/login" (the member-tools chooser page). Extensionless URLs resolve to
// their .html files, mirroring the original static server. Anything this
// cannot resolve falls through to the API routes and the React portal
// (whose sign-in lives at /portal), so the two coexist on one service.
const MARKETING_ROOT = path.resolve(process.cwd(), "marketing");

export function serveMarketing(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  let urlPath: string;
  try {
    urlPath = decodeURIComponent(req.path);
  } catch {
    return next();
  }
  if (urlPath === "/") urlPath = "/index.html";

  // Resolve inside MARKETING_ROOT only; block traversal.
  const resolved = path.normalize(path.join(MARKETING_ROOT, urlPath));
  if (!resolved.startsWith(MARKETING_ROOT + path.sep)) return next();

  let target = resolved;
  if (!path.extname(target)) {
    if (fs.existsSync(target + ".html")) target = target + ".html";
    else return next();
  }

  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return next();
  res.sendFile(target);
}
