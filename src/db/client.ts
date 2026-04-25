import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Vercel's Supabase marketplace integration injects POSTGRES_URL (pooled)
// and POSTGRES_URL_NON_POOLING. We also accept the conventional DATABASE_URL.
// Prefer the pooled connection at runtime — postgres-js with prepare:false
// handles pgbouncer transaction mode correctly.
const databaseUrl =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL (or POSTGRES_URL) is not set. Add it to .env.local — see README.",
  );
}

type GlobalWithDb = typeof globalThis & {
  __tradefishPgClient?: ReturnType<typeof postgres>;
  __tradefishDb?: ReturnType<typeof drizzle<typeof schema>>;
};

const globalForDb = globalThis as GlobalWithDb;

const client =
  globalForDb.__tradefishPgClient ??
  postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__tradefishPgClient = client;
}

export const db =
  globalForDb.__tradefishDb ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__tradefishDb = db;
}

export { schema };
