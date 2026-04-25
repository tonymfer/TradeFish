import type { Config } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

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
