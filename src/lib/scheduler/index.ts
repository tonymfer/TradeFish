import {
  getOpenRound,
  isRoundDue,
  openNewRound,
  settleRound,
} from "./round";

export { openNewRound, settleRound, getOpenRound, isRoundDue };

export type TickResult = {
  opened?: { roundId: string };
  settled?: { roundId: string };
  noop?: true;
};

let tickInFlight = false;

export async function tick(): Promise<TickResult> {
  if (tickInFlight) return { noop: true };
  tickInFlight = true;
  try {
    const open = await getOpenRound();
    if (!open) {
      const round = await openNewRound();
      return { opened: { roundId: round.id } };
    }
    if (isRoundDue(open)) {
      const settled = await settleRound(open.id);
      // open the next one in the same tick so the floor is never empty
      const next = await openNewRound();
      return {
        settled: settled ? { roundId: settled.id } : { roundId: open.id },
        opened: { roundId: next.id },
      };
    }
    return { noop: true };
  } finally {
    tickInFlight = false;
  }
}

type GlobalWithScheduler = typeof globalThis & {
  __tradefishSchedulerInterval?: ReturnType<typeof setInterval>;
};

export function startDevScheduler(intervalMs = 10_000) {
  const g = globalThis as GlobalWithScheduler;
  if (g.__tradefishSchedulerInterval) return;
  g.__tradefishSchedulerInterval = setInterval(() => {
    tick().catch((err) => {
      console.error("[scheduler] tick error:", err);
    });
  }, intervalMs);
  // run an immediate tick so dev gets an open round right away
  tick().catch((err) => {
    console.error("[scheduler] initial tick error:", err);
  });
}
