// All price reads (round open / settle / entry / live ticker) go through
// Pyth Hermes. DexScreener-as-oracle was tried but the WBTC/USDC pool we
// chart was dormant ($0 volume, 0 trades/hour); every round settled at
// entry == exit, every paper_trade had pnl_usd == 0, and the leaderboard
// went flat. Pyth aggregates Coinbase/Binance/Kraken and ticks every
// ~400ms — settlement gets real movement, the live card animates.
//
// The tradeoff: displayed price won't perfectly match the embedded
// DexScreener chart's pool price (10-50 bps drift typical). The chart
// is now a visual reference, not the price-of-truth.
export { getBtcPrice, type OraclePrice } from "./pyth";

// Same source for now — kept as a separate alias so future refactors
// can route the live ticker differently from settlement without
// touching every caller.
export { getBtcPrice as getLivePrice } from "./pyth";
