import { and, eq } from "drizzle-orm";
import type { TransactionReceipt } from "viem";
import { buildBasescanTransactionLink } from "../blockchain/basescan.js";
import { basePublicClient } from "../blockchain/baseClient.js";
import type { DbClient } from "../db/client.js";
import {
  dailyWalletStats,
  pairs,
  tokens,
  transactions,
  wallets
} from "../db/schema.js";
import { createTelegramService } from "../notifications/telegram.js";

export interface MinimalReceipt {
  status: "success" | "reverted";
  gasUsed: bigint;
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

export const mapReceiptToTransactionUpdate = (receipt: MinimalReceipt) => ({
  status: receipt.status === "success" ? ("CONFIRMED" as const) : ("FAILED" as const),
  gasUsed: receipt.gasUsed.toString(),
  errorMessage:
    receipt.status === "success" ? null : "Transaction reverted on-chain"
});

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
    gasUsed: transaction.gasUsed,
    gasUsd: transaction.gasUsd,
    feeNative: transaction.feeNative,
    errorMessage: transaction.errorMessage
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
      transaction.status === "CONFIRMED"
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
  client: Pick<typeof basePublicClient, "getTransactionReceipt"> = basePublicClient
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
  if (existing.status !== "SUBMITTED") {
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
    return {
      refreshed: false,
      reason: "Receipt not available yet",
      transaction: await getTransaction(db, id)
    };
  }

  const update = mapReceiptToTransactionUpdate(receipt);
  const [updated] = await db
    .update(transactions)
    .set({
      status: update.status,
      gasUsed: update.gasUsed,
      errorMessage: update.errorMessage,
      basescanUrl: existing.basescanUrl ?? buildBasescanTransactionLink(existing.txHash),
      updatedAt: new Date()
    })
    .where(eq(transactions.id, id))
    .returning();

  if (updated) {
    await updateDailyStats(db, updated);
  }

  const transaction = await getTransaction(db, id);
  await notifyConfirmation(db, transaction).catch(() => undefined);

  return {
    refreshed: true,
    reason: null,
    transaction
  };
};

export const isTransactionConfirmationError = (
  error: unknown
): error is TransactionConfirmationError =>
  error instanceof TransactionConfirmationError;
