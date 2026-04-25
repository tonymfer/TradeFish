export type ChainSlug =
  | "ethereum"
  | "base"
  | "solana"
  | "bsc"
  | "polygon";

export type AssetChartEntry = {
  chain: ChainSlug;
  pairAddress: string;
  pairLabel: string;
  dexLabel: string;
};

export const ASSET_CHART_REGISTRY: Record<string, AssetChartEntry> = {
  BTC: {
    chain: "ethereum",
    pairAddress: "0x99ac8cA7087fA4A2A1FB6357269965A2014ABc35",
    pairLabel: "WBTC/USDC",
    dexLabel: "Uniswap V3",
  },
};

export function lookupAssetChart(asset: string): AssetChartEntry | null {
  return ASSET_CHART_REGISTRY[asset.toUpperCase()] ?? null;
}
