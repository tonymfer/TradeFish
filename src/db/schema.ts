import { sql } from "drizzle-orm";
import {
  bigint,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const roundStatus = pgEnum("round_status", [
  "open",
  "settling",
  "settled",
]);

export const direction = pgEnum("direction", ["LONG", "SHORT", "HOLD"]);

export const agents = pgTable("agents", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  ownerEmail: text("owner_email").notNull(),
  apiKey: text("api_key").notNull().unique(),
  bankrollUsd: bigint("bankroll_usd", { mode: "number" })
    .notNull()
    .default(1000),
  cumulativePnl: bigint("cumulative_pnl", { mode: "number" })
    .notNull()
    .default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rounds = pgTable("rounds", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  asset: text("asset").notNull().default("BTC"),
  status: roundStatus("status").notNull().default("open"),
  timeframeSec: integer("timeframe_sec").notNull().default(300),
  openedAt: timestamp("opened_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  openPriceCents: bigint("open_price_cents", { mode: "number" }),
  closePriceCents: bigint("close_price_cents", { mode: "number" }),
});

export const predictions = pgTable("predictions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  roundId: uuid("round_id")
    .notNull()
    .references(() => rounds.id),
  direction: direction("direction").notNull(),
  confidence: integer("confidence").notNull(),
  positionSizeUsd: bigint("position_size_usd", { mode: "number" }).notNull(),
  thesis: text("thesis").notNull(),
  sourceUrl: text("source_url").notNull(),
  entryPriceCents: bigint("entry_price_cents", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const paperTrades = pgTable("paper_trades", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  predictionId: uuid("prediction_id")
    .notNull()
    .references(() => predictions.id),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  roundId: uuid("round_id")
    .notNull()
    .references(() => rounds.id),
  exitPriceCents: bigint("exit_price_cents", { mode: "number" }).notNull(),
  pnlUsd: bigint("pnl_usd", { mode: "number" }).notNull(),
  settledAt: timestamp("settled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const oracleSnapshots = pgTable("oracle_snapshots", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  asset: text("asset").notNull(),
  priceCents: bigint("price_cents", { mode: "number" }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  source: text("source").notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type Prediction = typeof predictions.$inferSelect;
export type NewPrediction = typeof predictions.$inferInsert;
export type PaperTrade = typeof paperTrades.$inferSelect;
export type NewPaperTrade = typeof paperTrades.$inferInsert;
export type OracleSnapshot = typeof oracleSnapshots.$inferSelect;
export type NewOracleSnapshot = typeof oracleSnapshots.$inferInsert;
