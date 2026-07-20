import { pool } from "./db";
import { log } from "./index";
import fs from "fs";
import path from "path";

export async function runMigrations() {
  try {
    log("Running database migrations...", "migrate");

    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Get list of applied migrations
    const { rows: appliedMigrations } = await pool.query(
      "SELECT migration_name FROM schema_migrations"
    );
    const appliedSet = new Set(appliedMigrations.map((r: any) => r.migration_name));

    // Read migration files
    const migrationsDir = path.join(process.cwd(), "migrations");
    if (!fs.existsSync(migrationsDir)) {
      log("No migrations directory found, skipping migrations", "migrate");
      return;
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const migrationName = file.replace(".sql", "");

      if (appliedSet.has(migrationName)) {
        log(`Migration ${migrationName} already applied, skipping`, "migrate");
        continue;
      }

      log(`Applying migration: ${migrationName}`, "migrate");

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      await pool.query(sql);
      await pool.query(
        "INSERT INTO schema_migrations (migration_name) VALUES ($1)",
        [migrationName]
      );

      log(`✓ Migration ${migrationName} applied successfully`, "migrate");
    }

    log("All migrations completed", "migrate");
  } catch (error: any) {
    log(`Migration error: ${error.message}`, "migrate");
    throw error;
  }
}
