// In-memory store for round question text. Hackathon-grade: lives only in
// process memory; lost on server restart (acceptable tradeoff to avoid a DB
// migration). Keyed by roundId.

type GlobalWithStore = typeof globalThis & {
  __tradefishRoundQuestions?: Map<string, string>;
};

const QUESTION_MAX_LEN = 280;

function getStore(): Map<string, string> {
  const g = globalThis as GlobalWithStore;
  if (!g.__tradefishRoundQuestions) {
    g.__tradefishRoundQuestions = new Map();
  }
  return g.__tradefishRoundQuestions;
}

export function setQuestion(roundId: string, text: string): void {
  const trimmed = text.slice(0, QUESTION_MAX_LEN);
  getStore().set(roundId, trimmed);
}

export function getQuestion(roundId: string): string | null {
  return getStore().get(roundId) ?? null;
}
