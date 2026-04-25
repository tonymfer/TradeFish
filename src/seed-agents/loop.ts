import { promises as fs } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { PERSONAS, type Direction, type PersonaConfig } from "./personas";

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

  const cost =
    (input / 1_000_000) * HAIKU_INPUT_PER_MTOK_USD +
    (output / 1_000_000) * HAIKU_OUTPUT_PER_MTOK_USD +
    (cacheWrite / 1_000_000) * HAIKU_CACHE_WRITE_PER_MTOK_USD +
    (cacheRead / 1_000_000) * HAIKU_CACHE_READ_PER_MTOK_USD;

  dailySpendUsd += cost;
}

async function loadOrRegisterAgents(): Promise<SeedAgentKey[]> {
  try {
    const raw = await fs.readFile(KEYS_FILE, "utf8");
    const parsed = JSON.parse(raw) as SeedAgentKey[];
    if (parsed.length === PERSONAS.length) {
      console.log(`[seed-agents] loaded ${parsed.length} keys from ${KEYS_FILE}`);
      return parsed;
    }
    console.log(`[seed-agents] keys file has ${parsed.length} agents, expected ${PERSONAS.length} — re-registering`);
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
      throw new Error(`register failed for ${persona.name}: ${res.status} ${await res.text()}`);
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
  const res = await fetch(`${apiBaseUrl()}/api/rounds/open`, { cache: "no-store" });
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
  // The runner is the off-Vercel scheduler driver in production: Vercel
  // Hobby crons can't run minute-by-minute, so each loop cycle pokes the
  // tick endpoint. The route is idempotent (no-op when nothing to do).
  const res = await fetch(`${apiBaseUrl()}/api/scheduler/tick`, {
    method: "POST",
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`[seed-agents] /api/scheduler/tick ${res.status}`);
  }
}

const anthropicClient = new Anthropic();

function buildUserMessage(round: OpenRound): string {
  const priceUsd = (round.openPriceCents / 100).toFixed(2);
  const ageSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(round.openedAt).getTime()) / 1000)
  );
  return [
    `Asset: ${round.asset}`,
    `Round opened at: ${round.openedAt} (${ageSec}s ago)`,
    `Open price: $${priceUsd}`,
    ``,
    `This round will settle in ~5 minutes from open. Make your call now.`,
    `Output JSON only — direction, confidence, positionSizeUsd, thesis, sourceUrl.`,
  ].join("\n");
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function parsePrediction(text: string, persona: PersonaConfig): PredictionRequest {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`no JSON object in model output: ${text.slice(0, 200)}`);
  }
  const slice = candidate.slice(start, end + 1);
  const parsed = JSON.parse(slice) as Partial<PredictionRequest>;

  const direction = parsed.direction;
  if (direction !== "LONG" && direction !== "SHORT" && direction !== "HOLD") {
    throw new Error(`invalid direction: ${String(direction)}`);
  }

  const confidence = clampInt(Number(parsed.confidence ?? 0), 0, 100);
  const positionSizeUsd = clampInt(Number(parsed.positionSizeUsd ?? 0), 10, 1000);

  const thesisRaw = typeof parsed.thesis === "string" ? parsed.thesis : "";
  const thesis = thesisRaw.slice(0, 1500);

  let sourceUrl = typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : "";
  if (!persona.sourceUrls.includes(sourceUrl)) {
    sourceUrl = persona.sourceUrls[0];
  }

  if (!thesis) throw new Error("empty thesis");

  return { direction, confidence, positionSizeUsd, thesis, sourceUrl };
}

async function generatePrediction(
  persona: PersonaConfig,
  round: OpenRound
): Promise<PredictionRequest> {
  const userMessage = buildUserMessage(round);

  const response = await anthropicClient.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 800,
    temperature: persona.temperature,
    system: [
      {
        type: "text",
        text: persona.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: `Allowed source URLs (pick exactly one):\n${persona.sourceUrls.map((u) => `- ${u}`).join("\n")}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  recordSpend(response.usage);

  const textBlock = response.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("no text block in response");
  }
  return parsePrediction(textBlock.text, persona);
}

type PostResult = "ok" | "duplicate" | "error";

async function postPrediction(
  agent: SeedAgentKey,
  roundId: string,
  prediction: PredictionRequest
): Promise<{ result: PostResult; response?: PredictionResponse }> {
  const res = await fetch(`${apiBaseUrl()}/api/rounds/${roundId}/predict`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${agent.apiKey}`,
    },
    body: JSON.stringify(prediction),
  });

  if (res.status === 409) {
    return { result: "duplicate" };
  }
  if (!res.ok) {
    console.warn(
      `[seed-agents] predict failed for ${agent.name}: ${res.status} ${await res.text()}`
    );
    return { result: "error" };
  }
  return { result: "ok", response: (await res.json()) as PredictionResponse };
}

async function tickAgent(agent: SeedAgentKey, persona: PersonaConfig, round: OpenRound) {
  let prediction: PredictionRequest;
  try {
    prediction = await generatePrediction(persona, round);
  } catch (err) {
    console.warn(`[seed-agents] ${persona.name} generation failed:`, err);
    return;
  }
  const { result, response } = await postPrediction(agent, round.id, prediction);
  if (result === "ok" && response) {
    console.log(
      `[seed-agents] ${persona.name} → ${prediction.direction} ${prediction.positionSizeUsd}$ @ ${response.entryPriceCents}c (conf ${prediction.confidence})`
    );
  }
}

function jitterMs(): number {
  return 60_000 + Math.floor(Math.random() * 30_000);
}

export async function runLoop(): Promise<void> {
  const agents = await loadOrRegisterAgents();
  const byName = new Map(agents.map((a) => [a.name, a]));

  console.log(`[seed-agents] loop starting, base=${apiBaseUrl()}`);

  while (true) {
    maybeResetDailyCounter();
    if (dailySpendUsd >= DAILY_SPEND_CAP_USD) {
      console.warn(
        `[seed-agents] daily spend cap hit ($${dailySpendUsd.toFixed(2)} ≥ $${DAILY_SPEND_CAP_USD}); halting`
      );
      return;
    }

    // Drive the scheduler each cycle so prod (Hobby tier, no Vercel cron)
    // still opens / settles rounds without an external cron service.
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
      console.log(
        `[seed-agents] cycle done — daily spend $${dailySpendUsd.toFixed(4)}`
      );
    } else {
      console.log(`[seed-agents] no open round, idling`);
    }

    const delay = jitterMs();
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
