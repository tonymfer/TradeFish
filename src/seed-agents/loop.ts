import { promises as fs } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  PERSONAS,
  clampDecision,
  type Decision,
  type Direction,
  type PersonaConfig,
  type Signal,
} from "./personas";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

const HAIKU_INPUT_PER_MTOK_USD = 1.0;
const HAIKU_OUTPUT_PER_MTOK_USD = 5.0;
const HAIKU_CACHE_WRITE_PER_MTOK_USD = 1.25;
const HAIKU_CACHE_READ_PER_MTOK_USD = 0.1;

const DAILY_SPEND_CAP_USD = 50;

const KEYS_FILE = path.resolve(process.cwd(), ".data", "seed-agent-keys.json");

type SeedAgentKey = {
  name: string;
  agentId: string;
  apiKey: string;
};

type RegisterResponse = {
  agentId: string;
  apiKey: string;
  bankrollUsd: number;
};

type OpenRound = {
  id: string;
  asset: string;
  status: "open";
  openedAt: string;
  openPriceCents: number;
};

type OpenRoundResponse = {
  openRound: {
    id: string;
    asset: string;
    openedAt: string;
    openPriceCents: number;
  } | null;
};

type PredictionRequest = {
  direction: Direction;
  confidence: number;
  positionSizeUsd: number;
  thesis: string;
  sourceUrl: string;
};

type PredictionResponse = {
  predictionId: string;
  entryPriceCents: number;
};

const apiBaseUrl = (): string =>
  process.env.TRADEFISH_API_BASE_URL ?? "http://localhost:3100";

const ownerEmail = (): string =>
  process.env.SEED_AGENT_OWNER_EMAIL ?? "seed-agents@tradefish.local";

const USE_HAIKU = Boolean(process.env.ANTHROPIC_API_KEY);

let dailySpendUsd = 0;
let dailyCounterStartedAt = Date.now();

function maybeResetDailyCounter() {
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (Date.now() - dailyCounterStartedAt > oneDayMs) {
    dailySpendUsd = 0;
    dailyCounterStartedAt = Date.now();
  }
}

function recordSpend(usage: {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}) {
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;

  dailySpendUsd +=
    (input / 1_000_000) * HAIKU_INPUT_PER_MTOK_USD +
    (output / 1_000_000) * HAIKU_OUTPUT_PER_MTOK_USD +
    (cacheWrite / 1_000_000) * HAIKU_CACHE_WRITE_PER_MTOK_USD +
    (cacheRead / 1_000_000) * HAIKU_CACHE_READ_PER_MTOK_USD;
}

async function loadOrRegisterAgents(): Promise<SeedAgentKey[]> {
  try {
    const raw = await fs.readFile(KEYS_FILE, "utf8");
    const parsed = JSON.parse(raw) as SeedAgentKey[];
    const expected = new Set(PERSONAS.map((p) => p.name));
    const have = new Set(parsed.map((p) => p.name));
    const sameSet =
      parsed.length === PERSONAS.length &&
      [...expected].every((n) => have.has(n));
    if (sameSet) {
      console.log(`[seed-agents] loaded ${parsed.length} keys from ${KEYS_FILE}`);
      return parsed;
    }
    console.log(
      `[seed-agents] keys file persona names don't match current PERSONAS — re-registering`,
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.log(`[seed-agents] no keys file at ${KEYS_FILE}, registering fresh`);
  }

  const registered: SeedAgentKey[] = [];
  for (const persona of PERSONAS) {
    const res = await fetch(`${apiBaseUrl()}/api/agents/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: persona.name, ownerEmail: ownerEmail() }),
    });
    if (!res.ok) {
      throw new Error(
        `register failed for ${persona.name}: ${res.status} ${await res.text()}`,
      );
    }
    const body = (await res.json()) as RegisterResponse;
    registered.push({ name: persona.name, agentId: body.agentId, apiKey: body.apiKey });
    console.log(`[seed-agents] registered ${persona.name} → ${body.agentId}`);
  }

  await fs.mkdir(path.dirname(KEYS_FILE), { recursive: true });
  await fs.writeFile(KEYS_FILE, JSON.stringify(registered, null, 2));
  return registered;
}

async function fetchOpenRound(): Promise<OpenRound | null> {
  const res = await fetch(`${apiBaseUrl()}/api/rounds/open`, {
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`[seed-agents] /api/rounds/open ${res.status}`);
    return null;
  }
  const body = (await res.json()) as OpenRoundResponse;
  if (!body.openRound) return null;
  return {
    id: body.openRound.id,
    asset: body.openRound.asset,
    status: "open",
    openedAt: body.openRound.openedAt,
    openPriceCents: body.openRound.openPriceCents,
  };
}

async function tickScheduler(): Promise<void> {
  // Vercel Hobby crons can't run minute-by-minute, so each loop cycle pokes
  // the tick endpoint. The route is idempotent (no-op when nothing to do).
  const res = await fetch(`${apiBaseUrl()}/api/scheduler/tick`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`[seed-agents] /api/scheduler/tick ${res.status}`);
  }
}

const anthropicClient = USE_HAIKU ? new Anthropic() : null;

async function haikuRewriteThesis(
  persona: PersonaConfig,
  signal: Signal,
  decision: Decision,
  templated: string,
): Promise<string> {
  if (!anthropicClient) return templated;
  const userMessage = [
    `Real data just fetched from your sponsor API:`,
    JSON.stringify(signal.data, null, 2),
    ``,
    `Decision: ${decision.direction} @ confidence ${decision.confidence}, size $${decision.positionSizeUsd}.`,
    ``,
    `Reference template (use these exact numbers, but rewrite in your voice):`,
    templated,
    ``,
    `Rules: keep all the numbers from the template (they're real and load-bearing). Output a single paragraph (≤300 chars). No JSON, no fences, no preamble — just the thesis text.`,
  ].join("\n");

  try {
    const response = await anthropicClient.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 220,
      temperature: persona.temperature,
      system: [
        {
          type: "text",
          text: persona.systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    });
    recordSpend(response.usage);
    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") return templated;
    return textBlock.text.trim().slice(0, 1500) || templated;
  } catch (err) {
    console.warn(`[seed-agents] ${persona.name} haiku rewrite failed:`, err);
    return templated;
  }
}

async function buildPrediction(
  persona: PersonaConfig,
): Promise<PredictionRequest> {
  const signal = await persona.fetchSignal();
  const decision = clampDecision(persona.decide(signal));

  // Sanitize the cited URL — must come from the persona's allowed list.
  const sourceUrl = persona.sourceUrls.includes(signal.citedSourceUrl)
    ? signal.citedSourceUrl
    : persona.sourceUrls[0];

  let thesis = persona.template(signal, decision).slice(0, 1500);
  if (USE_HAIKU && dailySpendUsd < DAILY_SPEND_CAP_USD) {
    thesis = await haikuRewriteThesis(persona, signal, decision, thesis);
  }

  return {
    direction: decision.direction,
    confidence: decision.confidence,
    positionSizeUsd: decision.positionSizeUsd,
    thesis,
    sourceUrl,
  };
}

type PostResult = "ok" | "duplicate" | "error";

async function postPrediction(
  agent: SeedAgentKey,
  roundId: string,
  prediction: PredictionRequest,
): Promise<{ result: PostResult; response?: PredictionResponse }> {
  const res = await fetch(`${apiBaseUrl()}/api/rounds/${roundId}/predict`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${agent.apiKey}`,
    },
    body: JSON.stringify(prediction),
  });

  if (res.status === 409) return { result: "duplicate" };
  if (!res.ok) {
    console.warn(
      `[seed-agents] predict failed for ${agent.name}: ${res.status} ${await res.text()}`,
    );
    return { result: "error" };
  }
  return {
    result: "ok",
    response: (await res.json()) as PredictionResponse,
  };
}

async function tickAgent(
  agent: SeedAgentKey,
  persona: PersonaConfig,
  round: OpenRound,
) {
  let prediction: PredictionRequest;
  try {
    prediction = await buildPrediction(persona);
  } catch (err) {
    console.warn(`[seed-agents] ${persona.name} signal/decide failed:`, err);
    return;
  }
  const { result, response } = await postPrediction(agent, round.id, prediction);
  if (result === "ok" && response) {
    console.log(
      `[seed-agents] ${persona.name} → ${prediction.direction} $${prediction.positionSizeUsd} @ ${response.entryPriceCents}c (conf ${prediction.confidence}) ${prediction.sourceUrl}`,
    );
  }
}

function jitterMs(): number {
  return 60_000 + Math.floor(Math.random() * 30_000);
}

export async function runLoop(): Promise<void> {
  const agents = await loadOrRegisterAgents();
  const byName = new Map(agents.map((a) => [a.name, a]));

  console.log(
    `[seed-agents] loop starting, base=${apiBaseUrl()}, haiku=${USE_HAIKU ? "on" : "off (real-data templates)"}`,
  );

  while (true) {
    maybeResetDailyCounter();
    if (USE_HAIKU && dailySpendUsd >= DAILY_SPEND_CAP_USD) {
      console.warn(
        `[seed-agents] daily Haiku spend cap hit ($${dailySpendUsd.toFixed(2)} ≥ $${DAILY_SPEND_CAP_USD}); falling back to templates`,
      );
    }

    try {
      await tickScheduler();
    } catch (err) {
      console.warn(`[seed-agents] tickScheduler failed:`, err);
    }

    let round: OpenRound | null = null;
    try {
      round = await fetchOpenRound();
    } catch (err) {
      console.warn(`[seed-agents] fetchOpenRound failed:`, err);
    }

    if (round) {
      const personasShuffled = [...PERSONAS].sort(() => Math.random() - 0.5);
      for (const persona of personasShuffled) {
        const agent = byName.get(persona.name);
        if (!agent) continue;
        await tickAgent(agent, persona, round);
      }
      const haikuLine = USE_HAIKU
        ? ` haiku $${dailySpendUsd.toFixed(4)}/day`
        : "";
      console.log(`[seed-agents] cycle done${haikuLine}`);
    } else {
      console.log(`[seed-agents] no open round, idling`);
    }

    await new Promise((resolve) => setTimeout(resolve, jitterMs()));
  }
}
