import { and, eq, gte } from "drizzle-orm";
import type { Job } from "bullmq";
import type { DbClient } from "../db/client.js";
import { transactions, wallets, walletSchedules } from "../db/schema.js";
import { refreshTransactionConfirmation } from "../transactions/confirmation.js";
import type { ConfirmationJob, SchedulerQueues } from "./queues.js";
import { shouldPauseWalletAfterFailure } from "./scheduler-policy.js";

const startOfToday = () => new Date(new Date().toISOString().slice(0, 10));

export const processConfirmationJob =
  (db: DbClient, queues: SchedulerQueues) =>
  async (job: Job<ConfirmationJob>) => {
    console.info(`[confirmationQueue] job ${job.id} wallet ${job.data.walletId}`);

    if (job.data.transactionId !== "dry-run") {
      const refreshed = await refreshTransactionConfirmation(
        db,
        job.data.transactionId
      ).catch(() => null);
      if (refreshed?.reason === "Receipt not available yet") {
        await queues.confirmationQueue.add(
          "submitted-transaction-refresh",
          job.data,
          { delay: 60_000 }
        );
      }
    }

    const [schedule] = await db
      .select()
      .from(walletSchedules)
      .where(eq(walletSchedules.walletId, job.data.walletId));

    if (!schedule) {
      return { paused: false };
    }

    const failedRows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, job.data.walletId),
          eq(transactions.status, "FAILED"),
          gte(transactions.createdAt, startOfToday())
        )
      );

    if (
      shouldPauseWalletAfterFailure({
        recentFailedTxCount: failedRows.length,
        failedTxThreshold: schedule.failedTxPauseThreshold
      })
    ) {
      await db
        .update(wallets)
        .set({ status: "PAUSED", updatedAt: new Date() })
        .where(eq(wallets.id, job.data.walletId));
      await db
        .update(walletSchedules)
        .set({ enabled: false, emergencyPaused: true, updatedAt: new Date() })
        .where(eq(walletSchedules.walletId, job.data.walletId));

      const [wallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.id, job.data.walletId));
      if (wallet) {
        await queues.notificationQueue.add("wallet-paused-after-failures", {
          eventType: "wallet paused due to risk limit",
          walletName: wallet.name,
          walletAddress: wallet.address,
          action: "PAUSE",
          pair: "scheduler",
          amount: "0",
          status: "PAUSED",
          txHash: null,
          basescanUrl: null
        });
      }

      return { paused: true };
    }

    return { paused: false };
  };
