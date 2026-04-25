import { PERSONAS, clampDecision } from "./personas";

async function main() {
  for (const p of PERSONAS) {
    process.stdout.write(`\n=== ${p.name} ===\n`);
    try {
      const signal = await p.fetchSignal();
      const decision = clampDecision(p.decide(signal));
      const thesis = p.template(signal, decision);
      console.log(`  decision: ${decision.direction} conf=${decision.confidence} size=$${decision.positionSizeUsd}`);
      console.log(`  thesis: ${thesis}`);
      console.log(`  cited: ${signal.citedSourceUrl}`);
    } catch (err) {
      console.log(`  ERROR: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
