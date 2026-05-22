import type { SQL } from "drizzle-orm";
import {
  aggregateRiskLimits,
  aggregateRiskReservations,
  aggregateRiskStats,
  auditLogs,
  dailyWalletStats,
  localSettings,
  notificationDeliveries,
  pendingWalletLocks,
  pairs,
  routers,
  schedulerJobs,
  schedulerLocks,
  schedulerRuns,
  telegramSettings,
  tokens,
  transactions,
  transactionRequests,
  walletPairRules,
  wallets,
  walletSchedules,
} from "../db/schema.js";

type Table = object;
type Row = Record<string, unknown>;
type Projection = Record<string, { name?: string }>;

const conditionQueryConfig = {
  casing: {
    getColumnCasing: (column: { name: string }) => column.name,
  },
  escapeName: (name: string) => `"${name}"`,
  escapeParam: (index: number) => `$${index + 1}`,
  escapeString: (value: string) => `'${value.replaceAll("'", "''")}'`,
  prepareTyping: () => "none",
};

const tableNames = new Map<Table, keyof InMemoryTables>([
  [aggregateRiskLimits, "aggregateRiskLimits"],
  [aggregateRiskReservations, "aggregateRiskReservations"],
  [aggregateRiskStats, "aggregateRiskStats"],
  [auditLogs, "auditLogs"],
  [dailyWalletStats, "dailyWalletStats"],
  [localSettings, "localSettings"],
  [notificationDeliveries, "notificationDeliveries"],
  [pendingWalletLocks, "pendingWalletLocks"],
  [pairs, "pairs"],
  [routers, "routers"],
  [schedulerJobs, "schedulerJobs"],
  [schedulerLocks, "schedulerLocks"],
  [schedulerRuns, "schedulerRuns"],
  [telegramSettings, "telegramSettings"],
  [tokens, "tokens"],
  [transactions, "transactions"],
  [transactionRequests, "transactionRequests"],
  [walletPairRules, "walletPairRules"],
  [wallets, "wallets"],
  [walletSchedules, "walletSchedules"],
]);

const fieldNames: Record<string, string> = {
  allowance_target: "allowanceTarget",
  allowance_target_address: "allowanceTargetAddress",
  amount_in: "amountIn",
  amount_in_raw: "amountInRaw",
  amount_in_usd: "amountInUsd",
  amount_out: "amountOut",
  amount_out_raw: "amountOutRaw",
  amount_out_usd: "amountOutUsd",
  app_name: "appName",
  basescan_url: "basescanUrl",
  chain_id: "chainId",
  chat_id: "chatId",
  checksum_address: "checksumAddress",
  created_at: "createdAt",
  dry_run_default: "dryRunDefault",
  encrypted_bot_token: "encryptedBotToken",
  encrypted_private_key: "encryptedPrivateKey",
  encryption_version: "encryptionVersion",
  entity_id: "entityId",
  entity_type: "entityType",
  estimated_loss_usd: "estimatedLossUsd",
  fallback_router: "fallbackRouter",
  failed_tx_pause_threshold: "failedTxPauseThreshold",
  fee_native: "feeNative",
  finalized_block: "finalizedBlock",
  from_address: "fromAddress",
  function_selector_allowlist: "functionSelectorAllowlist",
  gas_spent_usd: "gasSpentUsd",
  gas_used: "gasUsed",
  gas_usd: "gasUsd",
  global_emergency_paused: "globalEmergencyPaused",
  last_scheduled_at: "lastScheduledAt",
  last_run_at: "lastRunAt",
  last_status: "lastStatus",
  next_run_at: "nextRunAt",
  max_daily_runs: "maxDailyRuns",
  max_daily_loss_usd: "maxDailyLossUsd",
  max_daily_trades: "maxDailyTrades",
  max_gas_usd: "maxGasUsd",
  max_price_impact_bps: "maxPriceImpactBps",
  max_slippage_bps: "maxSlippageBps",
  max_trade_usd: "maxTradeUsd",
  metadata_json: "metadataJson",
  min_interval_minutes: "minIntervalMinutes",
  destination_preview: "destinationPreview",
  error_code: "errorCode",
  error_message: "errorMessage",
  event_type: "eventType",
  job_id: "jobId",
  locked_by_request_id: "lockedByRequestId",
  notify_on_confirmed: "notifyOnConfirmed",
  notify_on_dry_run: "notifyOnDryRun",
  notify_on_failed: "notifyOnFailed",
  notify_on_rejected: "notifyOnRejected",
  notify_on_submitted: "notifyOnSubmitted",
  pair_id: "pairId",
  preferred_router: "preferredRouter",
  request_hash: "requestHash",
  request_id: "requestId",
  risk_level: "riskLevel",
  strategy_profile: "strategyProfile",
  token_in: "tokenIn",
  token_in_id: "tokenInId",
  token_out: "tokenOut",
  token_out_id: "tokenOutId",
  to_address: "toAddress",
  trade_amount_usd: "tradeAmountUsd",
  transaction_id: "transactionId",
  tx_count: "txCount",
  tx_hash: "txHash",
  tx_target_address: "txTargetAddress",
  updated_at: "updatedAt",
  verification_evidence_url: "verificationEvidenceUrl",
  verification_notes: "verificationNotes",
  verification_source: "verificationSource",
  verification_status: "verificationStatus",
  verified_at: "verifiedAt",
  verified_by: "verifiedBy",
  wallet_id: "walletId",
  buy_token: "buyToken",
  sell_amount_raw: "sellAmountRaw",
  sell_token: "sellToken",
  spender_address: "spenderAddress",
  idempotency_key: "idempotencyKey",
  router_id: "routerId",
  quote_hash: "quoteHash",
  quote_usd_source: "quoteUsdSource",
  simulation_hash: "simulationHash",
  usd_price_source: "usdPriceSource",
  usd_price_timestamp: "usdPriceTimestamp",
  risk_checked_at: "riskCheckedAt",
  aggregate_risk_snapshot_json: "aggregateRiskSnapshotJson",
  calldata_hash: "calldataHash",
  confirmation_count: "confirmationCount",
  replaced_by_tx_hash: "replacedByTxHash",
  dropped_reason: "droppedReason",
  expires_at: "expiresAt",
  owner_id: "ownerId",
  heartbeat_at: "heartbeatAt",
  started_at: "startedAt",
  stopped_at: "stoppedAt",
  stop_reason: "stopReason",
  job_type: "jobType",
  schedule_id: "scheduleId",
  finished_at: "finishedAt",
  failure_count: "failureCount",
  max_daily_trade_usd: "maxDailyTradeUsd",
  max_daily_gas_usd: "maxDailyGasUsd",
  max_pending_trade_usd: "maxPendingTradeUsd",
  max_pending_wallets: "maxPendingWallets",
  max_failed_tx_per_day: "maxFailedTxPerDay",
  total_trade_usd: "totalTradeUsd",
  total_gas_usd: "totalGasUsd",
  total_pending_usd: "totalPendingUsd",
  active_wallet_count: "activeWalletCount",
  failed_tx_count: "failedTxCount",
};

const fieldName = (columnName: string) => fieldNames[columnName] ?? columnName;

const defaultRow = (tableName: keyof InMemoryTables, values: Row): Row => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const id =
    typeof values.id === "string"
      ? values.id
      : `test-${tableName}-${Math.random().toString(16).slice(2)}`;

  if (tableName === "telegramSettings") {
    return {
      id,
      enabled: false,
      encryptedBotToken: null,
      chatId: null,
      notifyOnSubmitted: true,
      notifyOnConfirmed: true,
      notifyOnFailed: true,
      notifyOnRejected: true,
      notifyOnDryRun: true,
      createdAt: now,
      updatedAt: now,
      ...values,
    };
  }

  if (tableName === "tokens") {
    return {
      id,
      enabled: false,
      verificationStatus: "UNVERIFIED",
      verificationSource: null,
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: null,
      checksumAddress: null,
      createdAt: now,
      updatedAt: now,
      ...values,
    };
  }

  if (tableName === "routers") {
    return {
      id,
      enabled: false,
      verificationStatus: "UNVERIFIED",
      verificationSource: null,
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: null,
      checksumAddress: null,
      spenderAddress: null,
      txTargetAddress: null,
      allowanceTargetAddress: null,
      functionSelectorAllowlist: null,
      notes: null,
      ...values,
    };
  }

  if (tableName === "pairs") {
    return {
      id,
      enabled: false,
      verificationStatus: "UNVERIFIED",
      verificationSource: null,
      verificationEvidenceUrl: null,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: null,
      createdAt: now,
      updatedAt: now,
      ...values,
    };
  }

  return {
    id,
    createdAt: now,
    updatedAt: now,
    ...(tableName === "localSettings" ? { globalEmergencyPaused: false } : {}),
    ...values,
  };
};

const compare = (left: unknown, right: unknown) => {
  const leftValue = left instanceof Date ? left.getTime() : left;
  const rightValue = right instanceof Date ? right.getTime() : right;

  return { leftValue, rightValue };
};

const conditionMatches = (condition: SQL | undefined, row: Row) => {
  if (!condition) {
    return true;
  }

  const query = condition.toQuery(conditionQueryConfig as never);
  const sql = query.sql;

  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" = \$(\d+)/g)) {
    const [, columnName, paramIndex] = match;
    const field = fieldName(columnName ?? "");
    const expected = query.params[Number(paramIndex) - 1];
    if (row[field] !== expected) {
      return false;
    }
  }

  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" != \$(\d+)/g)) {
    const [, columnName, paramIndex] = match;
    const field = fieldName(columnName ?? "");
    const expected = query.params[Number(paramIndex) - 1];
    if (row[field] === expected) {
      return false;
    }
  }

  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" >= \$(\d+)/g)) {
    const [, columnName, paramIndex] = match;
    const field = fieldName(columnName ?? "");
    const expected = query.params[Number(paramIndex) - 1];
    const { leftValue, rightValue } = compare(row[field], expected);
    if ((leftValue as string | number) < (rightValue as string | number)) {
      return false;
    }
  }

  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" < \$(\d+)/g)) {
    const [, columnName, paramIndex] = match;
    const field = fieldName(columnName ?? "");
    const expected = query.params[Number(paramIndex) - 1];
    const { leftValue, rightValue } = compare(row[field], expected);
    if (!((leftValue as string | number) < (rightValue as string | number))) {
      return false;
    }
  }

  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" in \(([^)]+)\)/g)) {
    const [, columnName, paramsSql] = match;
    const field = fieldName(columnName ?? "");
    const paramIndexes = [...(paramsSql ?? "").matchAll(/\$(\d+)/g)].map(
      (paramMatch) => Number(paramMatch[1]) - 1,
    );
    const expectedValues = paramIndexes.map((index) => query.params[index]);
    if (!expectedValues.includes(row[field])) {
      return false;
    }
  }

  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" not in \(([^)]+)\)/g)) {
    const [, columnName, paramsSql] = match;
    const field = fieldName(columnName ?? "");
    const paramIndexes = [...(paramsSql ?? "").matchAll(/\$(\d+)/g)].map(
      (paramMatch) => Number(paramMatch[1]) - 1,
    );
    const excludedValues = paramIndexes.map((index) => query.params[index]);
    if (excludedValues.includes(row[field])) {
      return false;
    }
  }

  return true;
};

const projectRows = (rows: Row[], projection?: Projection) => {
  if (!projection) {
    return rows;
  }

  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(projection).map(([key, column]) => [
        key,
        row[fieldName(column.name ?? key)],
      ]),
    ),
  );
};

class SelectBuilder {
  private tableName: keyof InMemoryTables | null = null;
  private _limit: number | undefined;
  private _condition: SQL | undefined;

  constructor(
    private readonly tables: InMemoryTables,
    private readonly projection?: Projection,
  ) {}

  from(table: Table) {
    const tableName = tableNames.get(table);
    if (!tableName) {
      throw new Error("Unknown table");
    }
    this.tableName = tableName;
    return this;
  }

  where(condition: SQL) {
    this._condition = condition;
    return this;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }

  for(_mode: string) {
    // no-op: locking not applicable in in-memory
    return this;
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<Row[]> {
    if (!this.tableName) {
      throw new Error("Select table is required");
    }

    let rows = this.tables[this.tableName].filter((row) =>
      conditionMatches(this._condition, row),
    );
    if (this._limit != null) {
      rows = rows.slice(0, this._limit);
    }
    return projectRows(rows, this.projection);
  }
}

class InsertValuesBuilder {
  constructor(
    private readonly rows: Row[],
    private readonly tableName: keyof InMemoryTables,
    private readonly valuesInput: Row | Row[],
  ) {}

  async returning() {
    return this.insert();
  }

  async onConflictDoUpdate({ set }: { target: unknown; set: Row }) {
    const values = Array.isArray(this.valuesInput)
      ? this.valuesInput
      : [this.valuesInput];

    for (const value of values) {
      const existing = this.rows.find((row) => {
        if ("walletId" in value && "pairId" in value) {
          return row.walletId === value.walletId && row.pairId === value.pairId;
        }
        if ("id" in value) {
          return row.id === value.id;
        }
        return false;
      });

      if (existing) {
        Object.assign(existing, set);
      } else {
        this.rows.push(defaultRow(this.tableName, value));
      }
    }
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.insert().then(onfulfilled, onrejected);
  }

  private async insert() {
    const values = Array.isArray(this.valuesInput)
      ? this.valuesInput
      : [this.valuesInput];
    const inserted = values.map((value) => defaultRow(this.tableName, value));
    this.rows.push(...inserted);
    return inserted;
  }
}

class InsertBuilder {
  constructor(
    private readonly tables: InMemoryTables,
    private readonly tableName: keyof InMemoryTables,
  ) {}

  values(values: Row | Row[]) {
    return new InsertValuesBuilder(
      this.tables[this.tableName],
      this.tableName,
      values,
    );
  }
}

class UpdateWhereBuilder {
  constructor(
    private readonly rows: Row[],
    private readonly updates: Row,
    private condition?: SQL,
  ) {}

  where(condition: SQL) {
    this.condition = condition;
    return this;
  }

  async returning() {
    const updated: Row[] = [];
    for (const row of this.rows) {
      if (conditionMatches(this.condition, row)) {
        Object.assign(row, this.updates);
        updated.push(row);
      }
    }
    return updated;
  }
}

class UpdateBuilder {
  constructor(private readonly rows: Row[]) {}

  set(updates: Row) {
    return new UpdateWhereBuilder(this.rows, updates);
  }
}

export interface InMemoryTables {
  aggregateRiskLimits: Row[];
  aggregateRiskReservations: Row[];
  aggregateRiskStats: Row[];
  auditLogs: Row[];
  dailyWalletStats: Row[];
  localSettings: Row[];
  notificationDeliveries: Row[];
  pendingWalletLocks: Row[];
  pairs: Row[];
  routers: Row[];
  schedulerJobs: Row[];
  schedulerLocks: Row[];
  schedulerRuns: Row[];
  telegramSettings: Row[];
  tokens: Row[];
  transactions: Row[];
  transactionRequests: Row[];
  walletPairRules: Row[];
  wallets: Row[];
  walletSchedules: Row[];
}

export const createInMemoryDb = (seed?: Partial<InMemoryTables>) => {
  const tables: InMemoryTables = {
    aggregateRiskLimits: [],
    aggregateRiskReservations: [],
    aggregateRiskStats: [],
    auditLogs: [],
    dailyWalletStats: [],
    localSettings: [],
    notificationDeliveries: [],
    pendingWalletLocks: [],
    pairs: [],
    routers: [],
    schedulerJobs: [],
    schedulerLocks: [],
    schedulerRuns: [],
    telegramSettings: [],
    tokens: [],
    transactions: [],
    transactionRequests: [],
    walletPairRules: [],
    wallets: [],
    walletSchedules: [],
    ...seed,
  };
  tables.tokens = tables.tokens.map((row) => defaultRow("tokens", row));
  tables.routers = tables.routers.map((row) => defaultRow("routers", row));
  tables.pairs = tables.pairs.map((row) => defaultRow("pairs", row));

  const db = {
    select: (projection?: Projection) => new SelectBuilder(tables, projection),
    insert: (table: Table) => {
      const tableName = tableNames.get(table);
      if (!tableName) {
        throw new Error("Unknown table");
      }
      return new InsertBuilder(tables, tableName);
    },
    update: (table: Table) => {
      const tableName = tableNames.get(table);
      if (!tableName) {
        throw new Error("Unknown table");
      }
      return new UpdateBuilder(tables[tableName]);
    },
    transaction: async <T>(fn: (tx: typeof db) => Promise<T>): Promise<T> => {
      return fn(db);
    },
  };

  return {
    db,
    tables,
  };
};
