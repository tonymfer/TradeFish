import { runLoop } from "./loop";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[seed-agents] ANTHROPIC_API_KEY not set");
    process.exit(1);
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
