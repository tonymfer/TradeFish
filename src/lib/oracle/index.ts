// Round logic (open / settle / entry prices) reads from DexScreener so
// PnL settlement reconciles with the chart pool the audience is watching.
export { getBtcPrice, type OraclePrice } from "./dexscreener";

// Live ticker on the price card needs sub-second cadence. DEX pools
// tick at trade frequency, which is often minutes between trades on
// low-volume pairs (the WBTC/USDC pool we chart had 0 trades / 0
// volume in the last hour during testing — frozen at $77,344.80).
// Pyth Hermes aggregates Coinbase / Binance / Kraken / etc. and
// updates roughly every 400ms. Used by /api/oracle/price → MarkPrice.
export { getBtcPrice as getLivePrice } from "./pyth";
