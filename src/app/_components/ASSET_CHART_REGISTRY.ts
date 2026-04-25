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
    // Aerodrome cbBTC/USDC on Base — by far the most active on-chain
    // BTC/USD venue (~$100M/24h, 250+ trades/hr). cbBTC is Coinbase's
    // BTC wrapper; prices track WBTC/Pyth within a few bps.
    chain: "base",
    pairAddress: "0x4e962BB3889Bf030368F56810A9c96B83CB3E778",
    pairLabel: "cbBTC/USDC",
    dexLabel: "Aerodrome",
  },
};

export function lookupAssetChart(asset: string): AssetChartEntry | null {
  return ASSET_CHART_REGISTRY[asset.toUpperCase()] ?? null;
}
