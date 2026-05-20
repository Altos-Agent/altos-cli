import { and, eq } from "drizzle-orm";
import type { TransactionReceipt } from "viem";
import { buildBasescanTransactionLink } from "../blockchain/basescan.js";
import { basePublicClient } from "../blockchain/baseClient.js";
import type { DbClient } from "../db/client.js";
import { getRuntimeConfig } from "../config/runtime-config.js";
import {
  dailyWalletStats,
  pairs,
  tokens,
  transactions,
  wallets
} from "../db/schema.js";
import { createTelegramService } from "../notifications/telegram.js";
import { TransactionManager } from "./transaction-manager.js";

export interface MinimalReceipt {
  status: "success" | "reverted";
  gasUsed: bigint;
  blockNumber: bigint;
}

export class TransactionConfirmationError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "TransactionConfirmationError";
  }
}

const today = () => new Date().toISOString().slice(0, 10);

const toNumber = (value: string | null) =>
  value === null ? 0 : Number(value) || 0;

export const calculateConfirmationCount = (
  receiptBlockNumber: bigint,
  latestBlockNumber: bigint
) => {
  if (latestBlockNumber < receiptBlockNumber) {
    return 1;
  }
  return Number(latestBlockNumber - receiptBlockNumber + 1n);
};

export const mapReceiptToTransactionUpdate = ({
  receipt,
  latestBlockNumber,
  confirmationsRequired
}: {
  receipt: MinimalReceipt;
  latestBlockNumber: bigint;
  confirmationsRequired: number;
}) => {
  const confirmationCount = calculateConfirmationCount(
    receipt.blockNumber,
    latestBlockNumber
  );
  if (receipt.status === "reverted") {
    return {
      status: "FAILED" as const,
      gasUsed: receipt.gasUsed.toString(),
      errorMessage: "Transaction reverted on-chain",
      confirmationCount,
      finalizedBlock: null
    };
  }

  const finalized = confirmationCount >= confirmationsRequired;

  return {
    status: finalized
      ? ("FINALIZED" as const)
      : ("CONFIRMED_PENDING_FINALITY" as const),
    gasUsed: receipt.gasUsed.toString(),
    errorMessage: null,
    confirmationCount,
    finalizedBlock: finalized ? latestBlockNumber.toString() : null
  };
};

export const evaluateMissingReceiptPolicy = ({
  submittedAt,
  now,
  stuckAfterMinutes,
  droppedAfterMinutes,
  nonce,
  fromAddress
}: {
  submittedAt: Date;
  now: Date;
  stuckAfterMinutes: number;
  droppedAfterMinutes: number;
  nonce: number | null;
  fromAddress: string | null;
}) => {
  const ageMinutes = (now.getTime() - submittedAt.getTime()) / 60_000;
  const replacementContext =
    nonce !== null && fromAddress
      ? `replacement detection requires operator review for nonce ${nonce}`
      : "transaction may be dropped or replaced and requires operator explorer/RPC review";

  if (ageMinutes >= droppedAfterMinutes) {
    return {
      status: "DROPPED" as const,
      droppedReason: `Receipt unavailable after dropped timeout; ${replacementContext}`,
      replacementDetection:
        nonce !== null && fromAddress
          ? ("OPERATOR_REVIEW_REQUIRED" as const)
          : ("NOT_AVAILABLE" as const)
    };
  }

  if (ageMinutes >= stuckAfterMinutes) {
    return {
      status: "STUCK" as const,
      droppedReason: `Receipt unavailable after stuck timeout; ${replacementContext}`,
      replacementDetection:
        nonce !== null && fromAddress
          ? ("OPERATOR_REVIEW_REQUIRED" as const)
          : ("NOT_AVAILABLE" as const)
    };
  }

  return {
    status: null,
    droppedReason: null,
    replacementDetection: "NOT_DUE" as const
  };
};

const pairLabel = (
  pairId: string | null,
  pairMap: Map<string, typeof pairs.$inferSelect>,
  tokenMap: Map<string, typeof tokens.$inferSelect>
) => {
  if (!pairId) {
    return null;
  }
  const pair = pairMap.get(pairId);
  if (!pair) {
    return null;
  }
  const tokenIn = tokenMap.get(pair.tokenInId);
  const tokenOut = tokenMap.get(pair.tokenOutId);

  return tokenIn && tokenOut ? `${tokenIn.symbol}/${tokenOut.symbol}` : null;
};

export const hydrateTransactionRows = ({
  transactionRows,
  walletRows,
  pairRows,
  tokenRows
}: {
  transactionRows: (typeof transactions.$inferSelect)[];
  walletRows: (typeof wallets.$inferSelect)[];
  pairRows: (typeof pairs.$inferSelect)[];
  tokenRows: (typeof tokens.$inferSelect)[];
}) => {
  const walletMap = new Map(walletRows.map((wallet) => [wallet.id, wallet]));
  const pairMap = new Map(pairRows.map((pair) => [pair.id, pair]));
  const tokenMap = new Map(tokenRows.map((token) => [token.id, token]));

  return transactionRows.map((transaction) => ({
    id: transaction.id,
    walletId: transaction.walletId,
    walletName: walletMap.get(transaction.walletId)?.name,
    walletAddress: walletMap.get(transaction.walletId)?.address,
    action: transaction.action,
    status: transaction.status,
    pairId: transaction.pairId,
    pair: pairLabel(transaction.pairId, pairMap, tokenMap),
    txHash: transaction.txHash,
    basescanUrl: transaction.basescanUrl,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
    router: transaction.router,
    tokenIn: transaction.tokenIn,
    tokenOut: transaction.tokenOut,
    amountIn: transaction.amountIn,
    amountOut: transaction.amountOut,
    amountInRaw: transaction.amountInRaw,
    amountOutRaw: transaction.amountOutRaw,
    amountInUsd: transaction.amountInUsd,
    amountOutUsd: transaction.amountOutUsd,
    gasUsed: transaction.gasUsed,
    gasUsd: transaction.gasUsd,
    feeNative: transaction.feeNative,
    usdPriceSource: transaction.usdPriceSource,
    usdPriceTimestamp: transaction.usdPriceTimestamp,
    quoteUsdSource: transaction.quoteUsdSource,
    riskCheckedAt: transaction.riskCheckedAt,
    aggregateRiskSnapshotJson: transaction.aggregateRiskSnapshotJson,
    errorMessage: transaction.errorMessage,
    requestId: transaction.requestId,
    nonce: transaction.nonce,
    fromAddress: transaction.fromAddress,
    toAddress: transaction.toAddress,
    calldataHash: transaction.calldataHash,
    quoteHash: transaction.quoteHash,
    simulationHash: transaction.simulationHash,
    confirmationCount: transaction.confirmationCount,
    finalizedBlock: transaction.finalizedBlock,
    replacedByTxHash: transaction.replacedByTxHash,
    droppedReason: transaction.droppedReason
  }));
};

export const listTransactions = async (db: DbClient) => {
  const [transactionRows, walletRows, pairRows, tokenRows] = await Promise.all([
    db.select().from(transactions),
    db.select().from(wallets),
    db.select().from(pairs),
    db.select().from(tokens)
  ]);

  return hydrateTransactionRows({
    transactionRows: transactionRows.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    ),
    walletRows,
    pairRows,
    tokenRows
  });
};

export const getTransaction = async (db: DbClient, id: string) => {
  const [transactionRows, walletRows, pairRows, tokenRows] = await Promise.all([
    db.select().from(transactions).where(eq(transactions.id, id)),
    db.select().from(wallets),
    db.select().from(pairs),
    db.select().from(tokens)
  ]);

  const [transaction] = hydrateTransactionRows({
    transactionRows,
    walletRows,
    pairRows,
    tokenRows
  });

  if (!transaction) {
    throw new TransactionConfirmationError("Transaction not found", 404);
  }

  return transaction;
};

const updateDailyStats = async (
  db: DbClient,
  transaction: typeof transactions.$inferSelect
) => {
  const statDate = today();
  const [existing] = await db
    .select()
    .from(dailyWalletStats)
    .where(
      and(
        eq(dailyWalletStats.walletId, transaction.walletId),
        eq(dailyWalletStats.date, statDate)
      )
    );
  const nextTxCount = (existing?.txCount ?? 0) + 1;
  const nextGasSpentUsd = (
    toNumber(existing?.gasSpentUsd ?? null) + toNumber(transaction.gasUsd)
  ).toFixed(2);

  if (existing) {
    await db
      .update(dailyWalletStats)
      .set({
        txCount: nextTxCount,
        gasSpentUsd: nextGasSpentUsd,
        updatedAt: new Date()
      })
      .where(eq(dailyWalletStats.id, existing.id));
    return;
  }

  await db.insert(dailyWalletStats).values({
    walletId: transaction.walletId,
    date: statDate,
    txCount: 1,
    gasSpentUsd: transaction.gasUsd ?? "0",
    estimatedLossUsd: "0"
  });
};

const notifyConfirmation = async (
  db: DbClient,
  transaction: Awaited<ReturnType<typeof getTransaction>>
) => {
  const telegram = createTelegramService(db);
  await telegram.notify({
    eventType:
      transaction.status === "FINALIZED" || transaction.status === "CONFIRMED"
        ? "transaction confirmed"
        : "transaction failed",
    walletName: transaction.walletName ?? transaction.walletId,
    walletAddress: transaction.walletAddress ?? transaction.walletId,
    action: transaction.action,
    pair: transaction.pair ?? transaction.router ?? "None",
    amount: transaction.amountIn ?? "0",
    status: transaction.status,
    txHash: transaction.txHash,
    basescanUrl: transaction.basescanUrl,
    timestamp: new Date()
  });
};

export const refreshTransactionConfirmation = async (
  db: DbClient,
  id: string,
  client: Pick<
    typeof basePublicClient,
    "getTransactionReceipt" | "getBlockNumber"
  > = basePublicClient
) => {
  const [existing] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id));
  if (!existing) {
    throw new TransactionConfirmationError("Transaction not found", 404);
  }
  if (!existing.txHash) {
    throw new TransactionConfirmationError("Transaction has no hash");
  }
  if (
    existing.status !== "SUBMITTED" &&
    existing.status !== "CONFIRMED_PENDING_FINALITY"
  ) {
    if (existing.status === "FINALIZED") {
      const latestBlockNumber = await client.getBlockNumber().catch(() => null);
      const finalizedBlock =
        existing.finalizedBlock === null ? null : BigInt(existing.finalizedBlock);
      if (
        latestBlockNumber !== null &&
        finalizedBlock !== null &&
        latestBlockNumber >= finalizedBlock &&
        Number(latestBlockNumber - finalizedBlock) <=
          getRuntimeConfig().txReorgLookbackBlocks
      ) {
        return {
          refreshed: false,
          reason:
            "Finalized transaction reorg detection is operator-guided within configured lookback",
          transaction: await getTransaction(db, id)
        };
      }
    }
    return {
      refreshed: false,
      reason: "Transaction is not submitted",
      transaction: await getTransaction(db, id)
    };
  }

  let receipt: TransactionReceipt;
  try {
    receipt = await client.getTransactionReceipt({
      hash: existing.txHash as `0x${string}`
    });
  } catch {
    const config = getRuntimeConfig();
    const missingPolicy = evaluateMissingReceiptPolicy({
      submittedAt: existing.createdAt,
      now: new Date(),
      stuckAfterMinutes: config.txStuckAfterMinutes,
      droppedAfterMinutes: config.txDroppedAfterMinutes,
      nonce: existing.nonce,
      fromAddress: existing.fromAddress
    });
    if (missingPolicy.status) {
      const [updated] = await db
        .update(transactions)
        .set({
          status: missingPolicy.status,
          droppedReason: missingPolicy.droppedReason,
          updatedAt: new Date()
        })
        .where(eq(transactions.id, id))
        .returning();
      if (updated && missingPolicy.status === "STUCK") {
        void import("../ops/alert-webhook.js").then(
          ({ alertIfStuckTransaction }) =>
            alertIfStuckTransaction(updated.id, updated.walletId).catch(() => undefined),
        );
      } else if (updated && missingPolicy.status === "DROPPED") {
        void import("../ops/alert-webhook.js").then(
          ({ alertIfDroppedTransaction }) =>
            alertIfDroppedTransaction(updated.id, updated.walletId).catch(() => undefined),
        );
      }
    }
    return {
      refreshed: false,
      reason:
        missingPolicy.status === "STUCK"
          ? "Transaction is stuck; replacement detection requires operator review"
          : missingPolicy.status === "DROPPED"
            ? "Transaction is dropped or replaced; operator review required"
            : "Receipt not available yet",
      transaction: await getTransaction(db, id)
    };
  }

  const latestBlockNumber = await client.getBlockNumber();
  const update = mapReceiptToTransactionUpdate({
    receipt,
    latestBlockNumber,
    confirmationsRequired: getRuntimeConfig().confirmationsRequired
  });
  const [updated] = await db
    .update(transactions)
    .set({
      status: update.status,
      gasUsed: update.gasUsed,
      errorMessage: update.errorMessage,
      basescanUrl: existing.basescanUrl ?? buildBasescanTransactionLink(existing.txHash),
      confirmationCount: update.confirmationCount,
      finalizedBlock: update.finalizedBlock,
      updatedAt: new Date()
    })
    .where(eq(transactions.id, id))
    .returning();

  if (updated) {
    if (
      updated.status === "FINALIZED" ||
      updated.status === "CONFIRMED" ||
      updated.status === "FAILED"
    ) {
      await updateDailyStats(db, updated);
    }
    if (
      updated.requestId &&
      (updated.status === "FINALIZED" ||
        updated.status === "CONFIRMED" ||
        updated.status === "FAILED")
    ) {
      const manager = new TransactionManager(db);
      await manager.updateRequestStatus(
        updated.requestId,
        updated.status === "FINALIZED" ? "CONFIRMED" : updated.status
      );
      await manager.releaseWalletLock({
        walletId: updated.walletId,
        requestId: updated.requestId
      });
    }
  }

  const transaction = await getTransaction(db, id);
  if (
    transaction.status === "FINALIZED" ||
    transaction.status === "CONFIRMED" ||
    transaction.status === "FAILED"
  ) {
    await notifyConfirmation(db, transaction).catch(() => undefined);
  }

  return {
    refreshed: true,
    reason:
      transaction.status === "CONFIRMED_PENDING_FINALITY"
        ? "Waiting for finality confirmations"
        : null,
    transaction
  };
};

export const isTransactionConfirmationError = (
  error: unknown
): error is TransactionConfirmationError =>
  error instanceof TransactionConfirmationError;
