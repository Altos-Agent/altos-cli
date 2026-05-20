import { afterEach, describe, expect, it, vi } from "vitest";
import { createInMemoryDb } from "../test-utils/in-memory-db.js";
import { schedulerJobs } from "../db/schema.js";
import { SchedulerService } from "./scheduler-service.js";
import { processTradeJob } from "./trade.worker.js";
import type { SchedulerQueues } from "./queues.js";

const originalDryRun = process.env.DRY_RUN;
const now = new Date("2026-01-01T00:00:00.000Z");

const baseRows = (overrides?: {
  walletStatus?: "ACTIVE" | "PAUSED" | "DISABLED";
  schedule?: Record<string, unknown>;
  schedulerJobs?: Record<string, unknown>[];
}) => ({
  wallets: [
    {
      id: "wallet-1",
      name: "Scheduler Wallet",
      address: "0x0000000000000000000000000000000000000001",
      encryptedPrivateKey: "encrypted",
      encryptionVersion: 1,
      status: overrides?.walletStatus ?? "ACTIVE",
      maxTradeUsd: "100",
      maxDailyTrades: 5,
      maxDailyLossUsd: "50",
      maxGasUsd: "5",
      notes: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
  tokens: [
    {
      id: "token-usdc",
      chainId: 8453,
      symbol: "USDC",
      name: "USD Coin",
      address: "0x0000000000000000000000000000000000000002",
      decimals: 6,
      riskLevel: "LOW",
      maxTradeUsd: null,
      enabled: true,
      verificationStatus: "VERIFIED",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "token-weth",
      chainId: 8453,
      symbol: "WETH",
      name: "Wrapped Ether",
      address: "0x0000000000000000000000000000000000000003",
      decimals: 18,
      riskLevel: "LOW",
      maxTradeUsd: null,
      enabled: true,
      verificationStatus: "VERIFIED",
      createdAt: now,
      updatedAt: now,
    },
  ],
  routers: [
    {
      id: "router-0x",
      chainId: 8453,
      name: "0x",
      address: null,
      enabled: true,
      riskLevel: "LOW",
      verificationStatus: "VERIFIED",
      notes: null,
    },
  ],
  pairs: [
    {
      id: "pair-1",
      chainId: 8453,
      tokenInId: "token-usdc",
      tokenOutId: "token-weth",
      enabled: true,
      maxTradeUsd: "90",
      maxSlippageBps: 50,
      maxPriceImpactBps: 100,
      preferredRouter: "0x",
      fallbackRouter: null,
      createdAt: now,
      updatedAt: now,
    },
  ],
  walletPairRules: [
    {
      id: "rule-1",
      walletId: "wallet-1",
      pairId: "pair-1",
      enabled: true,
      maxTradeUsd: "80",
      maxDailyTrades: 3,
      createdAt: now,
      updatedAt: now,
    },
  ],
  walletSchedules: [
    {
      id: "schedule-1",
      walletId: "wallet-1",
      enabled: true,
      tradeAmountUsd: "25",
      minIntervalMinutes: 60,
      maxDailyRuns: 5,
      strategyProfile: "STABLE_ONLY",
      emergencyPaused: false,
      failedTxPauseThreshold: 3,
      nextRunAt: now,
      lastRunAt: null,
      lastStatus: null,
      failureCount: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides?.schedule,
    },
  ],
  schedulerJobs: overrides?.schedulerJobs ?? [],
});

const fakeQueues = () => {
  const addedTradeJobs: {
    name: string;
    data: Record<string, unknown>;
    options: Record<string, unknown> | undefined;
  }[] = [];
  const tradeQueue = {
    add: vi.fn(async (name, data, options) => {
      addedTradeJobs.push({ name, data, options });
      return { id: options?.jobId ?? `job-${addedTradeJobs.length}` };
    }),
    close: vi.fn(async () => undefined),
    drain: vi.fn(async () => undefined),
    getJobCounts: vi.fn(async () => ({
      waiting: addedTradeJobs.length,
      active: 0,
      failed: 0,
    })),
  };
  const queue = {
    add: vi.fn(async () => ({ id: "side-job" })),
    close: vi.fn(async () => undefined),
    drain: vi.fn(async () => undefined),
    getJobCounts: vi.fn(async () => ({ waiting: 0, active: 0, failed: 0 })),
  };
  const queues = {
    quoteQueue: queue,
    tradeQueue,
    confirmationQueue: queue,
    notificationQueue: queue,
  } as unknown as SchedulerQueues;

  return { queues, tradeQueue, addedTradeJobs };
};

const createService = (
  seed?: Parameters<typeof createInMemoryDb>[0],
  queueState = fakeQueues(),
) => {
  const { db, tables } = createInMemoryDb(seed);
  const workers = [{ close: vi.fn(async () => undefined) }];
  const service = new SchedulerService(db as never, {
    createQueues: () => queueState.queues,
    createWorkers: () => workers,
    ownerId: "test-owner",
    now: () => now,
    autoLoop: false,
  });

  return { service, tables, workers, ...queueState };
};

describe("scheduler service lifecycle and recurrence", () => {
  afterEach(() => {
    if (originalDryRun === undefined) {
      delete process.env.DRY_RUN;
    } else {
      process.env.DRY_RUN = originalDryRun;
    }
  });

  it("starting the scheduler twice does not duplicate a pending schedule job", async () => {
    process.env.DRY_RUN = "true";
    const { service, tables, addedTradeJobs } = createService(baseRows());

    await service.start();
    await service.start();

    expect(addedTradeJobs).toHaveLength(1);
    expect(tables.schedulerJobs).toHaveLength(1);
    expect(tables.schedulerJobs[0]?.status).toBe("PENDING");
  });

  it("stopping the scheduler does not drain pending queue jobs", async () => {
    process.env.DRY_RUN = "true";
    const { service, tradeQueue, addedTradeJobs, workers } = createService(
      baseRows(),
    );

    await service.start();
    await service.stop();

    expect(addedTradeJobs).toHaveLength(1);
    expect(tradeQueue.drain).not.toHaveBeenCalled();
    expect(workers[0]?.close).toHaveBeenCalled();
  });

  it("does not schedule disabled or emergency-paused wallets", async () => {
    process.env.DRY_RUN = "true";
    const disabled = createService(baseRows({ walletStatus: "DISABLED" }));
    await disabled.service.start();
    expect(disabled.addedTradeJobs).toHaveLength(0);

    const paused = createService(
      baseRows({ schedule: { emergencyPaused: true } }),
    );
    await paused.service.start();
    expect(paused.addedTradeJobs).toHaveLength(0);
  });

  it("enforces max daily runs before enqueueing another job", async () => {
    process.env.DRY_RUN = "true";
    const { service, addedTradeJobs } = createService(
      baseRows({
        schedule: { maxDailyRuns: 1 },
        schedulerJobs: [
          {
            id: "scheduler-job-1",
            walletId: "wallet-1",
            scheduleId: "schedule-1",
            jobType: "DRY_RUN",
            status: "COMPLETED",
            reason: "DRY_RUN",
            createdAt: now,
            startedAt: now,
            finishedAt: now,
          },
        ],
      }),
    );

    await service.start();

    expect(addedTradeJobs).toHaveLength(0);
  });
});

describe("trade worker scheduler job records", () => {
  afterEach(() => {
    if (originalDryRun === undefined) {
      delete process.env.DRY_RUN;
    } else {
      process.env.DRY_RUN = originalDryRun;
    }
  });

  it("creates a DRY_RUN transaction record for scheduled dry-run jobs", async () => {
    process.env.DRY_RUN = "true";
    const { db, tables } = createInMemoryDb(baseRows());
    const [jobRecord] = await db
      .insert(schedulerJobs)
      .values({
        walletId: "wallet-1",
        scheduleId: "schedule-1",
        jobType: "DRY_RUN",
        status: "PENDING",
        reason: "due",
      })
      .returning();

    await processTradeJob(db as never, fakeQueues().queues)({
      id: "bull-job-1",
      data: {
        walletId: "wallet-1",
        pairId: "pair-1",
        scheduleId: "schedule-1",
        schedulerJobId: jobRecord?.id ?? "missing-job",
        amountIn: "25",
        mode: "DRY_RUN",
      },
    } as never);

    expect(tables.transactions).toHaveLength(1);
    expect(tables.transactions[0]?.status).toBe("DRY_RUN");
    expect(tables.schedulerJobs[0]?.status).toBe("COMPLETED");
    expect(tables.walletSchedules[0]?.lastStatus).toBe("DRY_RUN");
    expect(tables.walletSchedules[0]?.lastRunAt).toBeInstanceOf(Date);
    expect(tables.walletSchedules[0]?.nextRunAt).toEqual(
      new Date(
        (tables.walletSchedules[0]?.lastRunAt as Date).getTime() +
          60 * 60 * 1000,
      ),
    );
  });

  it("rejects live scheduled execution and records the failed scheduler job", async () => {
    process.env.DRY_RUN = "false";
    const { db, tables } = createInMemoryDb(baseRows());
    const [jobRecord] = await db
      .insert(schedulerJobs)
      .values({
        walletId: "wallet-1",
        scheduleId: "schedule-1",
        jobType: "LIVE",
        status: "PENDING",
        reason: "operator misconfiguration",
      })
      .returning();

    await expect(
      processTradeJob(db as never, fakeQueues().queues)({
        id: "bull-job-1",
        data: {
          walletId: "wallet-1",
          pairId: "pair-1",
          scheduleId: "schedule-1",
          schedulerJobId: jobRecord?.id ?? "missing-job",
          amountIn: "25",
          mode: "LIVE",
        },
      } as never),
    ).rejects.toThrow("Live scheduled execution is not implemented");

    expect(tables.transactions).toHaveLength(0);
    expect(tables.schedulerJobs[0]?.status).toBe("FAILED");
    expect(tables.walletSchedules[0]?.lastStatus).toBe("FAILED");
  });
});
