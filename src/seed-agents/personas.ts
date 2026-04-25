export type Direction = "LONG" | "SHORT" | "HOLD";

export type Decision = {
  direction: Direction;
  confidence: number;
  positionSizeUsd: number;
};

export type Signal = {
  /** Source URL the persona's thesis cites for THIS reading. Picked from sourceUrls. */
  citedSourceUrl: string;
  /** Free-form payload — each persona shapes its own. */
  data: Record<string, unknown>;
};

export type PersonaConfig = {
  name: string;
  /** All sponsor URLs the persona may cite. citedSourceUrl in a Signal must come from this list. */
  sourceUrls: string[];
  /** Used only when ANTHROPIC_API_KEY is set and the runner opts into the Haiku path. */
  systemPrompt: string;
  temperature: number;
  fetchSignal(): Promise<Signal>;
  decide(signal: Signal): Decision;
  template(signal: Signal, decision: Decision): string;
};

const PYTH_FEEDS = {
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
} as const;

const WBTC_USDC_PAIR = "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35";

function clampSize(n: number): number {
  return Math.max(10, Math.min(1000, Math.round(n)));
}

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

// ----- PYTH PULSE ---------------------------------------------------------

type PythParsedItem = {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
};

type PythResponse = { parsed?: PythParsedItem[] };

function pythToFloat(price: string, expo: number): number {
  return Number(price) * Math.pow(10, expo);
}

async function fetchPythSignal(): Promise<Signal> {
  const ids = [PYTH_FEEDS.BTC, PYTH_FEEDS.ETH, PYTH_FEEDS.SOL]
    .map((id) => `ids[]=${id}`)
    .join("&");
  const url = `https://hermes.pyth.network/v2/updates/price/latest?${ids}&parsed=true`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Pyth Hermes ${res.status}`);
  const body = (await res.json()) as PythResponse;
  const items = body.parsed ?? [];
  const byId = new Map(items.map((it) => [it.id.replace(/^0x/, ""), it]));
  const btc = byId.get(PYTH_FEEDS.BTC.replace(/^0x/, ""));
  const eth = byId.get(PYTH_FEEDS.ETH.replace(/^0x/, ""));
  const sol = byId.get(PYTH_FEEDS.SOL.replace(/^0x/, ""));
  if (!btc || !eth || !sol) throw new Error("Pyth Hermes missing feeds");

  const btcPrice = pythToFloat(btc.price.price, btc.price.expo);
  const ethPrice = pythToFloat(eth.price.price, eth.price.expo);
  const solPrice = pythToFloat(sol.price.price, sol.price.expo);
  const btcConf = pythToFloat(btc.price.conf, btc.price.expo);
  const ethConf = pythToFloat(eth.price.conf, eth.price.expo);
  const solConf = pythToFloat(sol.price.conf, sol.price.expo);

  const confPct = (btcConf / btcPrice) * 100;
  const ethConfPct = (ethConf / ethPrice) * 100;
  const solConfPct = (solConf / solPrice) * 100;
  const avgConfPct = (confPct + ethConfPct + solConfPct) / 3;

  return {
    citedSourceUrl: PYTH_PULSE_SOURCES[0],
    data: { btcPrice, ethPrice, solPrice, confPct, avgConfPct, nFeeds: 3 },
  };
}

function pythDecide(signal: Signal): Decision {
  const d = signal.data as { confPct: number };
  const conf = d.confPct;
  if (conf <= 0.05) {
    return { direction: "LONG", confidence: 78, positionSizeUsd: 600 };
  }
  if (conf > 0.15) {
    return { direction: "SHORT", confidence: 70, positionSizeUsd: 450 };
  }
  return { direction: "HOLD", confidence: 35, positionSizeUsd: 50 };
}

function pythTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    btcPrice: number;
    ethPrice: number;
    solPrice: number;
    confPct: number;
    avgConfPct: number;
    nFeeds: number;
  };
  const action =
    decision.direction === "LONG"
      ? "Tight confidence band, cross-asset agreement — leaning LONG."
      : decision.direction === "SHORT"
        ? "Confidence is wide, oracles disagree. Stepping in SHORT before the move resolves."
        : "Mixed signal across feeds. Sitting this one out.";
  return [
    `BTC confidence on Pyth is ${d.confPct.toFixed(3)}% across ${d.nFeeds} feeds (BTC/ETH/SOL).`,
    `BTC $${d.btcPrice.toFixed(0)} | ETH $${d.ethPrice.toFixed(0)} | SOL $${d.solPrice.toFixed(2)}.`,
    `Avg cross-asset conf band: ${d.avgConfPct.toFixed(3)}%.`,
    action,
  ].join(" ");
}

const PYTH_PULSE_SOURCES = [
  "https://www.pyth.network/price-feeds/crypto-btc-usd",
  "https://www.pyth.network/price-feeds/crypto-eth-usd",
  "https://www.pyth.network/price-feeds/crypto-sol-usd",
  "https://www.pyth.network/",
  "https://hermes.pyth.network/docs",
];

export const PYTH_PULSE: PersonaConfig = {
  name: "Pyth Pulse",
  sourceUrls: PYTH_PULSE_SOURCES,
  temperature: 0.5,
  systemPrompt:
    "You are Pyth Pulse — a quant who watches Pyth Hermes oracle confidence bands across BTC, ETH, SOL. Tight confidence = consensus = directional conviction. Wide confidence = oracles disagree = wait or fade. Voice: terminal-feed, citing exact bps numbers. No hype.",
  fetchSignal: fetchPythSignal,
  decide: pythDecide,
  template: pythTemplate,
};

// ----- DEXSCREENER DEGEN --------------------------------------------------

type DexScreenerPair = {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken?: { symbol: string };
  quoteToken?: { symbol: string };
  priceUsd?: string;
  priceChange?: { h1?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
  url?: string;
};

function isWbtcStablePair(p: DexScreenerPair): boolean {
  const base = p.baseToken?.symbol?.toUpperCase() ?? "";
  const quote = p.quoteToken?.symbol?.toUpperCase() ?? "";
  const isWbtc = base === "WBTC" || quote === "WBTC";
  const isStable =
    quote === "USDC" ||
    base === "USDC" ||
    quote === "USDT" ||
    base === "USDT" ||
    quote === "DAI" ||
    base === "DAI";
  return isWbtc && isStable;
}

async function fetchDexscreenerSignal(): Promise<Signal> {
  const url = "https://api.dexscreener.com/latest/dex/search?q=WBTC";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`DexScreener ${res.status}`);
  const body = (await res.json()) as { pairs?: DexScreenerPair[] };
  const all = body.pairs ?? [];
  const wbtcStables = all.filter(isWbtcStablePair);
  // Prefer Ethereum L1 pairs first (matches the EntryStrip + chart on /arena), then any chain.
  const pool = wbtcStables.length > 0 ? wbtcStables : all;
  const top = pool
    .filter((p) => (p.liquidity?.usd ?? 0) > 0 && (p.volume?.h24 ?? 0) > 0)
    .sort((a, b) => {
      const aEth = a.chainId === "ethereum" ? 1 : 0;
      const bEth = b.chainId === "ethereum" ? 1 : 0;
      if (aEth !== bEth) return bEth - aEth;
      return (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0);
    })[0];
  if (!top) throw new Error("DexScreener returned no usable pair");

  const vol24 = top.volume?.h24 ?? 0;
  const liq = top.liquidity?.usd ?? 0;
  const h1 = top.priceChange?.h1 ?? 0;
  const turnover = liq > 0 ? vol24 / liq : 0;
  const dexName = top.dexId ?? "unknown";

  // Always cite a URL from the persona's allowed list — keeps the meta-thumbnail on-brand.
  return {
    citedSourceUrl: DEX_DEGEN_SOURCES[0],
    data: {
      vol24,
      liq,
      h1,
      turnover,
      dexName,
      chain: top.chainId,
      pair: `${top.baseToken?.symbol ?? "?"}/${top.quoteToken?.symbol ?? "?"}`,
    },
  };
}

function dexDecide(signal: Signal): Decision {
  const d = signal.data as { h1: number; turnover: number };
  if (d.h1 > 1 && d.turnover > 5) {
    return { direction: "LONG", confidence: 82, positionSizeUsd: 700 };
  }
  if (d.h1 < -1 && d.turnover > 3) {
    return { direction: "SHORT", confidence: 75, positionSizeUsd: 550 };
  }
  return { direction: "HOLD", confidence: 30, positionSizeUsd: 50 };
}

function dexTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    vol24: number;
    liq: number;
    h1: number;
    turnover: number;
    dexName: string;
    pair: string;
  };
  const turnoverPhrase =
    d.turnover > 5
      ? "Turnover is hot — that's real flow, not wash"
      : d.turnover > 1
        ? "Turnover is normal, no edge from flow alone"
        : "Liquidity sitting stale, no one's hitting bids";
  const action =
    decision.direction === "LONG"
      ? "SEND IT — bid stacked, breakout intact"
      : decision.direction === "SHORT"
        ? "Late longs are exit liquidity. Fading"
        : "Chop. Standing aside";
  return `${d.pair} on ${d.dexName} just printed ${fmtUsd(d.vol24)} on ${fmtUsd(d.liq)} liquidity, h1 ${fmtPct(d.h1)}. ${turnoverPhrase}. ${action}.`;
}

const DEX_DEGEN_SOURCES = [
  `https://dexscreener.com/ethereum/${WBTC_USDC_PAIR}`,
  "https://dexscreener.com/ethereum",
  "https://dexscreener.com/",
  "https://docs.dexscreener.com/api/reference",
  "https://dexscreener.com/trending",
];

export const DEXSCREENER_DEGEN: PersonaConfig = {
  name: "DexScreener Degen",
  sourceUrls: DEX_DEGEN_SOURCES,
  temperature: 0.95,
  systemPrompt:
    "You are DexScreener Degen — a momentum trader watching on-chain turnover (vol24/liquidity) and h1 price change for the top WBTC pair. High turnover + breakout = LONG. Reversal + spike = SHORT. Voice: short, imperative, all-caps for emphasis. Trader slang.",
  fetchSignal: fetchDexscreenerSignal,
  decide: dexDecide,
  template: dexTemplate,
};

// ----- COINGECKO WHALE ----------------------------------------------------

type CoingeckoCoinResponse = {
  market_data?: {
    market_cap_change_percentage_24h?: number;
    market_cap_change_24h?: number;
    market_cap_rank?: number;
  };
};

type CoingeckoGlobalResponse = {
  data?: {
    market_cap_percentage?: { btc?: number };
    market_cap_change_percentage_24h_usd?: number;
  };
};

async function fetchCoingeckoSignal(): Promise<Signal> {
  const [coinRes, globalRes] = await Promise.all([
    fetch(
      "https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false",
      { cache: "no-store" },
    ),
    fetch("https://api.coingecko.com/api/v3/global", { cache: "no-store" }),
  ]);
  if (!coinRes.ok) throw new Error(`Coingecko coins ${coinRes.status}`);
  if (!globalRes.ok) throw new Error(`Coingecko global ${globalRes.status}`);
  const coin = (await coinRes.json()) as CoingeckoCoinResponse;
  const global = (await globalRes.json()) as CoingeckoGlobalResponse;

  const capPct = coin.market_data?.market_cap_change_percentage_24h ?? 0;
  const dom = global.data?.market_cap_percentage?.btc ?? 0;
  const totalChange = global.data?.market_cap_change_percentage_24h_usd ?? 0;
  // Approximate dominance delta: if BTC outperformed total market, dominance went up
  const domDelta = capPct - totalChange;

  return {
    citedSourceUrl: COINGECKO_WHALE_SOURCES[0],
    data: { capPct, dom, totalChange, domDelta },
  };
}

function coingeckoDecide(signal: Signal): Decision {
  const d = signal.data as { capPct: number; domDelta: number };
  if (d.capPct > 1 && d.domDelta > 0) {
    return { direction: "LONG", confidence: 72, positionSizeUsd: 500 };
  }
  if (d.capPct < -1 && d.domDelta < 0) {
    return { direction: "SHORT", confidence: 68, positionSizeUsd: 400 };
  }
  return { direction: "HOLD", confidence: 35, positionSizeUsd: 75 };
}

function coingeckoTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    capPct: number;
    dom: number;
    domDelta: number;
  };
  const regime =
    decision.direction === "LONG"
      ? "BTC is leading on the macro tape — alts will follow, not lead"
      : decision.direction === "SHORT"
        ? "Cap shrinking AND dominance dropping — capital is leaving the asset, not rotating"
        : "Cap and dominance unaligned, no clean regime read";
  const action =
    decision.direction === "LONG"
      ? "Marginal LONG, sized for trend continuation"
      : decision.direction === "SHORT"
        ? "Asymmetric SHORT, conditional on macro lean holding"
        : "HOLD — respect the noise floor";
  const domDeltaStr =
    d.domDelta > 0 ? `+${d.domDelta.toFixed(2)}pp` : `${d.domDelta.toFixed(2)}pp`;
  return `BTC market cap moved ${fmtPct(d.capPct)} in 24h, dominance at ${d.dom.toFixed(2)}% (${domDeltaStr} vs total market). ${regime}. ${action}.`;
}

const COINGECKO_WHALE_SOURCES = [
  "https://www.coingecko.com/en/coins/bitcoin",
  "https://www.coingecko.com/en/global-charts",
  "https://www.coingecko.com/",
  "https://www.coingecko.com/en/coins/bitcoin/historical_data",
  "https://www.coingecko.com/en/categories/layer-1",
];

export const COINGECKO_WHALE: PersonaConfig = {
  name: "Coingecko Whale",
  sourceUrls: COINGECKO_WHALE_SOURCES,
  temperature: 0.4,
  systemPrompt:
    "You are Coingecko Whale — a macro-tape reader. You watch BTC market cap delta and dominance to identify regime. Cap up + dominance up = BTC leadership = LONG. Cap down + dominance down = capital flight = SHORT. Voice: measured, considered, slightly academic. Cite the prior.",
  fetchSignal: fetchCoingeckoSignal,
  decide: coingeckoDecide,
  template: coingeckoTemplate,
};

// ----- ALTERNATIVE CAT ----------------------------------------------------

type AlternativeFngResponse = {
  data?: Array<{ value: string; value_classification: string; timestamp: string }>;
};

async function fetchAlternativeSignal(): Promise<Signal> {
  const res = await fetch("https://api.alternative.me/fng/?limit=2", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Alternative.me ${res.status}`);
  const body = (await res.json()) as AlternativeFngResponse;
  const today = body.data?.[0];
  const yesterday = body.data?.[1];
  if (!today) throw new Error("Alternative.me returned no data");
  const value = Number(today.value);
  const yValue = yesterday ? Number(yesterday.value) : value;
  return {
    citedSourceUrl: ALTERNATIVE_CAT_SOURCES[0],
    data: {
      fgValue: value,
      fgLabel: today.value_classification,
      fgDelta: value - yValue,
    },
  };
}

function alternativeDecide(signal: Signal): Decision {
  const d = signal.data as { fgValue: number };
  if (d.fgValue <= 25) {
    return { direction: "LONG", confidence: 76, positionSizeUsd: 500 };
  }
  if (d.fgValue >= 75) {
    return { direction: "SHORT", confidence: 72, positionSizeUsd: 450 };
  }
  return { direction: "HOLD", confidence: 32, positionSizeUsd: 60 };
}

function alternativeTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    fgValue: number;
    fgLabel: string;
    fgDelta: number;
  };
  const interp =
    d.fgValue <= 25
      ? "Crowd is panicking. Panic is a setup, not a thesis"
      : d.fgValue >= 75
        ? "Everyone's a genius. Everyone's never right at the same time"
        : "Sentiment noise, no extreme to fade";
  const action =
    decision.direction === "LONG"
      ? "Fading the fear. Long here."
      : decision.direction === "SHORT"
        ? "Fading the euphoria. Short here."
        : "No edge in fading nothing.";
  const deltaStr =
    d.fgDelta > 0 ? `+${d.fgDelta}` : `${d.fgDelta}`;
  return `Fear & Greed at ${d.fgValue} (${d.fgLabel}, ${deltaStr} vs yesterday). ${interp}. The obvious trade is the wrong trade. ${action}`;
}

const ALTERNATIVE_CAT_SOURCES = [
  "https://alternative.me/crypto/fear-and-greed-index/",
  "https://alternative.me/crypto/",
  "https://alternative.me/",
  "https://api.alternative.me/fng/",
  "https://alternative.me/crypto/fear-and-greed-index/api/",
];

export const ALTERNATIVE_CAT: PersonaConfig = {
  name: "Alternative Cat",
  sourceUrls: ALTERNATIVE_CAT_SOURCES,
  temperature: 0.85,
  systemPrompt:
    "You are Alternative Cat — a contrarian who fades sentiment extremes via the Crypto Fear & Greed index. ≤25 (extreme fear) = fade panic = LONG. ≥75 (extreme greed) = fade euphoria = SHORT. 26-74 = no edge. Voice: dry, skeptical, slightly amused. The obvious trade is the wrong trade.",
  fetchSignal: fetchAlternativeSignal,
  decide: alternativeDecide,
  template: alternativeTemplate,
};

// ----- EXPORTS ------------------------------------------------------------

export const PERSONAS: PersonaConfig[] = [
  PYTH_PULSE,
  DEXSCREENER_DEGEN,
  COINGECKO_WHALE,
  ALTERNATIVE_CAT,
];

export function getPersonaByName(name: string): PersonaConfig | undefined {
  return PERSONAS.find((p) => p.name === name);
}

export function clampDecision(decision: Decision): Decision {
  return {
    direction: decision.direction,
    confidence: clampConfidence(decision.confidence),
    positionSizeUsd: clampSize(decision.positionSizeUsd),
  };
}
