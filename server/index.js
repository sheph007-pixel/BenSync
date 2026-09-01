// Static server for the Kennion 2027 renewal portal.
// The portal is a single-page app; everything it needs (group data, logo)
// ships as static assets under dist/public.
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

const app = express();
app.disable("x-powered-by");
app.use(compression());

// Hashed bundles are immutable; the data file and index are not.
app.use(
  "/assets",
  express.static(path.join(publicDir, "assets"), {
    maxAge: "1y",
    immutable: true,
  }),
);
app.use(express.static(publicDir, { index: false, maxAge: "1h" }));

app.get("/healthz", (_req, res) => res.type("text/plain").send("ok"));

// SPA fallback — the portal owns every route.
app.use((_req, res) => res.sendFile(indexHtml));

const port = Number(process.env.PORT) || 5000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Kennion renewal portal listening on :${port}`);
});
