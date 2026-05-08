import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const riskLevelEnum = pgEnum("risk_level", ["LOW", "MEDIUM", "HIGH"]);

export const walletStatusEnum = pgEnum("wallet_status", [
  "ACTIVE",
  "PAUSED",
  "DISABLED"
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "PLANNED",
  "DRY_RUN",
  "SUBMITTED",
  "CONFIRMED",
  "FAILED",
  "REJECTED"
]);

export const transactionActionEnum = pgEnum("transaction_action", [
  "SWAP",
  "APPROVE",
  "TRANSFER",
  "REVOKE",
  "SIMULATION"
]);

export const strategyProfileEnum = pgEnum("strategy_profile", [
  "MANUAL_ONLY",
  "STABLE_ONLY",
  "LOW_FEE_ONLY",
  "TOKEN_ROTATION_LIMITED"
]);

const id = uuid("id").defaultRandom().primaryKey();

const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();

const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

export const localSettings = pgTable("local_settings", {
  id,
  appName: text("app_name").notNull().default("base-orchestrator"),
  dryRunDefault: boolean("dry_run_default").notNull().default(true),
  createdAt,
  updatedAt
});

export const wallets = pgTable(
  "wallets",
  {
    id,
    name: text("name").notNull(),
    address: text("address").notNull(),
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    encryptionVersion: integer("encryption_version").notNull(),
    status: walletStatusEnum("status").notNull().default("PAUSED"),
    maxTradeUsd: numeric("max_trade_usd", { precision: 18, scale: 2 }),
    maxDailyTrades: integer("max_daily_trades"),
    maxDailyLossUsd: numeric("max_daily_loss_usd", {
      precision: 18,
      scale: 2
    }),
    maxGasUsd: numeric("max_gas_usd", { precision: 18, scale: 2 }),
    notes: text("notes"),
    createdAt,
    updatedAt
  },
  (table) => [uniqueIndex("wallets_address_idx").on(table.address)]
);

export const tokens = pgTable(
  "tokens",
  {
    id,
    chainId: integer("chain_id").notNull(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    decimals: integer("decimals").notNull(),
    riskLevel: riskLevelEnum("risk_level").notNull().default("MEDIUM"),
    maxTradeUsd: numeric("max_trade_usd", { precision: 18, scale: 2 }),
    enabled: boolean("enabled").notNull().default(false),
    createdAt,
    updatedAt
  },
  (table) => [
    uniqueIndex("tokens_chain_symbol_idx").on(table.chainId, table.symbol),
    uniqueIndex("tokens_chain_address_idx").on(table.chainId, table.address)
  ]
);

export const pairs = pgTable(
  "pairs",
  {
    id,
    chainId: integer("chain_id").notNull(),
    tokenInId: uuid("token_in_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "restrict" }),
    tokenOutId: uuid("token_out_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "restrict" }),
    enabled: boolean("enabled").notNull().default(false),
    maxTradeUsd: numeric("max_trade_usd", { precision: 18, scale: 2 }),
    maxSlippageBps: integer("max_slippage_bps"),
    maxPriceImpactBps: integer("max_price_impact_bps"),
    preferredRouter: text("preferred_router"),
    fallbackRouter: text("fallback_router"),
    createdAt,
    updatedAt
  },
  (table) => [
    uniqueIndex("pairs_chain_token_direction_idx").on(
      table.chainId,
      table.tokenInId,
      table.tokenOutId
    )
  ]
);

export const walletPairRules = pgTable(
  "wallet_pair_rules",
  {
    id,
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => pairs.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    maxTradeUsd: numeric("max_trade_usd", { precision: 18, scale: 2 }),
    maxDailyTrades: integer("max_daily_trades"),
    createdAt,
    updatedAt
  },
  (table) => [
    uniqueIndex("wallet_pair_rules_wallet_pair_idx").on(
      table.walletId,
      table.pairId
    )
  ]
);

export const routers = pgTable(
  "routers",
  {
    id,
    chainId: integer("chain_id").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    enabled: boolean("enabled").notNull().default(false),
    riskLevel: riskLevelEnum("risk_level").notNull().default("MEDIUM"),
    notes: text("notes")
  },
  (table) => [uniqueIndex("routers_chain_name_idx").on(table.chainId, table.name)]
);

export const transactions = pgTable(
  "transactions",
  {
    id,
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    pairId: uuid("pair_id").references(() => pairs.id, {
      onDelete: "set null"
    }),
    chainId: integer("chain_id").notNull(),
    txHash: text("tx_hash"),
    status: transactionStatusEnum("status").notNull().default("PLANNED"),
    action: transactionActionEnum("action").notNull(),
    router: text("router"),
    tokenIn: text("token_in"),
    tokenOut: text("token_out"),
    amountIn: numeric("amount_in", { precision: 78, scale: 0 }),
    amountOut: numeric("amount_out", { precision: 78, scale: 0 }),
    gasUsed: numeric("gas_used", { precision: 78, scale: 0 }),
    gasUsd: numeric("gas_usd", { precision: 18, scale: 2 }),
    feeNative: numeric("fee_native", { precision: 36, scale: 18 }),
    errorMessage: text("error_message"),
    basescanUrl: text("basescan_url"),
    createdAt,
    updatedAt
  },
  (table) => [
    uniqueIndex("transactions_chain_tx_hash_idx").on(table.chainId, table.txHash)
  ]
);

export const telegramSettings = pgTable("telegram_settings", {
  id,
  enabled: boolean("enabled").notNull().default(false),
  encryptedBotToken: text("encrypted_bot_token"),
  chatId: text("chat_id"),
  notifyOnSubmitted: boolean("notify_on_submitted").notNull().default(true),
  notifyOnConfirmed: boolean("notify_on_confirmed").notNull().default(true),
  notifyOnFailed: boolean("notify_on_failed").notNull().default(true),
  notifyOnRejected: boolean("notify_on_rejected").notNull().default(true),
  notifyOnDryRun: boolean("notify_on_dry_run").notNull().default(true),
  createdAt,
  updatedAt
});

export const auditLogs = pgTable("audit_logs", {
  id,
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadataJson: jsonb("metadata_json"),
  createdAt
});

export const dailyWalletStats = pgTable(
  "daily_wallet_stats",
  {
    id,
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    txCount: integer("tx_count").notNull().default(0),
    gasSpentUsd: numeric("gas_spent_usd", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    estimatedLossUsd: numeric("estimated_loss_usd", {
      precision: 18,
      scale: 2
    })
      .notNull()
      .default("0"),
    createdAt,
    updatedAt
  },
  (table) => [
    uniqueIndex("daily_wallet_stats_wallet_date_idx").on(
      table.walletId,
      table.date
    )
  ]
);

export const walletSchedules = pgTable(
  "wallet_schedules",
  {
    id,
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    tradeAmountUsd: numeric("trade_amount_usd", { precision: 18, scale: 2 })
      .notNull()
      .default("1"),
    minIntervalMinutes: integer("min_interval_minutes").notNull().default(60),
    maxDailyTrades: integer("max_daily_trades"),
    strategyProfile: strategyProfileEnum("strategy_profile")
      .notNull()
      .default("MANUAL_ONLY"),
    emergencyPaused: boolean("emergency_paused").notNull().default(false),
    failedTxPauseThreshold: integer("failed_tx_pause_threshold")
      .notNull()
      .default(3),
    lastScheduledAt: timestamp("last_scheduled_at", { withTimezone: true }),
    createdAt,
    updatedAt
  },
  (table) => [uniqueIndex("wallet_schedules_wallet_idx").on(table.walletId)]
);

export type LocalSettings = typeof localSettings.$inferSelect;
export type NewLocalSettings = typeof localSettings.$inferInsert;
export type Wallet = typeof wallets.$inferSelect;
export type NewWallet = typeof wallets.$inferInsert;
export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;
export type Pair = typeof pairs.$inferSelect;
export type NewPair = typeof pairs.$inferInsert;
export type WalletPairRule = typeof walletPairRules.$inferSelect;
export type NewWalletPairRule = typeof walletPairRules.$inferInsert;
export type Router = typeof routers.$inferSelect;
export type NewRouter = typeof routers.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type TelegramSettings = typeof telegramSettings.$inferSelect;
export type NewTelegramSettings = typeof telegramSettings.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type DailyWalletStats = typeof dailyWalletStats.$inferSelect;
export type NewDailyWalletStats = typeof dailyWalletStats.$inferInsert;
export type WalletSchedule = typeof walletSchedules.$inferSelect;
export type NewWalletSchedule = typeof walletSchedules.$inferInsert;
