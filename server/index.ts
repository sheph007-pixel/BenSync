import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { serveMarketing } from "./marketing";
import { createServer } from "http";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    // Raised from the 100kb default for the one-time data migration
    // (proposal PDFs travel as base64 row chunks). Safe to lower again
    // once the migration endpoints are removed.
    limit: "64mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Run database migrations first. Non-fatal: an unreachable database or a
  // failed migration must not keep the whole site down. On a fresh database
  // the schema is created by db:push:ci in the start command before this
  // process boots; the .sql migrations only patch long-lived databases.
  try {
    const { runMigrations } = await import("./migrate");
    await runMigrations();
  } catch (err: any) {
    console.error("Migrations failed (continuing to serve):", err?.message ?? err);
  }

  // BenSync marketing site at the root (/, /employers, /brokers, /login
  // chooser, assets). Registered before the API/session stack so public
  // page views never touch the session store; unresolved paths fall
  // through to the API and the React portal.
  app.use(serveMarketing);

  await registerRoutes(httpServer, app);

  // Temporary: admin-only data import used by the one-time migration
  // from the old system. Registered after registerRoutes so the session
  // middleware it sets up applies here. Remove after the migration.
  try {
    const { registerMigrateImport } = await import("./migrate-sync");
    registerMigrateImport(app);
  } catch (err: any) {
    console.error("Migrate import registration failed (non-fatal):", err?.message ?? err);
  }

  const { seedDatabase } = await import("./seed");
  try {
    await seedDatabase();
  } catch (err: any) {
    console.error("Seed failed (non-fatal):", err.message);
  }

  // Re-render any Risk Screen PDFs left stale by an older renderer version.
  // Self-limiting: skips rows already at the current PDF_RENDER_VERSION.
  try {
    const { backfillScreenPdfs } = await import("./backfill-screen-pdfs");
    await backfillScreenPdfs();
  } catch (err: any) {
    console.error("Screen PDF backfill failed (non-fatal):", err.message);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }

    const isDbError = err.code === "ECONNRESET" || err.code === "ECONNREFUSED" ||
      err.message?.includes("ECONNRESET") || err.message?.includes("ECONNREFUSED") ||
      err.message?.includes("Connection terminated");

    if (isDbError) {
      console.error("Database connection error:", err.message);
      return res.status(503).json({ message: "Service temporarily unavailable. Please try again." });
    }

    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("Internal Server Error:", err);
    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
