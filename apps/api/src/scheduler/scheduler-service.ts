import { eq, gte } from "drizzle-orm";
import { Worker, type WorkerOptions } from "bullmq";
import type { DbClient } from "../db/client.js";
import {
  auditLogs,
  dailyWalletStats,
  pairs,
  tokens,
  transactions,
  walletPairRules,
  wallets,
  walletSchedules,
} from "../db/schema.js";
import { createTelegramService } from "../notifications/telegram.js";
import {
  bullQueueOptions,
  createSchedulerQueues,
  defaultJobOptions,
  queueNames,
  type SchedulerQueues,
} from "./queues.js";
import { processConfirmationJob } from "./confirmation.worker.js";
import { processNotificationJob } from "./notification.worker.js";
import { processQuoteJob } from "./quote.worker.js";
import { processTradeJob } from "./trade.worker.js";
import {
  canScheduleWallet,
  nextRunDelayMs,
  type StrategyProfile,
} from "./scheduler-policy.js";
import { isDemoMode } from "../runtime/mode.js";

export interface WalletScheduleInput {
  enabled?: boolean;
  tradeAmountUsd?: string | number;
  minIntervalMinutes?: number;
  maxDailyTrades?: number | null;
  strategyProfile?: StrategyProfile;
  failedTxPauseThreshold?: number;
  emergencyPaused?: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

const localActor = "local";

const parsePositiveNumber = (
  value: string | number | undefined,
  field: string,
) => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be greater than zero`);
  }

  return String(value);
};

const parseNonNegativeInteger = (
  value: number | null | undefined,
  field: string,
) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return value;
};

export class SchedulerServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "SchedulerServiceError";
  }
}

const schedulerAllowsProfile = (profile: StrategyProfile) =>
  profile !== "MANUAL_ONLY";

export class SchedulerService {
  private queues: SchedulerQueues | null = null;
  private workers: Worker[] = [];
  private started = false;

  constructor(private readonly db: DbClient) {}

  async status() {
    const queues = this.queues ?? createSchedulerQueues();
    const shouldClose = this.queues === null;
    const [quote, trade, confirmation, notification] = await Promise.all([
      queues.quoteQueue.getJobCounts(),
      queues.tradeQueue.getJobCounts(),
      queues.confirmationQueue.getJobCounts(),
      queues.notificationQueue.getJobCounts(),
    ]);

    if (shouldClose) {
      await Promise.all([
        queues.quoteQueue.close(),
        queues.tradeQueue.close(),
        queues.confirmationQueue.close(),
        queues.notificationQueue.close(),
      ]);
    }

    return {
      started: this.started,
      dryRun: process.env.DRY_RUN !== "false",
      liveSchedulerEnabled: process.env.SCHEDULER_LIVE_EXECUTION === "true",
      queues: {
        quoteQueue: quote,
        tradeQueue: trade,
        confirmationQueue: confirmation,
        notificationQueue: notification,
      },
    };
  }

  async start() {
    if (isDemoMode() && process.env.SCHEDULER_LIVE_EXECUTION === "true") {
      throw new SchedulerServiceError(
        "Live scheduler refuses to start while DEMO_MODE=true",
        409,
      );
    }

    if (
      process.env.SCHEDULER_LIVE_EXECUTION === "true" &&
      process.env.DRY_RUN !== "false"
    ) {
      throw new SchedulerServiceError(
        "Live scheduler refuses to start while DRY_RUN=true",
        409,
      );
    }

    if (this.started) {
      return await this.status();
    }

    this.queues = createSchedulerQueues();
    const workerOptions: WorkerOptions = {
      connection: bullQueueOptions().connection,
    };
    this.workers = [
      new Worker(queueNames.quote, processQuoteJob(), workerOptions),
      new Worker(
        queueNames.trade,
        processTradeJob(this.db, this.queues),
        workerOptions,
      ),
      new Worker(
        queueNames.confirmation,
        processConfirmationJob(this.db, this.queues),
        workerOptions,
      ),
      new Worker(
        queueNames.notification,
        processNotificationJob(this.db),
        workerOptions,
      ),
    ];
    this.started = true;

    await this.enqueueEnabledWallets();
    await this.enqueueSubmittedTransactions();

    return await this.status();
  }

  async stop() {
    await Promise.all(this.workers.map((worker) => worker.close()));
    this.workers = [];
    this.started = false;

    if (this.queues) {
      await Promise.all([
        this.queues.quoteQueue.drain(true),
        this.queues.tradeQueue.drain(true),
        this.queues.confirmationQueue.drain(true),
        this.queues.notificationQueue.drain(true),
      ]);
      await Promise.all([
        this.queues.quoteQueue.close(),
        this.queues.tradeQueue.close(),
        this.queues.confirmationQueue.close(),
        this.queues.notificationQueue.close(),
      ]);
      this.queues = null;
    }

    return await this.status();
  }

  async getWalletSchedule(walletId: string) {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId));
    if (!wallet) {
      throw new SchedulerServiceError("Wallet not found", 404);
    }

    const [schedule] = await this.db
      .select()
      .from(walletSchedules)
      .where(eq(walletSchedules.walletId, walletId));

    return (
      schedule ?? {
        id: null,
        walletId,
        enabled: false,
        tradeAmountUsd: "1",
        minIntervalMinutes: 60,
        maxDailyTrades: wallet.maxDailyTrades,
        strategyProfile: "MANUAL_ONLY" as const,
        emergencyPaused: false,
        failedTxPauseThreshold: 3,
        lastScheduledAt: null,
        createdAt: null,
        updatedAt: null,
      }
    );
  }

  async updateWalletSchedule(walletId: string, input: WalletScheduleInput) {
    await this.getWalletSchedule(walletId);
    const tradeAmountUsd = parsePositiveNumber(
      input.tradeAmountUsd,
      "tradeAmountUsd",
    );
    const maxDailyTrades = parseNonNegativeInteger(
      input.maxDailyTrades,
      "maxDailyTrades",
    );
    const failedTxPauseThreshold = parseNonNegativeInteger(
      input.failedTxPauseThreshold,
      "failedTxPauseThreshold",
    );
    const minIntervalMinutes = parseNonNegativeInteger(
      input.minIntervalMinutes,
      "minIntervalMinutes",
    );

    const updates = {
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(tradeAmountUsd === undefined ? {} : { tradeAmountUsd }),
      ...(minIntervalMinutes === undefined
        ? {}
        : { minIntervalMinutes: Math.max(1, minIntervalMinutes ?? 1) }),
      ...(maxDailyTrades === undefined ? {} : { maxDailyTrades }),
      ...(input.strategyProfile === undefined
        ? {}
        : { strategyProfile: input.strategyProfile }),
      ...(input.emergencyPaused === undefined
        ? {}
        : { emergencyPaused: input.emergencyPaused }),
      ...(failedTxPauseThreshold === undefined
        ? {}
        : { failedTxPauseThreshold: failedTxPauseThreshold ?? 3 }),
      updatedAt: new Date(),
    };
    const [existing] = await this.db
      .select()
      .from(walletSchedules)
      .where(eq(walletSchedules.walletId, walletId));

    const [schedule] = existing
      ? await this.db
          .update(walletSchedules)
          .set(updates)
          .where(eq(walletSchedules.walletId, walletId))
          .returning()
      : await this.db
          .insert(walletSchedules)
          .values({
            walletId,
            enabled: input.enabled ?? false,
            tradeAmountUsd: tradeAmountUsd ?? "1",
            minIntervalMinutes: minIntervalMinutes ?? 60,
            maxDailyTrades: maxDailyTrades ?? null,
            strategyProfile: input.strategyProfile ?? "MANUAL_ONLY",
            emergencyPaused: input.emergencyPaused ?? false,
            failedTxPauseThreshold: failedTxPauseThreshold ?? 3,
          })
          .returning();

    if (!schedule) {
      throw new SchedulerServiceError("Failed to update wallet schedule", 500);
    }

    await this.db.insert(auditLogs).values({
      actor: localActor,
      action: "wallet.schedule.update",
      entityType: "wallet",
      entityId: walletId,
      metadataJson: {
        enabled: schedule.enabled,
        strategyProfile: schedule.strategyProfile,
      },
    });

    return schedule;
  }

  async emergencyPause(walletId: string) {
    const [wallet] = await this.db
      .update(wallets)
      .set({ status: "PAUSED", updatedAt: new Date() })
      .where(eq(wallets.id, walletId))
      .returning();

    if (!wallet) {
      throw new SchedulerServiceError("Wallet not found", 404);
    }

    await this.updateWalletSchedule(walletId, {
      enabled: false,
      emergencyPaused: true,
    });
    await this.db.insert(auditLogs).values({
      actor: localActor,
      action: "wallet.emergency_pause",
      entityType: "wallet",
      entityId: walletId,
      metadataJson: { status: "PAUSED" },
    });
    const telegram = createTelegramService(this.db);
    await telegram
      .notify({
        eventType: "emergency pause",
        walletName: wallet.name,
        walletAddress: wallet.address,
        action: "PAUSE",
        pair: "scheduler",
        amount: "0",
        status: "PAUSED",
        txHash: null,
        basescanUrl: null,
        timestamp: new Date(),
      })
      .catch(() => undefined);

    return wallet;
  }

  private async enqueueEnabledWallets() {
    if (!this.queues) {
      return;
    }

    const [scheduleRows, walletRows, statsRows, ruleRows, pairRows, tokenRows] =
      await Promise.all([
        this.db.select().from(walletSchedules),
        this.db.select().from(wallets),
        this.db
          .select()
          .from(dailyWalletStats)
          .where(gte(dailyWalletStats.date, today())),
        this.db.select().from(walletPairRules),
        this.db.select().from(pairs),
        this.db.select().from(tokens),
      ]);
    const walletMap = new Map(walletRows.map((wallet) => [wallet.id, wallet]));
    const statsMap = new Map(statsRows.map((stats) => [stats.walletId, stats]));
    const pairMap = new Map(pairRows.map((pair) => [pair.id, pair]));
    const tokenMap = new Map(tokenRows.map((token) => [token.id, token]));

    for (const schedule of scheduleRows) {
      const wallet = walletMap.get(schedule.walletId);
      if (!wallet || !schedulerAllowsProfile(schedule.strategyProfile)) {
        continue;
      }

      const stats = statsMap.get(schedule.walletId);
      const reasons = canScheduleWallet({
        scheduleEnabled: schedule.enabled,
        emergencyPaused: schedule.emergencyPaused,
        walletStatus: wallet.status,
        dailyTxCount: stats?.txCount ?? 0,
        maxDailyTrades: schedule.maxDailyTrades ?? wallet.maxDailyTrades,
        dailyLossUsd: Number(stats?.estimatedLossUsd ?? 0),
        maxDailyLossUsd: wallet.maxDailyLossUsd
          ? Number(wallet.maxDailyLossUsd)
          : null,
      });

      if (reasons.length > 0) {
        continue;
      }
      if (
        schedule.lastScheduledAt &&
        Date.now() - schedule.lastScheduledAt.getTime() <
          nextRunDelayMs(schedule.minIntervalMinutes)
      ) {
        continue;
      }

      const allowedRule = ruleRows.find((rule) => {
        if (rule.walletId !== schedule.walletId || !rule.enabled) {
          return false;
        }
        const pair = pairMap.get(rule.pairId);
        if (!pair?.enabled) {
          return false;
        }
        const tokenIn = tokenMap.get(pair.tokenInId);
        const tokenOut = tokenMap.get(pair.tokenOutId);
        if (!tokenIn?.enabled || !tokenOut?.enabled) {
          return false;
        }
        if (
          schedule.strategyProfile === "STABLE_ONLY" &&
          !["USDC", "EURC", "DAI"].includes(tokenOut.symbol)
        ) {
          return false;
        }

        return true;
      });

      if (!allowedRule) {
        continue;
      }

      await this.queues.tradeQueue.add(
        "scheduled-trade",
        {
          walletId: schedule.walletId,
          pairId: allowedRule.pairId,
          amountIn: schedule.tradeAmountUsd,
          mode:
            process.env.SCHEDULER_LIVE_EXECUTION === "true"
              ? "LIVE"
              : "DRY_RUN",
        },
        {
          ...defaultJobOptions,
        },
      );
      await this.db
        .update(walletSchedules)
        .set({ lastScheduledAt: new Date(), updatedAt: new Date() })
        .where(eq(walletSchedules.id, schedule.id));
    }
  }

  private async enqueueSubmittedTransactions() {
    if (!this.queues) {
      return;
    }

    const submittedRows = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.status, "SUBMITTED"));

    for (const transaction of submittedRows) {
      await this.queues.confirmationQueue.add(
        "submitted-transaction-refresh",
        {
          transactionId: transaction.id,
          walletId: transaction.walletId,
        },
        defaultJobOptions,
      );
    }
  }
}

export const isSchedulerError = (
  error: unknown,
): error is SchedulerServiceError => error instanceof SchedulerServiceError;
