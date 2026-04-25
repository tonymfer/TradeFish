export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV === "production") return;
  if (!process.env.DATABASE_URL) {
    console.warn(
      "[instrumentation] DATABASE_URL not set, skipping dev scheduler.",
    );
    return;
  }
  const { startDevScheduler } = await import("@/lib/scheduler");
  startDevScheduler(10_000);
  console.log("[instrumentation] dev scheduler started (10s tick).");
}
