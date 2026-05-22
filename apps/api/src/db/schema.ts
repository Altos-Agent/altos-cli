import {
  boolean,
  date,
  index,
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

export const verificationStatusEnum = pgEnum("verification_status", [
  "UNVERIFIED",
  "VERIFIED",
  "PLACEHOLDER",
  "BLOCKED",
]);

export const walletStatusEnum = pgEnum("wallet_status", [
  "ACTIVE",
  "PAUSED",
  "QUARANTINED",
  "DISABLED"
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "PLANNED",
  "DRY_RUN",
  "SUBMITTED",
  "CONFIRMED_PENDING_FINALITY",
  "CONFIRMED",
  "FINALIZED",
  "FAILED",
  "REJECTED",
  "STUCK",
  "DROPPED",
  "REPLACED"
]);

export const transactionActionEnum = pgEnum("transaction_action", [
  "SWAP",
  "APPROVE",
  "TRANSFER",
  "REVOKE",
  "SIMULATION"
]);

export const transactionRequestStatusEnum = pgEnum(
  "transaction_request_status",
  ["PENDING", "SUBMITTED", "CONFIRMED", "REJECTED", "FAILED", "CONFLICT"]
);

export const pendingWalletLockStatusEnum = pgEnum(
  "pending_wallet_lock_status",
  [
    "ACTIVE",
    "RESERVED",
    "SIGNING",
    "SUBMITTED",
    "CONFIRMED_PENDING_FINALITY",
    "FINALIZED",
    "STUCK",
    "DROPPED",
    "EXPIRED",
    "RELEASED",
    "REPLACED"
  ]
);

export const walletNonceStatusEnum = pgEnum("wallet_nonce_status", [
  "CLEAN",
  "UNCERTAIN",
  "QUARANTINED"
]);

export const transactionRecoveryStatusEnum = pgEnum("transaction_recovery_status", [
  "STUCK",
  "DROPPED",
  "RECOVERED",
  "CANCELLED"
]);

export const strategyProfileEnum = pgEnum("strategy_profile", [
  "MANUAL_ONLY",
  "STABLE_ONLY",
  "LOW_FEE_ONLY",
  "TOKEN_ROTATION_LIMITED"
]);

export const pairRotationModeEnum = pgEnum("pair_rotation_mode", [
  "ROUND_ROBIN",
  "WEIGHTED",
  "CONSERVATIVE"
]);

export const walletGroupStatusEnum = pgEnum("wallet_group_status", [
  "ACTIVE",
  "PAUSED",
  "QUARANTINED"
]);

export const strategyProfileModeEnum = pgEnum("strategy_profile_mode", [
  "DRY_RUN_ONLY",
  "LIVE_ELIGIBLE_AFTER_GATES"
]);

export const scheduleOccurrenceStatusEnum = pgEnum(
  "schedule_occurrence_status",
  [
    "PLANNED",
    "QUEUED",
    "RUNNING",
    "DRY_RUN_ACCEPTED",
    "DRY_RUN_REJECTED",
    "LIVE_BLOCKED",
    "FAILED",
    "CANCELLED",
    "DLQ",
  ]
);

export const scheduleOccurrenceModeEnum = pgEnum(
  "schedule_occurrence_mode",
  ["DRY_RUN", "LIVE", "LIVE_CANARY"]
);

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
  globalEmergencyPaused: boolean("global_emergency_paused")
    .notNull()
    .default(false),
  createdAt,
  updatedAt
});

export const walletGroups = pgTable(
  "wallet_groups",
  {
    id,
    name: text("name").notNull(),
    description: text("description"),
    status: walletGroupStatusEnum("status").notNull().default("ACTIVE"),
    maxDailyTx: integer("max_daily_tx"),
    maxDailyTradeUsd: numeric("max_daily_trade_usd", {
      precision: 18,
      scale: 2
    }),
    maxDailyGasUsd: numeric("max_daily_gas_usd", {
      precision: 18,
      scale: 2
    }),
    maxConcurrentWallets: integer("max_concurrent_wallets"),
    createdAt,
    updatedAt
  },
  (table) => [
    index("wallet_groups_status_idx").on(table.status)
  ]
);

export const strategyProfiles = pgTable(
  "strategy_profiles",
  {
    id,
    name: text("name").notNull(),
    description: text("description"),
    mode: strategyProfileModeEnum("mode").notNull().default("DRY_RUN_ONLY"),
    maxDailyTx: integer("max_daily_tx"),
    maxHourlyTx: integer("max_hourly_tx"),
    minCooldownSeconds: integer("min_cooldown_seconds"),
    maxTradeUsd: numeric("max_trade_usd", { precision: 18, scale: 2 }),
    maxGasUsd: numeric("max_gas_usd", { precision: 18, scale: 2 }),
    maxSlippageBps: integer("max_slippage_bps"),
    maxPriceImpactBps: integer("max_price_impact_bps"),
    allowedHoursJson: text("allowed_hours_json"),
    pairRotationMode: pairRotationModeEnum("pair_rotation_mode")
      .notNull()
      .default("ROUND_ROBIN"),
    randomizationWindowSeconds: integer("randomization_window_seconds"),
    enabled: boolean("enabled").notNull().default(false),
    createdAt,
    updatedAt
  }
);

export const wallets = pgTable(
  "wallets",
  {
    id,
    name: text("name").notNull(),
    address: text("address").notNull(),
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    encryptionVersion: integer("encryption_version").notNull(),
    status: walletStatusEnum("status").notNull().default("PAUSED"),
    walletGroupId: uuid("wallet_group_id").references(
      () => walletGroups.id,
      { onDelete: "set null" }
    ),
    maxTradeUsd: numeric("max_trade_usd", { precision: 18, scale: 2 }),
    maxDailyTrades: integer("max_daily_trades"),
    maxDailyLossUsd: numeric("max_daily_loss_usd", {
      precision: 18,
      scale: 2
    }),
    maxGasUsd: numeric("max_gas_usd", { precision: 18, scale: 2 }),
    notes: text("notes"),
    nonce: integer("nonce"),
    nonceStatus: walletNonceStatusEnum("nonce_status").notNull().default("CLEAN"),
    quarantineReason: text("quarantine_reason"),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
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
    checksumAddress: text("checksum_address"),
    decimals: integer("decimals").notNull(),
    riskLevel: riskLevelEnum("risk_level").notNull().default("MEDIUM"),
    maxTradeUsd: numeric("max_trade_usd", { precision: 18, scale: 2 }),
    enabled: boolean("enabled").notNull().default(false),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("UNVERIFIED"),
    verificationSource: text("verification_source"),
    verificationEvidenceUrl: text("verification_evidence_url"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: text("verified_by"),
    verificationNotes: text("verification_notes"),
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
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("UNVERIFIED"),
    verificationSource: text("verification_source"),
    verificationEvidenceUrl: text("verification_evidence_url"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: text("verified_by"),
    verificationNotes: text("verification_notes"),
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
    cooldownSeconds: integer("cooldown_seconds"),
    weight: numeric("weight", { precision: 5, scale: 2 }).default("1.00"),
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
    checksumAddress: text("checksum_address"),
    spenderAddress: text("spender_address"),
    txTargetAddress: text("tx_target_address"),
    allowanceTargetAddress: text("allowance_target_address"),
    functionSelectorAllowlist: jsonb("function_selector_allowlist"),
    enabled: boolean("enabled").notNull().default(false),
    riskLevel: riskLevelEnum("risk_level").notNull().default("MEDIUM"),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("UNVERIFIED"),
    verificationSource: text("verification_source"),
    verificationEvidenceUrl: text("verification_evidence_url"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: text("verified_by"),
    verificationNotes: text("verification_notes"),
    notes: text("notes")
  },
  (table) => [uniqueIndex("routers_chain_name_idx").on(table.chainId, table.name)]
);

export const transactions = pgTable(
  "transactions",
  {
    id,
    requestId: uuid("request_id"),
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
    amountInRaw: numeric("amount_in_raw", { precision: 78, scale: 0 }),
    amountOutRaw: numeric("amount_out_raw", { precision: 78, scale: 0 }),
    amountInUsd: numeric("amount_in_usd", { precision: 18, scale: 2 }),
    amountOutUsd: numeric("amount_out_usd", { precision: 18, scale: 2 }),
    gasUsed: numeric("gas_used", { precision: 78, scale: 0 }),
    gasUsd: numeric("gas_usd", { precision: 18, scale: 2 }),
    feeNative: numeric("fee_native", { precision: 36, scale: 18 }),
    usdPriceSource: text("usd_price_source"),
    usdPriceTimestamp: timestamp("usd_price_timestamp", { withTimezone: true }),
    quoteUsdSource: text("quote_usd_source"),
    riskCheckedAt: timestamp("risk_checked_at", { withTimezone: true }),
    aggregateRiskSnapshotJson: jsonb("aggregate_risk_snapshot_json"),
    errorMessage: text("error_message"),
    basescanUrl: text("basescan_url"),
    nonce: integer("nonce"),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    calldataHash: text("calldata_hash"),
    quoteHash: text("quote_hash"),
    simulationHash: text("simulation_hash"),
    confirmationCount: integer("confirmation_count").notNull().default(0),
    finalizedBlock: numeric("finalized_block", { precision: 78, scale: 0 }),
    replacedByTxHash: text("replaced_by_tx_hash"),
    droppedReason: text("dropped_reason"),
    replacementTxHash: text("replacement_tx_hash"),
    recoveryStatus: transactionRecoveryStatusEnum("recovery_status"),
    recoveryNotes: text("recovery_notes"),
    occurrenceId: uuid("occurrence_id").references(() => scheduleOccurrences.id, {
      onDelete: "set null",
    }),
    traceId: text("trace_id"),
    createdAt,
    updatedAt
  },
  (table) => [
    uniqueIndex("transactions_chain_tx_hash_idx").on(table.chainId, table.txHash),
    index("transactions_trace_id_idx").on(table.traceId),
  ]
);

export const transactionRequests = pgTable(
  "transaction_requests",
  {
    id,
    idempotencyKey: text("idempotency_key").notNull(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    action: transactionActionEnum("action").notNull(),
    status: transactionRequestStatusEnum("status").notNull().default("PENDING"),
    requestHash: text("request_hash").notNull(),
    pairId: uuid("pair_id").references(() => pairs.id, {
      onDelete: "set null"
    }),
    routerId: uuid("router_id").references(() => routers.id, {
      onDelete: "set null"
    }),
    sellToken: text("sell_token"),
    buyToken: text("buy_token"),
    sellAmountRaw: numeric("sell_amount_raw", { precision: 78, scale: 0 }),
    quoteHash: text("quote_hash"),
    simulationHash: text("simulation_hash"),
    traceId: text("trace_id"),
    createdAt,
    updatedAt
  },
  (table) => [
    uniqueIndex("transaction_requests_idempotency_key_idx").on(
      table.idempotencyKey
    ),
    index("transaction_requests_trace_id_idx").on(table.traceId),
  ]
);

export const pendingWalletLocks = pgTable(
  "pending_wallet_locks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    lockedByRequestId: uuid("locked_by_request_id")
      .notNull()
      .references(() => transactionRequests.id, { onDelete: "cascade" }),
    nonce: integer("nonce").notNull(),
    txHash: text("tx_hash"),
    lockReason: text("lock_reason").notNull(),
    status: pendingWalletLockStatusEnum("status").notNull().default("ACTIVE"),
    finalityRequired: boolean("finality_required").notNull().default(false),
    replacedByTxHash: text("replaced_by_tx_hash"),
    operatorReviewed: boolean("operator_reviewed").notNull().default(false),
    operatorReviewedAt: timestamp("operator_reviewed_at", { withTimezone: true }),
    operatorReviewedBy: text("operator_reviewed_by"),
    recoveryNotes: text("recovery_notes"),
    occurrenceId: uuid("occurrence_id").references(
      () => scheduleOccurrences.id,
      { onDelete: "set null" }
    ),
    traceId: text("trace_id"),
    riskReservationId: uuid("risk_reservation_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt
  },
  (table) => [
    index("pending_wallet_locks_wallet_id_idx").on(table.walletId),
    index("pending_wallet_locks_status_idx").on(table.status)
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

export const notificationDeliveries = pgTable("notification_deliveries", {
  id,
  channel: text("channel").notNull(),
  eventType: text("event_type").notNull(),
  status: text("status").notNull(),
  requestId: text("request_id"),
  jobId: text("job_id"),
  walletId: uuid("wallet_id").references(() => wallets.id, {
    onDelete: "set null"
  }),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "set null"
  }),
  traceId: text("trace_id"),
  destinationPreview: text("destination_preview"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt,
  updatedAt
}, (table) => [
  index("notification_deliveries_trace_id_idx").on(table.traceId),
]);

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

export const schedulerLocks = pgTable("scheduler_locks", {
  name: text("name").primaryKey(),
  ownerId: text("owner_id"),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  updatedAt
});

export const schedulerRuns = pgTable("scheduler_runs", {
  id,
  ownerId: text("owner_id").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
  stoppedAt: timestamp("stopped_at", { withTimezone: true }),
  stopReason: text("stop_reason"),
  createdAt,
  updatedAt
});

// Schedule occurrences must be defined BEFORE walletSchedules due to FK reference
export const scheduleOccurrences = pgTable(
  "schedule_occurrences",
  {
    id,
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => walletSchedules.id, { onDelete: "cascade" }),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => pairs.id, { onDelete: "restrict" }),
    strategyProfileId: uuid("strategy_profile_id").references(
      () => strategyProfiles.id,
      { onDelete: "set null" }
    ),
    mode: scheduleOccurrenceModeEnum("mode").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    occurrenceKey: text("occurrence_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: scheduleOccurrenceStatusEnum("status").notNull().default("PLANNED"),
    requestId: uuid("request_id"),
    traceId: text("trace_id"),
    quoteHash: text("quote_hash"),
    simulationHash: text("simulation_hash"),
    transactionId: uuid("transaction_id"), // No FK — reverse link via transactions.occurrenceId
    jobId: text("job_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    riskReservationId: uuid("risk_reservation_id"),
    nonceReservationId: uuid("nonce_reservation_id"),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("schedule_occurrences_occurrence_key_idx").on(
      table.occurrenceKey
    ),
    uniqueIndex("schedule_occurrences_idempotency_key_idx").on(
      table.idempotencyKey
    ),
    index("schedule_occurrences_schedule_id_idx").on(table.scheduleId),
    index("schedule_occurrences_wallet_id_idx").on(table.walletId),
    index("schedule_occurrences_status_idx").on(table.status),
  ]
);

export type ScheduleOccurrence = typeof scheduleOccurrences.$inferSelect;
export type NewScheduleOccurrence = typeof scheduleOccurrences.$inferInsert;

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
    maxDailyRuns: integer("max_daily_runs"),
    strategyProfileId: uuid("strategy_profile_id").references(
      () => strategyProfiles.id,
      { onDelete: "set null" }
    ),
    emergencyPaused: boolean("emergency_paused").notNull().default(false),
    failedTxPauseThreshold: integer("failed_tx_pause_threshold")
      .notNull()
      .default(3),
    lastScheduledAt: timestamp("last_scheduled_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: text("last_status"),
    failureCount: integer("failure_count").notNull().default(0),
    createdAt,
    updatedAt
  },
  (table) => [uniqueIndex("wallet_schedules_wallet_idx").on(table.walletId)]
);

export const schedulerJobs = pgTable("scheduler_jobs", {
  id,
  walletId: uuid("wallet_id")
    .notNull()
    .references(() => wallets.id, { onDelete: "cascade" }),
  scheduleId: uuid("schedule_id").references(() => walletSchedules.id, {
    onDelete: "set null"
  }),
  jobType: text("job_type").notNull(),
  traceId: text("trace_id"),
  status: text("status").notNull(),
  reason: text("reason"),
  createdAt,
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true })
});

export const aggregateRiskLimits = pgTable("aggregate_risk_limits", {
  id,
  chainId: integer("chain_id").notNull().default(8453),
  maxDailyTradeUsd: numeric("max_daily_trade_usd", { precision: 18, scale: 2 })
    .notNull()
    .default("10000"),
  maxDailyGasUsd: numeric("max_daily_gas_usd", { precision: 18, scale: 2 })
    .notNull()
    .default("500"),
  maxPendingTradeUsd: numeric("max_pending_trade_usd", {
    precision: 18,
    scale: 2
  }).notNull().default("2000"),
  maxPendingWallets: integer("max_pending_wallets").notNull().default(10),
  maxFailedTxPerDay: integer("max_failed_tx_per_day").notNull().default(5),
  enabled: boolean("enabled").notNull().default(true),
  createdAt,
  updatedAt
});

export const aggregateRiskStats = pgTable("aggregate_risk_stats", {
  id,
  date: date("date").notNull(),
  chainId: integer("chain_id").notNull().default(8453),
  totalTradeUsd: numeric("total_trade_usd", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  totalGasUsd: numeric("total_gas_usd", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  totalPendingUsd: numeric("total_pending_usd", { precision: 18, scale: 2 })
    .notNull()
    .default("0"),
  activeWalletCount: integer("active_wallet_count").notNull().default(0),
  failedTxCount: integer("failed_tx_count").notNull().default(0),
  createdAt,
  updatedAt
}, (table) => [
  uniqueIndex("aggregate_risk_stats_chain_date_idx").on(
    table.chainId,
    table.date
  )
]);

export const aggregateRiskReservations = pgTable(
  "aggregate_risk_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    traceId: text("trace_id").notNull(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => pairs.id, { onDelete: "cascade" }),
    occurrenceId: uuid("occurrence_id").references(
      () => scheduleOccurrences.id,
      { onDelete: "set null" }
    ),
    amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }).notNull(),
    gasUsd: numeric("gas_usd", { precision: 18, scale: 2 }).notNull(),
    status: text("status").notNull().default("RESERVED"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    index("arr_status_expires_idx").on(table.status, table.expiresAt),
    index("arr_wallet_pair_idx").on(table.walletId, table.pairId),
  ]
);

export const deadLetterJobs = pgTable("dead_letter_jobs", {
  id,
  queueName: text("queue_name").notNull(),
  jobId: text("job_id").notNull(),
  jobType: text("job_type").notNull(),
  walletId: uuid("wallet_id"),
  pairId: uuid("pair_id"),
  scheduleId: uuid("schedule_id"),
  occurrenceId: uuid("occurrence_id"),
  requestId: text("request_id"),
  traceId: text("trace_id"),
  errorCode: text("error_code").notNull(),
  errorMessage: text("error_message").notNull(),
  retryable: boolean("retryable").notNull().default(false),
  payloadPreviewJson: jsonb("payload_preview_json"),
  failedAt: timestamp("failed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by"),
  resolutionNote: text("resolution_note"),
}, (table) => [
  index("dlq_queue_name_idx").on(table.queueName),
  index("dlq_wallet_id_idx").on(table.walletId),
  index("dlq_pair_id_idx").on(table.pairId),
  index("dlq_occurrence_id_idx").on(table.occurrenceId),
  index("dlq_failed_at_idx").on(table.failedAt),
  index("dlq_error_code_idx").on(table.errorCode),
]);

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
export type TransactionRequest = typeof transactionRequests.$inferSelect;
export type NewTransactionRequest = typeof transactionRequests.$inferInsert;
export type PendingWalletLock = typeof pendingWalletLocks.$inferSelect;
export type NewPendingWalletLock = typeof pendingWalletLocks.$inferInsert;
export type TelegramSettings = typeof telegramSettings.$inferSelect;
export type NewTelegramSettings = typeof telegramSettings.$inferInsert;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type DailyWalletStats = typeof dailyWalletStats.$inferSelect;
export type NewDailyWalletStats = typeof dailyWalletStats.$inferInsert;
export type SchedulerLock = typeof schedulerLocks.$inferSelect;
export type NewSchedulerLock = typeof schedulerLocks.$inferInsert;
export type SchedulerRun = typeof schedulerRuns.$inferSelect;
export type NewSchedulerRun = typeof schedulerRuns.$inferInsert;
export type WalletSchedule = typeof walletSchedules.$inferSelect;
export type NewWalletSchedule = typeof walletSchedules.$inferInsert;
export type SchedulerJob = typeof schedulerJobs.$inferSelect;
export type NewSchedulerJob = typeof schedulerJobs.$inferInsert;
export type AggregateRiskLimit = typeof aggregateRiskLimits.$inferSelect;
export type NewAggregateRiskLimit = typeof aggregateRiskLimits.$inferInsert;
export type AggregateRiskStat = typeof aggregateRiskStats.$inferSelect;
export type NewAggregateRiskStat = typeof aggregateRiskStats.$inferInsert;
export type DeadLetterJob = typeof deadLetterJobs.$inferSelect;
export type NewDeadLetterJob = typeof deadLetterJobs.$inferInsert;
export type WalletGroup = typeof walletGroups.$inferSelect;
export type NewWalletGroup = typeof walletGroups.$inferInsert;
export type StrategyProfile = typeof strategyProfiles.$inferSelect;
export type NewStrategyProfile = typeof strategyProfiles.$inferInsert;
