import type { Job } from "bullmq";
import type { DbClient } from "../db/client.js";
import { createScheduledDryRun } from "./scheduled-dry-run.js";
import type { ScheduledTradeJob, SchedulerQueues } from "./queues.js";

export const processTradeJob =
  (db: DbClient, queues: SchedulerQueues) =>
  async (job: Job<ScheduledTradeJob>) => {
    console.info(
      `[tradeQueue] job ${job.id} wallet ${job.data.walletId} mode ${job.data.mode}`
    );

    if (job.data.mode === "LIVE" && process.env.DRY_RUN !== "false") {
      throw new Error("Live scheduler refuses to run while DRY_RUN=true");
    }

    if (job.data.mode === "LIVE") {
      throw new Error("Live scheduled execution is not implemented");
    }

    const scheduled = await createScheduledDryRun({
      db,
      walletId: job.data.walletId,
      pairId: job.data.pairId,
      amountIn: job.data.amountIn
    });

    await queues.confirmationQueue.add("scheduled-dry-run-confirmation", {
      transactionId: scheduled.transactionId ?? "dry-run",
      walletId: job.data.walletId
    });
    await queues.notificationQueue.add("scheduled-dry-run-notification", {
      eventType:
        scheduled.status === "DRY_RUN" ? "dry-run accepted" : "dry-run rejected",
      walletName: scheduled.context.wallet.name,
      walletAddress: scheduled.context.wallet.address,
      action: "SWAP",
      pair: `${scheduled.context.tokenIn?.symbol ?? "Unknown"}/${scheduled.context.tokenOut?.symbol ?? "Unknown"}`,
      amount: job.data.amountIn,
      status: scheduled.status,
      txHash: null,
      basescanUrl: null
    });

    return {
      transactionId: scheduled.transactionId,
      status: scheduled.status
    };
  };
