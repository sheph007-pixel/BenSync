import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_PRIVATE_URL or DATABASE_URL must be set");
}

const isInternalConnection = databaseUrl.includes(".railway.internal") || databaseUrl.includes("sslmode=disable");

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
    ssl: isInternalConnection ? false : "prefer",
  },
});
