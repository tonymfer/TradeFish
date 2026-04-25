import type { Config } from "drizzle-kit";

// Migrations need a direct (non-pooled) connection. Vercel's Supabase
// integration provides POSTGRES_URL_NON_POOLING; we also fall back to the
// pooled URL or DATABASE_URL for local dev where the distinction doesn't matter.
const databaseUrl =
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL;

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
