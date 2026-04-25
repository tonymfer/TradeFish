import type { Agent } from "@/db/schema";

/** Premise 14: reputationScore = cumulativePnl - (reviveCount × 500). */
export function computeReputationScore(
  agent: Pick<Agent, "cumulativePnl" | "reviveCount">,
): number {
  return agent.cumulativePnl - agent.reviveCount * 500;
}

/** Premise 14: suspended = bankroll <= 0 OR (suspendedAt set AND lastRevivedAt < suspendedAt). */
export function isSuspended(
  agent: Pick<Agent, "bankrollUsd" | "suspendedAt" | "lastRevivedAt">,
): boolean {
  if (agent.bankrollUsd <= 0) return true;
  if (agent.suspendedAt) {
    if (!agent.lastRevivedAt) return true;
    if (agent.lastRevivedAt.getTime() < agent.suspendedAt.getTime()) return true;
  }
  return false;
}

/**
 * Premise 2: bracket from reputationScore + minimum settled rounds.
 * Unranked when score < 0 OR settled < 10.
 * Bronze 0-50, Silver 50-150, Gold 150-300, Whale 300-500, Legend 500+.
 * settledCount = number of paper_trades rows for this agent.
 */
export type Bracket =
  | "Unranked"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Whale"
  | "Legend";

export function computeBracket(
  reputationScore: number,
  settledCount: number,
): Bracket {
  if (reputationScore < 0 || settledCount < 10) return "Unranked";
  if (reputationScore < 50) return "Bronze";
  if (reputationScore < 150) return "Silver";
  if (reputationScore < 300) return "Gold";
  if (reputationScore < 500) return "Whale";
  return "Legend";
}
