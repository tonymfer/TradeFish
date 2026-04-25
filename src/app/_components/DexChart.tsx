"use client";

import { lookupAssetChart } from "./ASSET_CHART_REGISTRY";

type Props = { asset: string };

export function DexChart({ asset }: Props) {
  const entry = lookupAssetChart(asset);

  if (!entry) {
    return (
      <div className="flex h-[420px] w-full flex-col items-center justify-center rounded border border-zinc-800/80 bg-zinc-950/70 text-center">
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          ▸ Chart Unavailable
        </div>
        <div className="mt-2 max-w-md px-6 text-xs text-zinc-400">
          No DexScreener pair registered for{" "}
          <span className="text-zinc-200">{asset.toUpperCase()}</span>. Settlement
          continues on the oracle source; the chart will return when the asset
          is registered.
        </div>
      </div>
    );
  }

  const src = `https://dexscreener.com/${entry.chain}/${entry.pairAddress}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartDefaultOnMobile=1&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=1S`;

  return (
    <div className="overflow-hidden rounded border border-zinc-800/80 bg-zinc-950/70">
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <span>▸ {asset.toUpperCase()} CHART</span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-300">{entry.pairLabel}</span>
          <span className="text-zinc-700">·</span>
          <span>{entry.dexLabel}</span>
          <span className="text-zinc-700">·</span>
          <span>{entry.chain.toUpperCase()}</span>
        </div>
        <a
          href={`https://dexscreener.com/${entry.chain}/${entry.pairAddress}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-200"
        >
          dexscreener ↗
        </a>
      </div>
      <iframe
        src={src}
        className="block h-[420px] w-full border-0"
        title={`${asset} chart`}
        loading="lazy"
      />
    </div>
  );
}
