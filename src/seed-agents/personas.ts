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

const PYTH_BTC_FEED =
  "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
const PYTH_ETH_FEED =
  "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace";
const PYTH_SOL_FEED =
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const WBTC_USDC_PAIR = "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35";
// PancakeSwap V3 WBNB/USDT (0.05%) on BSC — the deepest PCS pool, used as the
// canonical retail-flow gauge. (Constant kept under the historical CAKE_ name
// is intentionally renamed to reflect the real pair.)
const WBNB_USDT_PAIR_BSC = "0x172fcD41E0913e95784454622d1c3724f546f849";

function clampSize(n: number): number {
  return Math.max(10, Math.min(1000, Math.round(n)));
}

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number, digits = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function pythToFloat(price: string, expo: number): number {
  return Number(price) * Math.pow(10, expo);
}

type PythParsedItem = {
  id: string;
  price: { price: string; conf: string; expo: number; publish_time: number };
};

async function fetchPyth(ids: string[]): Promise<Map<string, number>> {
  const qs = ids.map((id) => `ids[]=${id}`).join("&");
  const url = `https://hermes.pyth.network/v2/updates/price/latest?${qs}&parsed=true`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Pyth Hermes ${res.status}`);
  const body = (await res.json()) as { parsed?: PythParsedItem[] };
  const out = new Map<string, number>();
  for (const it of body.parsed ?? []) {
    out.set(it.id.replace(/^0x/, ""), pythToFloat(it.price.price, it.price.expo));
  }
  return out;
}

// ----- 1. FLOCK ENSEMBLE --------------------------------------------------

type CgSimplePriceResp = Record<
  string,
  { usd?: number; usd_24h_change?: number }
>;

type DexPair = {
  baseToken?: { symbol: string };
  quoteToken?: { symbol: string };
  priceUsd?: string;
  priceChange?: { h1?: number; h24?: number };
  volume?: { h24?: number };
  liquidity?: { usd?: number };
};

async function fetchFlockSignal(): Promise<Signal> {
  // Three independent oracles vote on BTC short-term direction.
  // 1) Pyth BTC vs. ETH cross-asset confidence (use BTC price drift)
  // 2) Coingecko BTC 24h % change
  // 3) DexScreener WBTC/USDC h1 % change
  const [pyth, cg, dex] = await Promise.allSettled([
    fetchPyth([PYTH_BTC_FEED, PYTH_ETH_FEED, PYTH_SOL_FEED]),
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true",
      { cache: "no-store" },
    ).then(async (r) => {
      if (!r.ok) throw new Error(`Coingecko ${r.status}`);
      return (await r.json()) as CgSimplePriceResp;
    }),
    fetch(
      `https://api.dexscreener.com/latest/dex/pairs/ethereum/${WBTC_USDC_PAIR}`,
      { cache: "no-store" },
    ).then(async (r) => {
      if (!r.ok) throw new Error(`DexScreener ${r.status}`);
      return (await r.json()) as { pair?: DexPair; pairs?: DexPair[] };
    }),
  ]);

  let pythBtc = 0;
  let pythSrcOk = false;
  if (pyth.status === "fulfilled") {
    const v = pyth.value.get(PYTH_BTC_FEED.replace(/^0x/, ""));
    if (typeof v === "number") {
      pythBtc = v;
      pythSrcOk = true;
    }
  }

  let cg24h = 0;
  let cgSrcOk = false;
  if (cg.status === "fulfilled") {
    const c = cg.value.bitcoin;
    if (c && typeof c.usd_24h_change === "number") {
      cg24h = c.usd_24h_change;
      cgSrcOk = true;
    }
  }

  let dexH1 = 0;
  let dexSrcOk = false;
  if (dex.status === "fulfilled") {
    const top = dex.value.pair ?? dex.value.pairs?.[0];
    if (top && typeof top.priceChange?.h1 === "number") {
      dexH1 = top.priceChange.h1;
      dexSrcOk = true;
    }
  }

  const okCount = (pythSrcOk ? 1 : 0) + (cgSrcOk ? 1 : 0) + (dexSrcOk ? 1 : 0);
  if (okCount === 0) throw new Error("FLOCK: all 3 oracles failed");

  const votes: Array<"up" | "down" | "flat"> = [];
  if (cgSrcOk) votes.push(cg24h > 0.3 ? "up" : cg24h < -0.3 ? "down" : "flat");
  if (dexSrcOk) votes.push(dexH1 > 0.3 ? "up" : dexH1 < -0.3 ? "down" : "flat");
  // Pyth is a snapshot price — only inform context, not a vote on its own.

  const ups = votes.filter((v) => v === "up").length;
  const downs = votes.filter((v) => v === "down").length;
  const total = votes.length;

  return {
    citedSourceUrl: FLOCK_SOURCES[0],
    data: {
      btcPrice: pythBtc,
      cg24h,
      dexH1,
      ups,
      downs,
      total,
      okCount,
    },
  };
}

function flockDecide(signal: Signal): Decision {
  const d = signal.data as { ups: number; downs: number; total: number };
  if (d.total === 0) return { direction: "HOLD", confidence: 25, positionSizeUsd: 50 };
  if (d.ups >= 2 && d.ups > d.downs) {
    return { direction: "LONG", confidence: 80, positionSizeUsd: 600 };
  }
  if (d.downs >= 2 && d.downs > d.ups) {
    return { direction: "SHORT", confidence: 78, positionSizeUsd: 550 };
  }
  if (d.ups === 1 && d.downs === 0) {
    return { direction: "LONG", confidence: 55, positionSizeUsd: 250 };
  }
  if (d.downs === 1 && d.ups === 0) {
    return { direction: "SHORT", confidence: 55, positionSizeUsd: 250 };
  }
  return { direction: "HOLD", confidence: 32, positionSizeUsd: 60 };
}

function flockTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    btcPrice: number;
    cg24h: number;
    dexH1: number;
    ups: number;
    downs: number;
    total: number;
    okCount: number;
  };
  const verdict =
    decision.direction === "LONG"
      ? `${d.ups}/${d.total} oracles up — ensemble leans LONG`
      : decision.direction === "SHORT"
        ? `${d.downs}/${d.total} oracles down — ensemble leans SHORT`
        : `oracles split (${d.ups} up / ${d.downs} down) — ensemble holds`;
  return `Federated read across ${d.okCount} oracles. BTC $${d.btcPrice.toFixed(0)} (Pyth) | 24h ${fmtPct(d.cg24h)} (Coingecko) | h1 ${fmtPct(d.dexH1)} (DexScreener WBTC/USDC). ${verdict}.`;
}

const FLOCK_SOURCES = [
  "https://flock.io",
  "https://www.flock.io",
  "https://train.flock.io",
  "https://docs.flock.io",
];

export const FLOCK_ENSEMBLE: PersonaConfig = {
  name: "FLOCK Ensemble",
  sourceUrls: FLOCK_SOURCES,
  temperature: 0.45,
  systemPrompt:
    "You are FLOCK Ensemble — a federated-learning trader that aggregates signals from multiple oracles (Pyth, Coingecko, DexScreener) and votes only with consensus. ≥2/3 sources agreeing = directional vote. Split = HOLD. Voice: measured, multi-model, scientific. Cite the count.",
  fetchSignal: fetchFlockSignal,
  decide: flockDecide,
  template: flockTemplate,
};

// ----- 2. NANSEN SMART MONEY ---------------------------------------------

type CgGlobalResp = {
  data?: {
    total_market_cap?: { usd?: number };
    market_cap_change_percentage_24h_usd?: number;
    market_cap_percentage?: { usdt?: number; usdc?: number; btc?: number };
  };
};

async function fetchNansenSignal(): Promise<Signal> {
  const res = await fetch("https://api.coingecko.com/api/v3/global", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Coingecko global ${res.status}`);
  const body = (await res.json()) as CgGlobalResp;
  const total = body.data?.total_market_cap?.usd ?? 0;
  const totalChange = body.data?.market_cap_change_percentage_24h_usd ?? 0;
  const usdtDom = body.data?.market_cap_percentage?.usdt ?? 0;
  const usdcDom = body.data?.market_cap_percentage?.usdc ?? 0;
  const btcDom = body.data?.market_cap_percentage?.btc ?? 0;
  const stableDom = usdtDom + usdcDom;
  // Stablecoin dominance UP = capital sitting idle = risk-off (smart money waiting)
  // Stablecoin dominance DOWN with total cap UP = capital deployed into risk = LONG signal
  return {
    citedSourceUrl: NANSEN_SOURCES[0],
    data: {
      total,
      totalChange,
      stableDom,
      btcDom,
    },
  };
}

function nansenDecide(signal: Signal): Decision {
  const d = signal.data as {
    totalChange: number;
    stableDom: number;
    btcDom: number;
  };
  // LONG: total cap up + stable dominance below historical median (~6.5%)
  if (d.totalChange > 0.5 && d.stableDom < 6.5) {
    return { direction: "LONG", confidence: 76, positionSizeUsd: 600 };
  }
  // SHORT: total cap down + stable dominance climbing above 7%
  if (d.totalChange < -0.5 && d.stableDom > 7) {
    return { direction: "SHORT", confidence: 72, positionSizeUsd: 500 };
  }
  return { direction: "HOLD", confidence: 35, positionSizeUsd: 80 };
}

function nansenTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    total: number;
    totalChange: number;
    stableDom: number;
    btcDom: number;
  };
  const flow =
    decision.direction === "LONG"
      ? "Stablecoin dominance compressing while total cap expands — smart money is deployed, not parked"
      : decision.direction === "SHORT"
        ? "Stables fattening as total cap shrinks — smart money has rotated to safety"
        : "Stable dominance and total cap signals unaligned — institutional read is muddy";
  return `Crypto total mcap ${fmtUsd(d.total)} (${fmtPct(d.totalChange)} 24h). Stablecoin dominance ${d.stableDom.toFixed(2)}%, BTC dominance ${d.btcDom.toFixed(2)}%. ${flow}.`;
}

const NANSEN_SOURCES = [
  "https://www.nansen.ai",
  "https://nansen.ai",
  "https://www.nansen.ai/research",
  "https://docs.nansen.ai",
];

export const NANSEN_SMART_MONEY: PersonaConfig = {
  name: "NANSEN Smart Money",
  sourceUrls: NANSEN_SOURCES,
  temperature: 0.4,
  systemPrompt:
    "You are NANSEN Smart Money — an institutional flow analyst. You read stablecoin dominance and total market cap as a smart-money positioning gauge. Stables down + total cap up = capital deployed = LONG. Stables up + total cap down = flight to safety = SHORT. Voice: institutional, considered, references 'smart money' positioning. Avoid retail slang.",
  fetchSignal: fetchNansenSignal,
  decide: nansenDecide,
  template: nansenTemplate,
};

// ----- 3. VIRTUALS SENTIMENT ---------------------------------------------

type CgCategoryItem = {
  id?: string;
  name?: string;
  market_cap?: number;
  market_cap_change_24h?: number;
};

async function fetchVirtualsSignal(): Promise<Signal> {
  const [tokenRes, catRes] = await Promise.allSettled([
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=virtual-protocol&vs_currencies=usd&include_24hr_change=true",
      { cache: "no-store" },
    ),
    fetch("https://api.coingecko.com/api/v3/coins/categories", {
      cache: "no-store",
    }),
  ]);

  let virtualPrice = 0;
  let virtual24h = 0;
  let tokenOk = false;
  if (tokenRes.status === "fulfilled" && tokenRes.value.ok) {
    const body = (await tokenRes.value.json()) as CgSimplePriceResp;
    const v = body["virtual-protocol"] ?? body["virtuals-protocol"];
    if (v && typeof v.usd === "number") {
      virtualPrice = v.usd;
      virtual24h = v.usd_24h_change ?? 0;
      tokenOk = true;
    }
  }

  let agentCat24h = 0;
  let agentCatName = "";
  let catOk = false;
  if (catRes.status === "fulfilled" && catRes.value.ok) {
    const cats = (await catRes.value.json()) as CgCategoryItem[];
    const aiCat = cats.find((c) => c.id === "ai-agents");
    if (aiCat) {
      agentCat24h = aiCat.market_cap_change_24h ?? 0;
      agentCatName = aiCat.name ?? "AI Agents";
      catOk = true;
    }
  }

  if (!tokenOk && !catOk) throw new Error("VIRTUALS: both data sources failed");

  return {
    citedSourceUrl: VIRTUALS_SOURCES[0],
    data: {
      virtualPrice,
      virtual24h,
      agentCat24h,
      agentCatName,
      tokenOk,
      catOk,
    },
  };
}

function virtualsDecide(signal: Signal): Decision {
  const d = signal.data as {
    virtual24h: number;
    agentCat24h: number;
    tokenOk: boolean;
    catOk: boolean;
  };
  const tokenSignal = d.tokenOk ? Math.sign(d.virtual24h) : 0;
  const catSignal = d.catOk ? Math.sign(d.agentCat24h) : 0;
  const score = tokenSignal + catSignal;
  if (score >= 1 && d.virtual24h > 1) {
    return { direction: "LONG", confidence: 70, positionSizeUsd: 500 };
  }
  if (score <= -1 && d.virtual24h < -1) {
    return { direction: "SHORT", confidence: 68, positionSizeUsd: 450 };
  }
  return { direction: "HOLD", confidence: 33, positionSizeUsd: 70 };
}

function virtualsTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    virtualPrice: number;
    virtual24h: number;
    agentCat24h: number;
    agentCatName: string;
    tokenOk: boolean;
    catOk: boolean;
  };
  const tokenLine = d.tokenOk
    ? `$VIRTUAL at $${d.virtualPrice.toFixed(4)} (${fmtPct(d.virtual24h)} 24h)`
    : `$VIRTUAL feed lagged`;
  const catLine = d.catOk
    ? `${d.agentCatName || "AI agent"} sector ${fmtPct(d.agentCat24h)} 24h`
    : `agent sector data unavailable`;
  const vibe =
    decision.direction === "LONG"
      ? "Narrative is alive — agent capital is bidding"
      : decision.direction === "SHORT"
        ? "Narrative cooling — agents and degens both unwinding"
        : "No narrative thrust — sentiment chop";
  return `${tokenLine}. ${catLine}. ${vibe}.`;
}

const VIRTUALS_SOURCES = [
  "https://virtuals.io",
  "https://app.virtuals.io",
  "https://docs.virtuals.io",
];

export const VIRTUALS_SENTIMENT: PersonaConfig = {
  name: "VIRTUALS Sentiment",
  sourceUrls: VIRTUALS_SOURCES,
  temperature: 0.85,
  systemPrompt:
    "You are VIRTUALS Sentiment — a narrative trader. You read the AI-agent sector ($VIRTUAL token + agent category mcap) as a leading sentiment proxy. Agent narrative pumping = risk-on broadly = LONG. Agent narrative dumping = SHORT. Voice: narrative-first, vibes-aware, references the agent sector explicitly.",
  fetchSignal: fetchVirtualsSignal,
  decide: virtualsDecide,
  template: virtualsTemplate,
};

// ----- 4. PCS DEPTH READER -----------------------------------------------

async function fetchPcsSignal(): Promise<Signal> {
  // PancakeSwap V3 WBNB/USDT on BSC — the deepest PCS pool, top retail-flow gauge.
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/pairs/bsc/${WBNB_USDT_PAIR_BSC}`,
    { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`DexScreener PCS ${res.status}`);
  const body = (await res.json()) as { pair?: DexPair; pairs?: DexPair[] };
  const top = body.pair ?? body.pairs?.[0];
  if (!top) throw new Error("PCS: no pair returned");

  const liq = top.liquidity?.usd ?? 0;
  const vol24 = top.volume?.h24 ?? 0;
  const h24 = top.priceChange?.h24 ?? 0;
  const h1 = top.priceChange?.h1 ?? 0;
  const turnover = liq > 0 ? vol24 / liq : 0;
  const bnbPrice = top.priceUsd ? Number(top.priceUsd) : 0;
  const baseSym = top.baseToken?.symbol ?? "WBNB";
  const quoteSym = top.quoteToken?.symbol ?? "USDT";

  return {
    citedSourceUrl: PCS_SOURCES[0],
    data: { liq, vol24, h24, h1, turnover, bnbPrice, baseSym, quoteSym },
  };
}

function pcsDecide(signal: Signal): Decision {
  const d = signal.data as { turnover: number; h24: number; h1: number };
  // High turnover + positive 24h = retail risk-on = LONG
  if (d.turnover > 2 && d.h24 > 1) {
    return { direction: "LONG", confidence: 72, positionSizeUsd: 550 };
  }
  // Low turnover + negative 24h = retail capitulation = SHORT
  if (d.turnover < 0.5 && d.h24 < -1) {
    return { direction: "SHORT", confidence: 68, positionSizeUsd: 450 };
  }
  return { direction: "HOLD", confidence: 33, positionSizeUsd: 70 };
}

function pcsTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    liq: number;
    vol24: number;
    h24: number;
    h1: number;
    turnover: number;
    bnbPrice: number;
    baseSym: string;
    quoteSym: string;
  };
  const flow =
    decision.direction === "LONG"
      ? "BSC retail is bidding — turnover hot, liquidity active"
      : decision.direction === "SHORT"
        ? "BSC retail tapping out — turnover dead, depth bleeding"
        : "Mid-range turnover — no edge from BSC flow alone";
  return `${d.baseSym}/${d.quoteSym} on PCS V3: $${d.bnbPrice.toFixed(2)} (${fmtPct(d.h24)} 24h, ${fmtPct(d.h1)} 1h). Vol24 ${fmtUsd(d.vol24)} on ${fmtUsd(d.liq)} liq → turnover ${d.turnover.toFixed(2)}x. ${flow}.`;
}

const PCS_SOURCES = [
  "https://pancakeswap.finance",
  "https://pancakeswap.finance/info",
  `https://dexscreener.com/bsc/${WBNB_USDT_PAIR_BSC}`,
  "https://docs.pancakeswap.finance",
];

export const PCS_DEPTH: PersonaConfig = {
  name: "PCS Depth Reader",
  sourceUrls: PCS_SOURCES,
  temperature: 0.55,
  systemPrompt:
    "You are PCS Depth Reader — a DEX liquidity analyst on PancakeSwap. You read the deepest PCS V3 pool (WBNB/USDT) depth + 24h turnover as a BSC-retail risk-appetite gauge. High turnover + green 24h = retail risk-on = LONG. Dead turnover + red 24h = retail capitulation = SHORT. Voice: DEX-pilled, BSC-flow native. Reference turnover ratios and depth.",
  fetchSignal: fetchPcsSignal,
  decide: pcsDecide,
  template: pcsTemplate,
};

// ----- 5. BANANA GUN SNIPER ----------------------------------------------

async function fetchBananaGunSignal(): Promise<Signal> {
  const [bananaRes, trendRes] = await Promise.allSettled([
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=banana-gun&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true",
      { cache: "no-store" },
    ),
    fetch("https://api.coingecko.com/api/v3/search/trending", {
      cache: "no-store",
    }),
  ]);

  let bananaPrice = 0;
  let banana24h = 0;
  let bananaVol = 0;
  let bananaOk = false;
  if (bananaRes.status === "fulfilled" && bananaRes.value.ok) {
    const body = (await bananaRes.value.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number; usd_24h_vol?: number }
    >;
    const b = body["banana-gun"];
    if (b && typeof b.usd === "number") {
      bananaPrice = b.usd;
      banana24h = b.usd_24h_change ?? 0;
      bananaVol = b.usd_24h_vol ?? 0;
      bananaOk = true;
    }
  }

  let trendingCount = 0;
  let trendingOk = false;
  if (trendRes.status === "fulfilled" && trendRes.value.ok) {
    const body = (await trendRes.value.json()) as {
      coins?: Array<{ item?: { name?: string } }>;
    };
    trendingCount = (body.coins ?? []).length;
    trendingOk = true;
  }

  if (!bananaOk && !trendingOk) {
    throw new Error("BANANA GUN: both data sources failed");
  }

  return {
    citedSourceUrl: BANANAGUN_SOURCES[0],
    data: {
      bananaPrice,
      banana24h,
      bananaVol,
      trendingCount,
      bananaOk,
      trendingOk,
    },
  };
}

function bananaGunDecide(signal: Signal): Decision {
  const d = signal.data as {
    banana24h: number;
    trendingCount: number;
    bananaOk: boolean;
  };
  // $BANANA up = sniping is profitable = degen risk-on = LONG
  if (d.bananaOk && d.banana24h > 3) {
    return { direction: "LONG", confidence: 78, positionSizeUsd: 650 };
  }
  if (d.bananaOk && d.banana24h < -3) {
    return { direction: "SHORT", confidence: 74, positionSizeUsd: 500 };
  }
  // Trending count >12 = market hot enough to snipe
  if (d.trendingCount >= 12) {
    return { direction: "LONG", confidence: 58, positionSizeUsd: 300 };
  }
  return { direction: "HOLD", confidence: 30, positionSizeUsd: 50 };
}

function bananaGunTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    bananaPrice: number;
    banana24h: number;
    bananaVol: number;
    trendingCount: number;
    bananaOk: boolean;
    trendingOk: boolean;
  };
  const bananaLine = d.bananaOk
    ? `$BANANA $${d.bananaPrice.toFixed(3)} (${fmtPct(d.banana24h)} 24h, vol ${fmtUsd(d.bananaVol)})`
    : `$BANANA feed lagged`;
  const trendLine = d.trendingOk
    ? `${d.trendingCount} coins trending on Coingecko`
    : `trend feed lagged`;
  const action =
    decision.direction === "LONG"
      ? "SNIPERS EATING. Sending it"
      : decision.direction === "SHORT"
        ? "Sniper PnL bleeding. Cutting risk"
        : "Mempool quiet. Standing aside";
  return `${bananaLine}. ${trendLine}. ${action}.`;
}

const BANANAGUN_SOURCES = [
  "https://bananagun.io",
  "https://www.bananagun.io",
  "https://t.me/BananaGunSniper_bot",
  "https://docs.bananagun.io",
];

export const BANANA_GUN_SNIPER: PersonaConfig = {
  name: "BANANA GUN Sniper",
  sourceUrls: BANANAGUN_SOURCES,
  temperature: 1.0,
  systemPrompt:
    "You are BANANA GUN Sniper — a fresh-launch sniping degen. You read $BANANA token momentum + trending coin count as a sniper-PnL gauge. $BANANA up = sniping is profitable = degen risk-on = LONG broadly. $BANANA down = sniper PnL bleeding = SHORT. Voice: fast, telegram-bot energy, occasional ALL-CAPS for emphasis, slang OK.",
  fetchSignal: fetchBananaGunSignal,
  decide: bananaGunDecide,
  template: bananaGunTemplate,
};

// ----- 6. BASE RISK OFFICER ----------------------------------------------

type LlamaChain = {
  name?: string;
  tvl?: number;
  tokenSymbol?: string | null;
  gecko_id?: string | null;
  cmcId?: string | null;
};

async function fetchBaseSignal(): Promise<Signal> {
  const [chainsRes, ethGasRes] = await Promise.allSettled([
    fetch("https://api.llama.fi/v2/chains", { cache: "no-store" }),
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true",
      { cache: "no-store" },
    ),
  ]);

  let baseTvl = 0;
  let totalTvl = 0;
  let baseSharePct = 0;
  let chainsOk = false;
  if (chainsRes.status === "fulfilled" && chainsRes.value.ok) {
    const arr = (await chainsRes.value.json()) as LlamaChain[];
    const base = arr.find((c) => (c.name ?? "").toLowerCase() === "base");
    if (base) {
      baseTvl = base.tvl ?? 0;
      totalTvl = arr.reduce((s, c) => s + (c.tvl ?? 0), 0);
      baseSharePct = totalTvl > 0 ? (baseTvl / totalTvl) * 100 : 0;
      chainsOk = true;
    }
  }

  let ethPrice = 0;
  let eth24h = 0;
  let ethOk = false;
  if (ethGasRes.status === "fulfilled" && ethGasRes.value.ok) {
    const body = (await ethGasRes.value.json()) as CgSimplePriceResp;
    const e = body.ethereum;
    if (e && typeof e.usd === "number") {
      ethPrice = e.usd;
      eth24h = e.usd_24h_change ?? 0;
      ethOk = true;
    }
  }

  if (!chainsOk && !ethOk) throw new Error("BASE: both data sources failed");

  return {
    citedSourceUrl: BASE_SOURCES[0],
    data: {
      baseTvl,
      totalTvl,
      baseSharePct,
      ethPrice,
      eth24h,
      chainsOk,
      ethOk,
    },
  };
}

function baseDecide(signal: Signal): Decision {
  const d = signal.data as {
    baseSharePct: number;
    eth24h: number;
    chainsOk: boolean;
    ethOk: boolean;
  };
  // LONG: Base TVL share >2% AND ETH 24h up — L2 healthy + ETH bid
  if (d.chainsOk && d.baseSharePct > 2 && d.ethOk && d.eth24h > 0.5) {
    return { direction: "LONG", confidence: 70, positionSizeUsd: 500 };
  }
  // SHORT: ETH bleeding hard — L2 tape will follow
  if (d.ethOk && d.eth24h < -2) {
    return { direction: "SHORT", confidence: 68, positionSizeUsd: 450 };
  }
  return { direction: "HOLD", confidence: 38, positionSizeUsd: 90 };
}

function baseTemplate(signal: Signal, decision: Decision): string {
  const d = signal.data as {
    baseTvl: number;
    totalTvl: number;
    baseSharePct: number;
    ethPrice: number;
    eth24h: number;
    chainsOk: boolean;
    ethOk: boolean;
  };
  const tvlLine = d.chainsOk
    ? `Base TVL ${fmtUsd(d.baseTvl)} (${d.baseSharePct.toFixed(2)}% of all-chain ${fmtUsd(d.totalTvl)})`
    : `Base TVL feed lagged`;
  const ethLine = d.ethOk
    ? `ETH $${d.ethPrice.toFixed(0)} (${fmtPct(d.eth24h)} 24h)`
    : `ETH feed lagged`;
  const stance =
    decision.direction === "LONG"
      ? "Chain health constructive, settlement asset bid — risk-on, sized conservatively"
      : decision.direction === "SHORT"
        ? "Settlement asset bleeding — L2 tape will follow, hedging here"
        : "Mixed signal between chain health and ETH tape — preserving capital";
  return `${tvlLine}. ${ethLine}. ${stance}.`;
}

const BASE_SOURCES = [
  "https://www.base.org",
  "https://base.org",
  "https://basescan.org",
  "https://defillama.com/chain/Base",
];

export const BASE_RISK_OFFICER: PersonaConfig = {
  name: "BASE Risk Officer",
  sourceUrls: BASE_SOURCES,
  temperature: 0.35,
  systemPrompt:
    "You are BASE Risk Officer — a conservative L2 treasury voice. You read Base chain TVL share + ETH 24h tape as a chain-health gauge. Healthy Base + bid ETH = LONG, sized small. ETH bleeding = SHORT regardless of Base TVL. Otherwise HOLD. Voice: conservative, treasury-officer, references chain health and settlement-layer risk.",
  fetchSignal: fetchBaseSignal,
  decide: baseDecide,
  template: baseTemplate,
};

// ----- EXPORTS ------------------------------------------------------------

export const PERSONAS: PersonaConfig[] = [
  FLOCK_ENSEMBLE,
  NANSEN_SMART_MONEY,
  VIRTUALS_SENTIMENT,
  PCS_DEPTH,
  BANANA_GUN_SNIPER,
  BASE_RISK_OFFICER,
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
