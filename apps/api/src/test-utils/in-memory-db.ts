import type { SQL } from "drizzle-orm";
import {
  auditLogs,
  dailyWalletStats,
  localSettings,
  pairs,
  routers,
  telegramSettings,
  tokens,
  transactions,
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
  [auditLogs, "auditLogs"],
  [dailyWalletStats, "dailyWalletStats"],
  [localSettings, "localSettings"],
  [pairs, "pairs"],
  [routers, "routers"],
  [telegramSettings, "telegramSettings"],
  [tokens, "tokens"],
  [transactions, "transactions"],
  [walletPairRules, "walletPairRules"],
  [wallets, "wallets"],
  [walletSchedules, "walletSchedules"],
]);

const fieldNames: Record<string, string> = {
  allowance_target: "allowanceTarget",
  amount_in: "amountIn",
  amount_out: "amountOut",
  app_name: "appName",
  basescan_url: "basescanUrl",
  chain_id: "chainId",
  chat_id: "chatId",
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
  gas_spent_usd: "gasSpentUsd",
  gas_used: "gasUsed",
  gas_usd: "gasUsd",
  last_scheduled_at: "lastScheduledAt",
  max_daily_loss_usd: "maxDailyLossUsd",
  max_daily_trades: "maxDailyTrades",
  max_gas_usd: "maxGasUsd",
  max_price_impact_bps: "maxPriceImpactBps",
  max_slippage_bps: "maxSlippageBps",
  max_trade_usd: "maxTradeUsd",
  metadata_json: "metadataJson",
  min_interval_minutes: "minIntervalMinutes",
  notify_on_confirmed: "notifyOnConfirmed",
  notify_on_dry_run: "notifyOnDryRun",
  notify_on_failed: "notifyOnFailed",
  notify_on_rejected: "notifyOnRejected",
  notify_on_submitted: "notifyOnSubmitted",
  pair_id: "pairId",
  preferred_router: "preferredRouter",
  risk_level: "riskLevel",
  strategy_profile: "strategyProfile",
  token_in: "tokenIn",
  token_in_id: "tokenInId",
  token_out: "tokenOut",
  token_out_id: "tokenOutId",
  trade_amount_usd: "tradeAmountUsd",
  tx_count: "txCount",
  tx_hash: "txHash",
  updated_at: "updatedAt",
  wallet_id: "walletId",
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

  return {
    id,
    createdAt: now,
    updatedAt: now,
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

  for (const match of sql.matchAll(/"[^"]+"\."([^"]+)" >= \$(\d+)/g)) {
    const [, columnName, paramIndex] = match;
    const field = fieldName(columnName ?? "");
    const expected = query.params[Number(paramIndex) - 1];
    const { leftValue, rightValue } = compare(row[field], expected);
    if ((leftValue as string | number) < (rightValue as string | number)) {
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
    return this.execute(condition);
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(condition?: SQL) {
    if (!this.tableName) {
      throw new Error("Select table is required");
    }

    return projectRows(
      this.tables[this.tableName].filter((row) =>
        conditionMatches(condition, row),
      ),
      this.projection,
    );
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
  auditLogs: Row[];
  dailyWalletStats: Row[];
  localSettings: Row[];
  pairs: Row[];
  routers: Row[];
  telegramSettings: Row[];
  tokens: Row[];
  transactions: Row[];
  walletPairRules: Row[];
  wallets: Row[];
  walletSchedules: Row[];
}

export const createInMemoryDb = (seed?: Partial<InMemoryTables>) => {
  const tables: InMemoryTables = {
    auditLogs: [],
    dailyWalletStats: [],
    localSettings: [],
    pairs: [],
    routers: [],
    telegramSettings: [],
    tokens: [],
    transactions: [],
    walletPairRules: [],
    wallets: [],
    walletSchedules: [],
    ...seed,
  };

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
  };

  return {
    db,
    tables,
  };
};
