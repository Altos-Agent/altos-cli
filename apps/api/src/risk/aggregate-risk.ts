import type { DbClient } from "../db/client.js";
import {
  aggregateRiskLimits,
  aggregateRiskStats,
  transactions,
  wallets,
} from "../db/schema.js";
import { and, eq, gte, sql } from "drizzle-orm";

const BASE_CHAIN_ID = 8453;

export interface AggregateLimits {
  maxDailyTradeUsd: string;
  maxDailyGasUsd: string;
  maxPendingTradeUsd: string;
  maxPendingWallets: number;
  maxFailedTxPerDay: number;
  enabled: boolean;
}

export interface AggregateStats {
  totalTradeUsd: string;
  totalGasUsd: string;
  totalPendingUsd: string;
  activeWalletCount: number;
  failedTxCount: number;
}

export interface AggregateRiskResult {
  allowed: boolean;
  codes: string[];
  reasons: string[];
  stats: AggregateStats;
  limits: AggregateLimits | null;
  proposedTradeUsd: string;
  proposedGasUsd: string;
}

export const AGGREGATE_RISK_CODES = {
  dailyTradeLimitExceeded: "AGGREGATE_DAILY_TRADE_LIMIT_EXCEEDED",
  pendingTradeLimitExceeded: "AGGREGATE_PENDING_TRADE_LIMIT_EXCEEDED",
  dailyGasLimitExceeded: "AGGREGATE_DAILY_GAS_LIMIT_EXCEEDED",
  pendingWalletLimitExceeded: "AGGREGATE_PENDING_WALLET_LIMIT_EXCEEDED",
  failedTxLimitExceeded: "AGGREGATE_FAILED_TX_LIMIT_EXCEEDED",
  disabledOrUnconfigured: "AGGREGATE_RISK_DISABLED_OR_UNCONFIGURED",
} as const;

export const getAggregateLimits = async (
  db: DbClient,
  chainId = BASE_CHAIN_ID
): Promise<AggregateLimits | null> => {
  const [row] = await db
    .select()
    .from(aggregateRiskLimits)
    .where(eq(aggregateRiskLimits.chainId, chainId));
  return row ?? null;
};

export const getAggregateStats = async (
  db: DbClient,
  date: string,
  chainId = BASE_CHAIN_ID
): Promise<AggregateStats> => {
  const [row] = await db
    .select()
    .from(aggregateRiskStats)
    .where(
      and(
        eq(aggregateRiskStats.date, date),
        eq(aggregateRiskStats.chainId, chainId)
      )
    );
  return (
    row ?? {
      totalTradeUsd: "0",
      totalGasUsd: "0",
      totalPendingUsd: "0",
      activeWalletCount: 0,
      failedTxCount: 0,
    }
  );
};

export const getPendingTransactionStats = async (
  db: DbClient,
  chainId = BASE_CHAIN_ID
): Promise<{ pendingUsd: string; pendingWalletCount: number }> => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.chainId, chainId),
        gte(transactions.createdAt, new Date(`${today}T00:00:00.000Z`))
      )
    );

  const [summaryRow] = rows;
  if (
    summaryRow &&
    "totalUsd" in summaryRow &&
    typeof summaryRow.totalUsd !== "undefined"
  ) {
    return {
      pendingUsd: String(summaryRow.totalUsd ?? "0"),
      pendingWalletCount: Number(
        "walletCount" in summaryRow ? summaryRow.walletCount ?? 0 : 0
      ),
    };
  }

  const pendingStatuses = new Set([
    "SUBMITTED",
    "CONFIRMED_PENDING_FINALITY",
    "STUCK",
  ]);
  const pendingRows = rows.filter((row) =>
    pendingStatuses.has(String(row.status))
  );
  const pendingUsd = pendingRows
    .reduce((sum, row) => sum + parseNumeric(row.amountInUsd), 0)
    .toFixed(2);
  const pendingWalletCount = new Set(
    pendingRows.map((row) => row.walletId)
  ).size;

  return {
    pendingUsd,
    pendingWalletCount,
  };
};

const parseNumeric = (value: string | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const checkAggregateRisk = async (
  db: DbClient,
  proposedTradeUsd: number,
  proposedGasUsd: number,
  chainId = BASE_CHAIN_ID
): Promise<AggregateRiskResult> => {
  const today = new Date().toISOString().slice(0, 10);
  const limits = await getAggregateLimits(db, chainId);
  const stats = await getAggregateStats(db, today, chainId);
  const pending = await getPendingTransactionStats(db, chainId);

  const reasons: string[] = [];
  const codes: string[] = [];

  if (!limits || !limits.enabled) {
    return {
      allowed: true,
      codes: [AGGREGATE_RISK_CODES.disabledOrUnconfigured],
      reasons: [],
      stats: {
        ...stats,
        totalPendingUsd: pending.pendingUsd,
      },
      limits,
      proposedTradeUsd: proposedTradeUsd.toFixed(2),
      proposedGasUsd: proposedGasUsd.toFixed(2),
    };
  }

  const currentDailyTrade = parseNumeric(stats.totalTradeUsd);
  if (
    currentDailyTrade + proposedTradeUsd >
    parseNumeric(limits.maxDailyTradeUsd)
  ) {
    codes.push(AGGREGATE_RISK_CODES.dailyTradeLimitExceeded);
    reasons.push(
      `Total daily trade cap exceeded: $${(currentDailyTrade + proposedTradeUsd).toFixed(2)} > $${limits.maxDailyTradeUsd} limit`
    );
  }

  const currentDailyGas = parseNumeric(stats.totalGasUsd);
  if (
    currentDailyGas + proposedGasUsd >
    parseNumeric(limits.maxDailyGasUsd)
  ) {
    codes.push(AGGREGATE_RISK_CODES.dailyGasLimitExceeded);
    reasons.push(
      `Total daily gas cap exceeded: $${(currentDailyGas + proposedGasUsd).toFixed(2)} > $${limits.maxDailyGasUsd} limit`
    );
  }

  const currentPendingUsd = parseNumeric(pending.pendingUsd);
  if (
    currentPendingUsd + proposedTradeUsd >
    parseNumeric(limits.maxPendingTradeUsd)
  ) {
    codes.push(AGGREGATE_RISK_CODES.pendingTradeLimitExceeded);
    reasons.push(
      `Total pending trade cap exceeded: $${(currentPendingUsd + proposedTradeUsd).toFixed(2)} > $${limits.maxPendingTradeUsd} limit`
    );
  }

  if (
    pending.pendingWalletCount + 1 >
    limits.maxPendingWallets
  ) {
    codes.push(AGGREGATE_RISK_CODES.pendingWalletLimitExceeded);
    reasons.push(
      `Max wallets with pending tx exceeded: ${pending.pendingWalletCount + 1} > ${limits.maxPendingWallets} limit`
    );
  }

  if (stats.failedTxCount >= limits.maxFailedTxPerDay) {
    codes.push(AGGREGATE_RISK_CODES.failedTxLimitExceeded);
    reasons.push(
      `Failed tx threshold reached: ${stats.failedTxCount} >= ${limits.maxFailedTxPerDay} limit`
    );
  }

  return {
    allowed: reasons.length === 0,
    codes,
    reasons,
    stats: {
      totalTradeUsd: stats.totalTradeUsd,
      totalGasUsd: stats.totalGasUsd,
      totalPendingUsd: pending.pendingUsd,
      activeWalletCount: stats.activeWalletCount,
      failedTxCount: stats.failedTxCount,
    },
    limits,
    proposedTradeUsd: proposedTradeUsd.toFixed(2),
    proposedGasUsd: proposedGasUsd.toFixed(2),
  };
};

export const createAggregateRiskSnapshot = (result: AggregateRiskResult) => ({
  checkedAt: new Date().toISOString(),
  allowed: result.allowed,
  codes: result.codes,
  reasons: result.reasons,
  stats: result.stats,
  limits: result.limits,
  proposedTradeUsd: result.proposedTradeUsd,
  proposedGasUsd: result.proposedGasUsd,
});

export const upsertAggregateStats = async (
  db: DbClient,
  chainId = BASE_CHAIN_ID
) => {
  const today = new Date().toISOString().slice(0, 10);

  const dailyTradeStats = await db
    .select({
      totalTradeUsd: sql<string>`COALESCE(SUM(ABS(${transactions.amountInUsd})), 0)::text`,
      totalGasUsd: sql<string>`COALESCE(SUM(ABS(${transactions.gasUsd})), 0)::text`,
      failedTxCount: sql<number>`COUNT(*) FILTER (WHERE ${transactions.status} = 'FAILED' AND ${transactions.createdAt} >= ${new Date(`${today}T00:00:00.000Z`)})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.chainId, chainId),
        gte(transactions.createdAt, new Date(`${today}T00:00:00.000Z`))
      )
    );

  const activeWallets = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(wallets)
    .where(eq(wallets.status, "ACTIVE"));

  const stats = dailyTradeStats[0];
  const activeCount = activeWallets[0]?.count ?? 0;

  await db
    .insert(aggregateRiskStats)
    .values({
      date: today,
      chainId,
      totalTradeUsd: stats?.totalTradeUsd ?? "0",
      totalGasUsd: stats?.totalGasUsd ?? "0",
      totalPendingUsd: "0",
      activeWalletCount: Number(activeCount),
      failedTxCount: Number(stats?.failedTxCount ?? 0),
    })
    .onConflictDoUpdate({
      target: [aggregateRiskStats.chainId, aggregateRiskStats.date],
      set: {
        totalTradeUsd: stats?.totalTradeUsd ?? "0",
        totalGasUsd: stats?.totalGasUsd ?? "0",
        activeWalletCount: Number(activeCount),
        failedTxCount: Number(stats?.failedTxCount ?? 0),
        updatedAt: new Date(),
      },
    });
};
