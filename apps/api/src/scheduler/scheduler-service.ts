import { eq, gte, inArray, and } from "drizzle-orm";
import { Worker, type WorkerOptions } from "bullmq";
import type { DbClient } from "../db/client.js";
import {
  auditLogs,
  dailyWalletStats,
  localSettings,
  pairs,
  pendingWalletLocks,
  scheduleOccurrences,
  schedulerJobs,
  schedulerLocks,
  schedulerRuns,
  tokens,
  transactions,
  walletPairRules,
  wallets,
  walletSchedules,
  type SchedulerRun,
} from "../db/schema.js";
import { createTelegramService } from "../notifications/telegram.js";
import {
  bullQueueOptions,
  createSchedulerQueues,
  defaultJobOptions,
  getRetryableJobOptions,
  queueNames,
  type SchedulerQueues,
} from "./queues.js";
import { processConfirmationJob } from "./confirmation.worker.js";
import { processNotificationJob } from "./notification.worker.js";
import { processQuoteJob } from "./quote.worker.js";
import { processTradeJob } from "./trade.worker.js";
import { processReconciliationJob, type ReconciliationJob } from "../reconciliation/reconciliation-worker.js";
import {
  canScheduleWallet,
  type StrategyProfile,
} from "./scheduler-policy.js";
import { isDemoMode } from "../runtime/mode.js";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { assertGlobalEmergencyNotPaused } from "../security/emergency-pause.js";
import { getCurrentRequestId } from "../http/request-context.js";
import { getCircuitBreaker } from "../quote/provider-circuit-breaker.js";
import { getDlqStats } from "./dlq.service.js";
import {
  createOrGetOccurrence,
  generateIdempotencyKey,
  reconcileStaleOccurrences,
} from "./occurrence.service.js";

export interface WalletScheduleInput {
  enabled?: boolean;
  tradeAmountUsd?: string | number;
  minIntervalMinutes?: number;
  maxDailyRuns?: number | null;
  maxDailyTrades?: number | null | undefined;
  strategyProfile?: StrategyProfile;
  failedTxPauseThreshold?: number;
  emergencyPaused?: boolean;
}

interface WorkerLike {
  close(force?: boolean): Promise<void>;
}

interface SchedulerServiceOptions {
  createQueues?: () => SchedulerQueues;
  createWorkers?: (queues: SchedulerQueues) => WorkerLike[];
  ownerId?: string;
  now?: () => Date;
  autoLoop?: boolean;
  loopIntervalMs?: number;
  lockTtlMs?: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const startOfToday = () => new Date(`${today()}T00:00:00.000Z`);
const localActor = "local";
const schedulerLockName = "scheduler-loop";
const defaultLoopIntervalMs = 30_000;
const defaultLockTtlMs = 90_000;

const schedulerAllowsProfile = (profile: StrategyProfile) =>
  profile !== "MANUAL_ONLY";

const ownerId = () =>
  `scheduler-${process.pid}-${Math.random().toString(16).slice(2)}`;

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

export class SchedulerService {
  private queues: SchedulerQueues | null = null;
  private workers: WorkerLike[] = [];
  private started = false;
  private paused = false;
  private currentRunId: string | null = null;
  private readonly ownerId: string;
  private readonly now: () => Date;
  private readonly autoLoop: boolean;
  private readonly loopIntervalMs: number;
  private readonly lockTtlMs: number;
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private runningTick = false;

  constructor(
    private readonly db: DbClient,
    private readonly options: SchedulerServiceOptions = {},
  ) {
    this.ownerId = options.ownerId ?? ownerId();
    this.now = options.now ?? (() => new Date());
    this.autoLoop = options.autoLoop ?? true;
    this.loopIntervalMs = options.loopIntervalMs ?? defaultLoopIntervalMs;
    this.lockTtlMs = options.lockTtlMs ?? defaultLockTtlMs;
  }

  async status() {
    const queues = this.queues ?? this.createQueues();
    const shouldClose = this.queues === null;
    const [quote, trade, confirmation, notification] = await Promise.all([
      queues.quoteQueue.getJobCounts(),
      queues.tradeQueue.getJobCounts(),
      queues.confirmationQueue.getJobCounts(),
      queues.notificationQueue.getJobCounts(),
    ]);

    if (shouldClose) {
      await this.closeQueues(queues);
    }

    const [lock] = await this.db
      .select()
      .from(schedulerLocks)
      .where(eq(schedulerLocks.name, schedulerLockName));
    const activeLock =
      lock?.ownerId && lock.expiresAt && lock.expiresAt.getTime() > this.now().getTime()
        ? lock
        : null;
    const [settings] = await this.db.select().from(localSettings);
    const schedules = await this.db.select().from(walletSchedules);
    const walletRows = await this.db.select().from(wallets);
    const jobs = await this.db.select().from(schedulerJobs);
    const walletMap = new Map(walletRows.map((wallet) => [wallet.id, wallet]));
    const nextRuns = schedules
      .filter((schedule) => schedule.enabled && schedule.nextRunAt)
      .sort(
        (left, right) =>
          (left.nextRunAt?.getTime() ?? 0) - (right.nextRunAt?.getTime() ?? 0),
      )
      .slice(0, 8)
      .map((schedule) => ({
        walletId: schedule.walletId,
        walletName: walletMap.get(schedule.walletId)?.name ?? "Unknown wallet",
        scheduleId: schedule.id,
        nextRunAt: schedule.nextRunAt?.toISOString() ?? null,
        lastStatus: schedule.lastStatus,
        emergencyPaused: schedule.emergencyPaused,
      }));
    const failedJobs = jobs
      .filter((job) => job.status === "FAILED")
      .sort(
        (left, right) =>
          (right.createdAt as Date).getTime() - (left.createdAt as Date).getTime(),
      )
      .slice(0, 8)
      .map((job) => ({
        id: job.id,
        walletId: job.walletId,
        scheduleId: job.scheduleId,
        jobType: job.jobType,
        status: job.status,
        reason: job.reason,
        createdAt: job.createdAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
      }));
    const pausedWallets = schedules
      .filter((schedule) => schedule.emergencyPaused)
      .map((schedule) => ({
        walletId: schedule.walletId,
        walletName: walletMap.get(schedule.walletId)?.name ?? "Unknown wallet",
        scheduleId: schedule.id,
        emergencyPaused: schedule.emergencyPaused,
      }));

    // Get DLQ stats
    const dlqStats = await getDlqStats(this.db);

    // Get circuit breaker metrics
    const circuitBreaker = getCircuitBreaker();
    const circuitMetrics = circuitBreaker.getMetrics();

    return {
      started: this.started,
      activeLoop: Boolean(
        this.started &&
          !this.paused &&
          activeLock &&
          activeLock.ownerId === this.ownerId,
      ),
      paused: this.paused,
      lockOwner: activeLock?.ownerId ?? null,
      lockHeartbeatAt: activeLock?.heartbeatAt?.toISOString() ?? null,
      lockExpiresAt: activeLock?.expiresAt?.toISOString() ?? null,
      dryRun: getRuntimeConfig().dryRun,
      liveSchedulerEnabled: getRuntimeConfig().schedulerLiveExecution,
      schedulerMode: getRuntimeConfig().schedulerLiveExecution
        ? "LIVE_REJECTED"
        : "DRY_RUN_ONLY",
      emergencyPaused: settings?.globalEmergencyPaused ?? false,
      nextRuns,
      failedJobs,
      pausedWallets,
      queues: {
        quoteQueue: quote,
        tradeQueue: trade,
        confirmationQueue: confirmation,
        notificationQueue: notification,
      },
      dlq: {
        total: dlqStats.total,
        unresolved: dlqStats.unresolved,
        retryableUnresolved: dlqStats.retryableUnresolved,
        byErrorCode: dlqStats.byErrorCode,
      },
      provider: {
        circuitState: circuitMetrics.state,
        rateLimit429Count: circuitMetrics.rateLimit429Count,
        totalRequests: circuitMetrics.totalRequests,
        successfulRequests: circuitMetrics.successfulRequests,
        failedRequests: circuitMetrics.failedRequests,
        rejectedRequests: circuitMetrics.rejectedRequests,
        currentConcurrent: circuitMetrics.currentConcurrent,
        lastErrorAt: circuitMetrics.lastErrorAt?.toISOString() ?? null,
        lastErrorCode: circuitMetrics.lastErrorCode,
        lastRateLimitedAt: circuitMetrics.lastRateLimitedAt?.toISOString() ?? null,
      },
    };
  }

  async start() {
    await assertGlobalEmergencyNotPaused(this.db);
    const config = getRuntimeConfig();

    if (config.schedulerLiveExecution) {
      throw new SchedulerServiceError(
        "Live scheduled execution is not implemented",
        409,
      );
    }

    if (isDemoMode() && config.schedulerLiveExecution) {
      throw new SchedulerServiceError(
        "Live scheduler refuses to start while DEMO_MODE=true",
        409,
      );
    }

    if (this.started && !this.paused) {
      return await this.status();
    }

    const lockAcquired = await this.acquireLock();
    if (!lockAcquired) {
      throw new SchedulerServiceError(
        "Scheduler loop is already active on another owner",
        409,
      );
    }

    if (!this.queues) {
      this.queues = this.createQueues();
    }
    if (this.workers.length === 0) {
      this.workers = this.createWorkers(this.queues);
    }
    this.started = true;
    this.paused = false;
    await this.createRunRecord();
    this.startHeartbeat();

    // Reconcile stale occurrences from previous runs before scheduling new work
    const reconciledCount = await reconcileStaleOccurrences(this.db);
    if (reconciledCount > 0) {
      console.info(`[scheduler] reconciled ${reconciledCount} stale occurrences`);
    }

    await this.runSchedulerTick();
    await this.enqueueSubmittedTransactions();
    if (this.autoLoop) {
      this.startLoop();
    }

    return await this.status();
  }

  async pause() {
    this.stopLoop();
    this.stopHeartbeat();
    this.paused = true;
    await this.finishRunRecord("PAUSED");
    await this.releaseLock();

    return await this.status();
  }

  async stop() {
    this.stopLoop();
    this.stopHeartbeat();
    await Promise.all(this.workers.map((worker) => worker.close()));
    this.workers = [];
    this.started = false;
    this.paused = false;
    await this.finishRunRecord("STOPPED");
    await this.releaseLock();

    if (this.queues) {
      await this.closeQueues(this.queues);
      this.queues = null;
    }

    return await this.status();
  }

  async purgeQueues(confirm: string) {
    if (confirm !== "PURGE SCHEDULER QUEUES") {
      throw new SchedulerServiceError(
        "Queue purge requires PURGE SCHEDULER QUEUES confirmation",
        400,
      );
    }
    const queues = this.queues ?? this.createQueues();
    const shouldClose = this.queues === null;
    await Promise.all([
      queues.quoteQueue.drain(true),
      queues.tradeQueue.drain(true),
      queues.confirmationQueue.drain(true),
      queues.notificationQueue.drain(true),
      queues.reconciliationQueue.drain(true),
    ]);
    if (shouldClose) {
      await this.closeQueues(queues);
    }

    await this.db.insert(auditLogs).values({
      actor: localActor,
      action: "scheduler.queues.purge",
      entityType: "scheduler",
      entityId: schedulerLockName,
      metadataJson: { requestId: getCurrentRequestId() },
    });

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
        maxDailyRuns: wallet.maxDailyTrades,
        strategyProfile: "MANUAL_ONLY" as const,
        emergencyPaused: false,
        failedTxPauseThreshold: 3,
        lastScheduledAt: null,
        nextRunAt: null,
        lastRunAt: null,
        lastStatus: null,
        failureCount: 0,
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
    const maxDailyRuns = parseNonNegativeInteger(
      input.maxDailyRuns ?? input.maxDailyTrades,
      "maxDailyRuns",
    );
    const failedTxPauseThreshold = parseNonNegativeInteger(
      input.failedTxPauseThreshold,
      "failedTxPauseThreshold",
    );
    const minIntervalMinutes = parseNonNegativeInteger(
      input.minIntervalMinutes,
      "minIntervalMinutes",
    );
    const [existing] = await this.db
      .select()
      .from(walletSchedules)
      .where(eq(walletSchedules.walletId, walletId));

    const updates = {
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.enabled === true && !existing?.nextRunAt
        ? { nextRunAt: this.now() }
        : {}),
      ...(tradeAmountUsd === undefined ? {} : { tradeAmountUsd }),
      ...(minIntervalMinutes === undefined
        ? {}
        : { minIntervalMinutes: Math.max(1, minIntervalMinutes ?? 1) }),
      ...(maxDailyRuns === undefined
        ? {}
        : { maxDailyRuns, maxDailyTrades: maxDailyRuns }),
      ...(input.strategyProfile === undefined
        ? {}
        : { strategyProfile: input.strategyProfile }),
      ...(input.emergencyPaused === undefined
        ? {}
        : { emergencyPaused: input.emergencyPaused }),
      ...(failedTxPauseThreshold === undefined
        ? {}
        : { failedTxPauseThreshold: failedTxPauseThreshold ?? 3 }),
      updatedAt: this.now(),
    };

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
            maxDailyTrades: maxDailyRuns ?? null,
            maxDailyRuns: maxDailyRuns ?? null,
            strategyProfile: input.strategyProfile ?? "MANUAL_ONLY",
            emergencyPaused: input.emergencyPaused ?? false,
            failedTxPauseThreshold: failedTxPauseThreshold ?? 3,
            nextRunAt: input.enabled ? this.now() : null,
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
        requestId: getCurrentRequestId(),
      },
    });

    return schedule;
  }

  async emergencyPause(walletId: string) {
    const [wallet] = await this.db
      .update(wallets)
      .set({ status: "PAUSED", updatedAt: this.now() })
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
      metadataJson: { status: "PAUSED", requestId: getCurrentRequestId() },
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
        timestamp: this.now(),
      })
      .catch(() => undefined);

    return wallet;
  }

  private createQueues() {
    return this.options.createQueues?.() ?? createSchedulerQueues();
  }

  private createWorkers(queues: SchedulerQueues) {
    if (this.options.createWorkers) {
      return this.options.createWorkers(queues);
    }
    const workerOptions: WorkerOptions = {
      connection: bullQueueOptions().connection,
    };

    return [
      new Worker(queueNames.quote, processQuoteJob(), workerOptions),
      new Worker(queueNames.trade, processTradeJob(this.db, queues), workerOptions),
      new Worker(
        queueNames.confirmation,
        processConfirmationJob(this.db, queues),
        workerOptions,
      ),
      new Worker(queueNames.notification, processNotificationJob(this.db), workerOptions),
      new Worker(
        queueNames.reconciliation,
        processReconciliationJob(this.db),
        workerOptions,
      ),
    ];
  }

  private async closeQueues(queues: SchedulerQueues) {
    await Promise.all([
      queues.quoteQueue.close(),
      queues.tradeQueue.close(),
      queues.confirmationQueue.close(),
      queues.notificationQueue.close(),
      queues.reconciliationQueue.close(),
    ]);
  }

  private async acquireLock() {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.lockTtlMs);
    const [lock] = await this.db
      .select()
      .from(schedulerLocks)
      .where(eq(schedulerLocks.name, schedulerLockName));

    if (
      lock &&
      lock.ownerId &&
      lock.ownerId !== this.ownerId &&
      lock.expiresAt &&
      lock.expiresAt.getTime() > now.getTime()
    ) {
      return false;
    }

    if (lock) {
      await this.db
        .update(schedulerLocks)
        .set({
          ownerId: this.ownerId,
          heartbeatAt: now,
          expiresAt,
          updatedAt: now,
        })
        .where(eq(schedulerLocks.name, schedulerLockName))
        .returning();
      return true;
    }

    await this.db.insert(schedulerLocks).values({
      name: schedulerLockName,
      ownerId: this.ownerId,
      heartbeatAt: now,
      expiresAt,
      updatedAt: now,
    });
    return true;
  }

  private async heartbeatLock() {
    const now = this.now();
    const [lock] = await this.db
      .select()
      .from(schedulerLocks)
      .where(eq(schedulerLocks.name, schedulerLockName));
    if (!lock || lock.ownerId !== this.ownerId) {
      await this.pause();
      return;
    }

    await this.db
      .update(schedulerLocks)
      .set({
        heartbeatAt: now,
        expiresAt: new Date(now.getTime() + this.lockTtlMs),
        updatedAt: now,
      })
      .where(eq(schedulerLocks.name, schedulerLockName))
      .returning();

    if (this.currentRunId) {
      await this.db
        .update(schedulerRuns)
        .set({ heartbeatAt: now, updatedAt: now })
        .where(eq(schedulerRuns.id, this.currentRunId))
        .returning();
    }
  }

  private async releaseLock() {
    const now = this.now();
    const [lock] = await this.db
      .select()
      .from(schedulerLocks)
      .where(eq(schedulerLocks.name, schedulerLockName));
    if (!lock || lock.ownerId !== this.ownerId) {
      return;
    }

    await this.db
      .update(schedulerLocks)
      .set({
        ownerId: null,
        heartbeatAt: now,
        expiresAt: now,
        updatedAt: now,
      })
      .where(eq(schedulerLocks.name, schedulerLockName))
      .returning();
  }

  private async createRunRecord() {
    const [run] = (await this.db
      .insert(schedulerRuns)
      .values({
        ownerId: this.ownerId,
        status: "RUNNING",
        startedAt: this.now(),
        heartbeatAt: this.now(),
      })
      .returning()) as SchedulerRun[];
    this.currentRunId = run?.id ?? null;
  }

  private async finishRunRecord(status: "PAUSED" | "STOPPED") {
    if (!this.currentRunId) {
      return;
    }
    await this.db
      .update(schedulerRuns)
      .set({
        status,
        stoppedAt: this.now(),
        stopReason: status.toLowerCase(),
        updatedAt: this.now(),
      })
      .where(eq(schedulerRuns.id, this.currentRunId))
      .returning();
    this.currentRunId = null;
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeatLock().catch((error) => {
        console.error("[scheduler] heartbeat failed", error);
      });
    }, Math.max(5_000, Math.floor(this.lockTtlMs / 3)));
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private startLoop() {
    this.stopLoop();
    this.loopTimer = setInterval(() => {
      void this.runSchedulerTick().catch((error) => {
        console.error("[scheduler] loop tick failed", error);
        void import("../ops/alert-webhook.js").then(
          ({ alertSchedulerFailure }) =>
            alertSchedulerFailure(String(error)).catch(() => undefined),
        );
      });
    }, this.loopIntervalMs);
  }

  private stopLoop() {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  private async runSchedulerTick() {
    if (this.runningTick || !this.queues) {
      return;
    }
    this.runningTick = true;
    try {
      await this.heartbeatLock();
      await this.enqueueDueWalletSchedules();
      await this.scheduleReconciliationForActiveLocks();
    } finally {
      this.runningTick = false;
    }
  }

  private async enqueueDueWalletSchedules() {
    if (!this.queues) {
      return;
    }

    const [
      scheduleRows,
      walletRows,
      statsRows,
      ruleRows,
      pairRows,
      tokenRows,
      jobRows,
    ] = await Promise.all([
      this.db.select().from(walletSchedules),
      this.db.select().from(wallets),
      this.db
        .select()
        .from(dailyWalletStats)
        .where(gte(dailyWalletStats.date, today())),
      this.db.select().from(walletPairRules),
      this.db.select().from(pairs),
      this.db.select().from(tokens),
      this.db
        .select()
        .from(schedulerJobs)
        .where(gte(schedulerJobs.createdAt, startOfToday())),
    ]);
    const walletMap = new Map(walletRows.map((wallet) => [wallet.id, wallet]));
    const statsMap = new Map(statsRows.map((stats) => [stats.walletId, stats]));
    const pairMap = new Map(pairRows.map((pair) => [pair.id, pair]));
    const tokenMap = new Map(tokenRows.map((token) => [token.id, token]));
    const now = this.now();

    for (const schedule of scheduleRows) {
      const wallet = walletMap.get(schedule.walletId);
      if (!wallet || !schedulerAllowsProfile(schedule.strategyProfile)) {
        continue;
      }
      if (schedule.nextRunAt && schedule.nextRunAt.getTime() > now.getTime()) {
        continue;
      }

      const existingPendingJob = jobRows.some(
        (job) =>
          job.scheduleId === schedule.id &&
          ["PENDING", "STARTED"].includes(String(job.status)),
      );
      if (existingPendingJob) {
        continue;
      }

      const dailyRunCount = jobRows.filter(
        (job) => job.scheduleId === schedule.id,
      ).length;
      const stats = statsMap.get(schedule.walletId);
      const reasons = canScheduleWallet({
        scheduleEnabled: schedule.enabled,
        emergencyPaused: schedule.emergencyPaused,
        walletStatus: wallet.status,
        dailyRunCount,
        maxDailyRuns:
          schedule.maxDailyRuns ?? schedule.maxDailyTrades ?? wallet.maxDailyTrades,
        dailyLossUsd: Number(stats?.estimatedLossUsd ?? 0),
        maxDailyLossUsd: wallet.maxDailyLossUsd
          ? Number(wallet.maxDailyLossUsd)
          : null,
        nonceStatus: wallet.nonceStatus,
      });

      if (reasons.length > 0) {
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
          !["USDC", "EURC", "DAI", "WETH"].includes(tokenOut.symbol)
        ) {
          return false;
        }

        return true;
      });

      if (!allowedRule) {
        continue;
      }

      // Create or get occurrence (idempotent — duplicate scheduler ticks create same occurrence)
      const scheduledFor = schedule.nextRunAt ?? this.now();
      const { occurrence, created } = await createOrGetOccurrence(this.db, {
        scheduleId: schedule.id,
        walletId: schedule.walletId,
        pairId: allowedRule.pairId,
        strategyProfileId: null,
        mode: "DRY_RUN",
        scheduledFor,
        requestId: getCurrentRequestId(),
        traceId: null,
      });

      // Skip if occurrence is already past PLANNED/QUEUED state (already processed or in-flight)
      if (
        occurrence.status !== "PLANNED" &&
        occurrence.status !== "QUEUED" &&
        occurrence.status !== "RUNNING"
      ) {
        continue;
      }

      const idempotencyKey = generateIdempotencyKey(
        schedule.id,
        schedule.walletId,
        allowedRule.pairId,
        "DRY_RUN",
        scheduledFor,
      );

      const [jobRecord] = await this.db
        .insert(schedulerJobs)
        .values({
          walletId: schedule.walletId,
          scheduleId: schedule.id,
          jobType: "DRY_RUN",
          status: "PENDING",
          reason: "schedule due",
        })
        .returning();

      if (!jobRecord) {
        continue;
      }

      await this.queues.tradeQueue.add(
        "scheduled-trade",
        {
          walletId: schedule.walletId,
          pairId: allowedRule.pairId,
          scheduleId: schedule.id,
          schedulerJobId: jobRecord.id,
          occurrenceId: occurrence.id,
          idempotencyKey,
          traceId: occurrence.traceId,
          amountIn: schedule.tradeAmountUsd,
          requestId: getCurrentRequestId(),
          mode: "DRY_RUN",
        },
        {
          ...getRetryableJobOptions("DRY_RUN"),
          jobId: `occ-${occurrence.id}`,
        },
      );

      // Mark as queued so we don't re-enqueue on next tick
      await this.markOccurrenceQueued(occurrence.id, `occ-${occurrence.id}`);
    }
  }

  private async markOccurrenceQueued(occurrenceId: string, jobId: string) {
    await this.db
      .update(scheduleOccurrences)
      .set({ status: "QUEUED", jobId, updatedAt: this.now() })
      .where(
        and(
          eq(scheduleOccurrences.id, occurrenceId),
          inArray(scheduleOccurrences.status, ["PLANNED", "RUNNING"]),
        ),
      )
      .returning();
  }

  private async enqueueSubmittedTransactions() {
    if (!this.queues) {
      return;
    }

    const submittedRows = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.status, "SUBMITTED"));
    const existingJobs = await this.db
      .select()
      .from(schedulerJobs)
      .where(inArray(schedulerJobs.status, ["PENDING", "STARTED"]));

    for (const transaction of submittedRows) {
      const alreadyPending = existingJobs.some(
        (job) =>
          job.walletId === transaction.walletId &&
          job.jobType === "CONFIRMATION" &&
          job.reason === transaction.id,
      );
      if (alreadyPending) {
        continue;
      }

      await this.db.insert(schedulerJobs).values({
        walletId: transaction.walletId,
        scheduleId: null,
        jobType: "CONFIRMATION",
        status: "PENDING",
        reason: transaction.id,
      });
      await this.queues.confirmationQueue.add(
        "submitted-transaction-refresh",
        {
          transactionId: transaction.id,
          walletId: transaction.walletId,
          requestId: getCurrentRequestId(),
        },
        defaultJobOptions,
      );
    }
  }

  private async scheduleReconciliationForActiveLocks() {
    if (!this.queues) {
      return;
    }

    const walletsWithActiveLocks = await this.db
      .select({ walletId: pendingWalletLocks.walletId })
      .from(pendingWalletLocks)
      .where(eq(pendingWalletLocks.status, "ACTIVE"))
      .groupBy(pendingWalletLocks.walletId);

    for (const { walletId } of walletsWithActiveLocks) {
      await this.queues.reconciliationQueue.add(
        "nonce-reconcile",
        { walletId },
        { ...defaultJobOptions, jobId: `reconcile-${walletId}` }
      );
    }
  }
}

export const isSchedulerError = (
  error: unknown,
): error is SchedulerServiceError => error instanceof SchedulerServiceError;
