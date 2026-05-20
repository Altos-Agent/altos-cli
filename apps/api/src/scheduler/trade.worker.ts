import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import type { DbClient } from "../db/client.js";
import { scheduleOccurrences, schedulerJobs, walletSchedules } from "../db/schema.js";
import { assertGlobalEmergencyNotPaused } from "../security/emergency-pause.js";
import { createScheduledDryRun } from "./scheduled-dry-run.js";
import type { ScheduledTradeJob, SchedulerQueues } from "./queues.js";
import { computeNextRunAt } from "./scheduler-policy.js";
import { recordDeadLetterJob } from "./dlq.service.js";
import { isRetryableProviderError, isProviderError } from "../errors/provider.errors.js";
import {
  markOccurrenceRunning,
  markDryRunAccepted,
  markDryRunRejected,
  markLiveBlocked,
  markFailed,
  markDlq,
} from "./occurrence.service.js";

const markSchedulerJobStarted = async (
  db: DbClient,
  schedulerJobId: string | null | undefined,
  startedAt: Date,
) => {
  if (!schedulerJobId) return;
  await db
    .update(schedulerJobs)
    .set({ status: "STARTED", startedAt })
    .where(eq(schedulerJobs.id, schedulerJobId))
    .returning();
};

const markSchedulerJobFinished = async ({
  db,
  schedulerJobId,
  scheduleId,
  status,
  reason,
  finishedAt,
}: {
  db: DbClient;
  schedulerJobId: string | null | undefined;
  scheduleId: string | null | undefined;
  status: "COMPLETED" | "FAILED";
  reason: string;
  finishedAt: Date;
}) => {
  if (schedulerJobId) {
    await db
      .update(schedulerJobs)
      .set({ status, reason, finishedAt })
      .where(eq(schedulerJobs.id, schedulerJobId))
      .returning();
  }

  if (!scheduleId) return;
  const [schedule] = await db
    .select()
    .from(walletSchedules)
    .where(eq(walletSchedules.id, scheduleId));
  if (!schedule) return;

  await db
    .update(walletSchedules)
    .set({
      lastRunAt: finishedAt,
      lastStatus: status === "FAILED" ? "FAILED" : reason,
      failureCount:
        status === "FAILED" ? Number(schedule.failureCount ?? 0) + 1 : 0,
      nextRunAt: computeNextRunAt(finishedAt, schedule.minIntervalMinutes),
      updatedAt: finishedAt,
    })
    .where(eq(walletSchedules.id, scheduleId))
    .returning();
};

export const processTradeJob =
  (db: DbClient, queues: SchedulerQueues) =>
  async (job: Job<ScheduledTradeJob>) => {
    const startedAt = new Date();
    await markSchedulerJobStarted(db, job.data.schedulerJobId, startedAt);

    // Mark occurrence as running if we have one
    if (job.data.occurrenceId) {
      await markOccurrenceRunning(db, job.data.occurrenceId).catch(() => {
        console.warn(
          `[tradeQueue] could not mark occurrence ${job.data.occurrenceId} running`,
        );
      });
    }

    try {
      await assertGlobalEmergencyNotPaused(db);
      console.info(
        `[tradeQueue] job ${job.id} wallet ${job.data.walletId} mode ${job.data.mode} occurrence ${job.data.occurrenceId}`,
      );

      if (job.data.mode === "LIVE") {
        // Mark as live blocked — live scheduler is disabled
        if (job.data.occurrenceId) {
          await markLiveBlocked(
            db,
            job.data.occurrenceId,
            "LIVE_MODE_BLOCKED",
            "Live scheduled execution is not implemented",
          ).catch(() => undefined);
        }
        throw new Error("Live scheduled execution is not implemented");
      }

      const scheduled = await createScheduledDryRun({
        db,
        walletId: job.data.walletId,
        pairId: job.data.pairId,
        amountIn: job.data.amountIn,
        occurrenceId: job.data.occurrenceId,
      });

      // Update occurrence with transaction link and status
      if (job.data.occurrenceId && scheduled.transactionId) {
        await db
          .update(scheduleOccurrences)
          .set({
            transactionId: scheduled.transactionId,
            quoteHash: scheduled.quoteHash,
            simulationHash: scheduled.simulationHash,
            updatedAt: new Date(),
          })
          .where(eq(scheduleOccurrences.id, job.data.occurrenceId))
          .returning()
          .catch(() => undefined);
      }

      if (scheduled.status === "DRY_RUN") {
        if (job.data.occurrenceId) {
          await markDryRunAccepted(
            db,
            job.data.occurrenceId,
            scheduled.quoteHash,
            scheduled.simulationHash,
          ).catch(() => undefined);
        }
      } else {
        if (job.data.occurrenceId) {
          await markDryRunRejected(
            db,
            job.data.occurrenceId,
            "DRY_RUN_REJECTED",
            scheduled.result.reasons.join("; ") || "Dry run rejected",
          ).catch(() => undefined);
        }
      }

      await markSchedulerJobFinished({
        db,
        schedulerJobId: job.data.schedulerJobId,
        scheduleId: job.data.scheduleId,
        status: "COMPLETED",
        reason: scheduled.status,
        finishedAt: new Date(),
      });

      await queues.confirmationQueue.add("scheduled-dry-run-confirmation", {
        transactionId: scheduled.transactionId ?? "dry-run",
        walletId: job.data.walletId,
        requestId: job.data.requestId ?? null,
      });
      await queues.notificationQueue.add("scheduled-dry-run-notification", {
        eventType:
          scheduled.status === "DRY_RUN" ? "dry-run accepted" : "dry-run rejected",
        walletId: job.data.walletId,
        transactionId: scheduled.transactionId,
        requestId: job.data.requestId ?? null,
        walletName: scheduled.context.wallet.name,
        walletAddress: scheduled.context.wallet.address,
        action: "SWAP",
        pair: `${scheduled.context.tokenIn?.symbol ?? "Unknown"}/${scheduled.context.tokenOut?.symbol ?? "Unknown"}`,
        amount: job.data.amountIn,
        status: scheduled.status,
        txHash: null,
        basescanUrl: null,
      });

      return {
        transactionId: scheduled.transactionId,
        status: scheduled.status,
      };
    } catch (error) {
      // Check if this is a retryable provider error
      const isRetryable = isRetryableProviderError(error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorCode = isProviderError(error) ? error.code ?? "UNKNOWN" : "UNKNOWN";

      // Record to DLQ before rethrowing
      await recordDeadLetterJob(db, {
        queueName: "tradeQueue",
        jobId: job.id ?? "unknown",
        jobType: job.data.mode,
        walletId: job.data.walletId,
        pairId: job.data.pairId,
        scheduleId: job.data.scheduleId ?? null,
        occurrenceId: job.data.occurrenceId ?? null,
        requestId: job.data.requestId ?? null,
        traceId: job.data.traceId ?? null,
        error: error instanceof Error ? error : new Error(String(error)),
        payload: job.data as unknown as Record<string, unknown>,
      });

      // Mark occurrence as DLQ if non-retryable, otherwise FAILED
      if (job.data.occurrenceId) {
        if (!isRetryable) {
          await markDlq(db, job.data.occurrenceId, errorCode, errorMessage).catch(
            () => undefined,
          );
        } else {
          await markFailed(db, job.data.occurrenceId, errorCode, errorMessage).catch(
            () => undefined,
          );
        }
      }

      await markSchedulerJobFinished({
        db,
        schedulerJobId: job.data.schedulerJobId,
        scheduleId: job.data.scheduleId,
        status: "FAILED",
        reason: errorMessage,
        finishedAt: new Date(),
      });

      // For retryable errors, rethrow to trigger BullMQ retry
      // For non-retryable errors, don't retry - DLQ already recorded
      if (isRetryable && job.data.mode === "DRY_RUN") {
        // Let BullMQ handle the retry with backoff
        throw error;
      }
      // Non-retryable or live mode - job is done, DLQ recorded
      // Return a normal result (don't rethrow to prevent retries)
      return {
        transactionId: null,
        status: "FAILED",
        error: errorMessage,
      };
    }
  };
