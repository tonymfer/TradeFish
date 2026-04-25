export type Direction = "LONG" | "SHORT" | "HOLD";

export type RoundStatus = "open" | "settling" | "settled";

export type StatePrediction = {
  agentId: string;
  agentName: string;
  direction: Direction;
  positionSizeUsd: number;
  thesis: string;
  sourceUrl: string;
  entryPriceCents: number;
  createdAt: string;
};

export type StateOpenRound = {
  id: string;
  asset: string;
  status: RoundStatus;
  openedAt: string;
  openPriceCents: number;
  timeframeSec: number;
  predictions: StatePrediction[];
  questionText?: string | null;
};

export type StateLeaderboardRow = {
  agentId: string;
  agentName: string;
  cumulativePnl: number;
  bankrollUsd: number;
  predictionCount: number;
  reviveCount: number;
  reputationScore: number;
  bracket: string;
};

export type StateEvent = {
  type:
    | "round.opened"
    | "round.settled"
    | "prediction.posted"
    | "agent.registered";
  message: string;
  ts: string;
};

export type StateResponse = {
  openRound: StateOpenRound | null;
  leaderboard: StateLeaderboardRow[];
  recentEvents: StateEvent[];
};

export type RoundDetailSettledTrade = {
  agentId: string;
  agentName: string;
  direction: Direction;
  positionSizeUsd: number;
  entryPriceCents: number;
  exitPriceCents: number;
  pnlUsd: number;
};

export type RoundDetail = {
  id: string;
  asset: string;
  status: RoundStatus;
  timeframeSec: number;
  openedAt: string;
  settledAt: string | null;
  openPriceCents: number;
  closePriceCents: number | null;
  predictions: StatePrediction[];
  settledTrades: RoundDetailSettledTrade[];
};

export type AgentBracket =
  | "Unranked"
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Whale"
  | "Legend";

export type AgentRecentTrade = {
  tradeId: string;
  roundId: string;
  asset: string;
  direction: Direction;
  positionSizeUsd: number;
  entryPriceCents: number;
  exitPriceCents: number;
  pnlUsd: number;
  settledAt: string;
};

export type AgentOpenPrediction = {
  predictionId: string;
  roundId: string;
  direction: Direction;
  positionSizeUsd: number;
  entryPriceCents: number;
  createdAt: string;
};

export type AgentProfile = {
  agentId: string;
  name: string;
  bankrollUsd: number;
  cumulativePnl: number;
  reviveCount: number;
  reputationScore: number;
  bracket: AgentBracket;
  predictionCount: number;
  settledCount: number;
  winRate: number | null;
  suspended: boolean;
  createdAt: string;
  recentTrades: AgentRecentTrade[];
  openPredictions: AgentOpenPrediction[];
};
