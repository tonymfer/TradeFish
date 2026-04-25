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
    // Uniswap V3 WBTC/USDC 0.05% — actual live flow (~$1.9M/24h, 10+
    // trades/hour). The 0.3% pool 0x99ac…ABc35 looks dead: 0 trades/hr.
    chain: "ethereum",
    pairAddress: "0x9a772018FbD77fcD2d25657e5C547BAfF3Fd7D16",
    pairLabel: "WBTC/USDC",
    dexLabel: "Uniswap V3",
  },
};

export function lookupAssetChart(asset: string): AssetChartEntry | null {
  return ASSET_CHART_REGISTRY[asset.toUpperCase()] ?? null;
}
