import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

/** People the Gateway signed in, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

/** The organization's shared catalogue of instruments. */
export const symbols = sqliteTable(
  "symbols",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    exchange: text("exchange").notNull(),
    assetType: text("asset_type").notNull(),
    currency: text("currency").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("symbols_org_ticker").on(t.orgId, t.ticker)],
);

/** OHLCV bars; `time` is unix seconds (UTC). */
export const bars = sqliteTable(
  "bars",
  {
    symbolId: text("symbol_id")
      .notNull()
      .references(() => symbols.id, { onDelete: "cascade" }),
    time: integer("time").notNull(),
    open: real("open").notNull(),
    high: real("high").notNull(),
    low: real("low").notNull(),
    close: real("close").notNull(),
    volume: real("volume").notNull(),
  },
  (t) => [primaryKey({ columns: [t.symbolId, t.time] })],
);

export const chartLayouts = sqliteTable(
  "chart_layouts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    symbolId: text("symbol_id")
      .notNull()
      .references(() => symbols.id, { onDelete: "cascade" }),
    interval: text("interval").notNull(),
    chartType: text("chart_type").notNull(),
    indicators: text("indicators", { mode: "json" }).notNull(),
    drawings: text("drawings", { mode: "json" }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("chart_layouts_owner").on(t.ownerId)],
);

export const watchlists = sqliteTable(
  "watchlists",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("watchlists_owner").on(t.ownerId)],
);

export const watchlistItems = sqliteTable(
  "watchlist_items",
  {
    watchlistId: text("watchlist_id")
      .notNull()
      .references(() => watchlists.id, { onDelete: "cascade" }),
    symbolId: text("symbol_id")
      .notNull()
      .references(() => symbols.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.watchlistId, t.symbolId] })],
);

export const alerts = sqliteTable(
  "alerts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    symbolId: text("symbol_id")
      .notNull()
      .references(() => symbols.id, { onDelete: "cascade" }),
    condition: text("condition").notNull(),
    value: real("value").notNull(),
    value2: real("value2"),
    frequency: text("frequency").notNull(),
    expiresAt: text("expires_at"),
    status: text("status").notNull(),
    message: text("message").notNull(),
    notifyEmail: integer("notify_email", { mode: "boolean" })
      .notNull()
      .default(false),
    lastFiredBarTime: integer("last_fired_bar_time"),
    createdAt: createdAt(),
  },
  (t) => [
    index("alerts_owner").on(t.ownerId),
    index("alerts_symbol").on(t.symbolId, t.status),
  ],
);

export const alertEvents = sqliteTable(
  "alert_events",
  {
    id: text("id").primaryKey(),
    alertId: text("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    barTime: integer("bar_time").notNull(),
    price: real("price").notNull(),
    message: text("message").notNull(),
    firedAt: text("fired_at").notNull(),
  },
  (t) => [
    index("alert_events_owner").on(t.ownerId),
    uniqueIndex("alert_events_once_per_bar").on(t.alertId, t.barTime),
  ],
);

export const paperAccounts = sqliteTable(
  "paper_accounts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull(),
    startingBalance: real("starting_balance").notNull(),
    commissionPct: real("commission_pct").notNull(),
    cash: real("cash").notNull(),
    realizedPnl: real("realized_pnl").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("paper_accounts_owner").on(t.ownerId)],
);

export const paperOrders = sqliteTable(
  "paper_orders",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => paperAccounts.id, { onDelete: "cascade" }),
    symbolId: text("symbol_id")
      .notNull()
      .references(() => symbols.id, { onDelete: "cascade" }),
    side: text("side").notNull(),
    type: text("type").notNull(),
    qty: real("qty").notNull(),
    price: real("price"),
    status: text("status").notNull(),
    reason: text("reason"),
    filledPrice: real("filled_price"),
    commission: real("commission"),
    createdAt: text("created_at").notNull(),
    filledAt: text("filled_at"),
  },
  (t) => [
    index("paper_orders_account").on(t.accountId),
    index("paper_orders_working").on(t.symbolId, t.status),
  ],
);

export const paperPositions = sqliteTable(
  "paper_positions",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => paperAccounts.id, { onDelete: "cascade" }),
    symbolId: text("symbol_id")
      .notNull()
      .references(() => symbols.id, { onDelete: "cascade" }),
    qty: real("qty").notNull(),
    avgPrice: real("avg_price").notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.symbolId] })],
);

export const screens = sqliteTable(
  "screens",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    filters: text("filters", { mode: "json" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("screens_owner").on(t.ownerId)],
);
