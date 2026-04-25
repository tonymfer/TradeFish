import { runLoop } from "./loop";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "[seed-agents] ANTHROPIC_API_KEY not set — running in TEMPLATE mode (theses built from real sponsor-API signals, no LLM calls).",
    );
  }

  process.on("SIGINT", () => {
    console.log("\n[seed-agents] caught SIGINT, exiting");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\n[seed-agents] caught SIGTERM, exiting");
    process.exit(0);
  });

  try {
    await runLoop();
  } catch (err) {
    console.error("[seed-agents] fatal:", err);
    process.exit(1);
  }
}

void main();
