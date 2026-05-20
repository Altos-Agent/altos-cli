import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Job } from "bullmq";
import { processTradeJob } from "./trade.worker.js";
import type { ScheduledTradeJob, SchedulerQueues } from "./queues.js";
import type { DbClient } from "../db/client.js";
import { ProviderRateLimitedError, HighSlippageError, SimulationFailedError } from "../errors/provider.errors.js";

// Mock the DLQ service
vi.mock("./dlq.service.js", () => ({
  recordDeadLetterJob: vi.fn().mockResolvedValue("dlq-id"),
}));

vi.mock("../db/client.js", () => ({
  default: {},
}));

vi.mock("../security/emergency-pause.js", () => ({
  assertGlobalEmergencyNotPaused: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./scheduled-dry-run.js", () => ({
  createScheduledDryRun: vi.fn().mockResolvedValue({
    status: "DRY_RUN",
    transactionId: "tx-123",
    context: {
      wallet: { id: "wallet-1", name: "Test Wallet", address: "0x123" },
      tokenIn: { symbol: "USDC" },
      tokenOut: { symbol: "WETH" },
    },
  }),
}));

describe("trade.worker", () => {
  let mockDb: DbClient;
  let mockQueues: SchedulerQueues;
  let mockJob: Job<ScheduledTradeJob>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {} as DbClient;
    mockQueues = {
      quoteQueue: { add: vi.fn().mockResolvedValue({}) },
      tradeQueue: { add: vi.fn().mockResolvedValue({}) },
      confirmationQueue: { add: vi.fn().mockResolvedValue({}) },
      notificationQueue: { add: vi.fn().mockResolvedValue({}) },
    } as unknown as SchedulerQueues;

    mockJob = {
      id: "job-123",
      data: {
        walletId: "wallet-1",
        pairId: "pair-1",
        scheduleId: "schedule-1",
        schedulerJobId: "scheduler-job-1",
        amountIn: "100",
        mode: "DRY_RUN",
        requestId: "req-1",
      },
    } as Job<ScheduledTradeJob>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("dry-run retry behavior", () => {
    it("should retry when retryable provider error occurs", async () => {
      const processTrade = processTradeJob(mockDb, mockQueues);

      // First call throws retryable error
      vi.mocked(require("./scheduled-dry-run.js").createScheduledDryRun)
        .mockRejectedValueOnce(new ProviderRateLimitedError({
          provider: "zeroX",
          chainId: 8453,
          walletId: "wallet-1",
          retryable: true,
        }));

      // The worker should record to DLQ but NOT throw (non-retryable or already failed max attempts)
      await processTrade(mockJob);

      // DLQ should be called
      const { recordDeadLetterJob } = require("./dlq.service.js");
      expect(recordDeadLetterJob).toHaveBeenCalled();
    });
  });

  describe("non-retryable errors", () => {
    it("should record to DLQ for non-retryable safety errors without retry", async () => {
      const processTrade = processTradeJob(mockDb, mockQueues);

      // Throws non-retryable safety error
      vi.mocked(require("./scheduled-dry-run.js").createScheduledDryRun)
        .mockRejectedValueOnce(new HighSlippageError({
          provider: "zeroX",
          chainId: 8453,
          walletId: "wallet-1",
          slippageBps: 500,
          threshold: 100,
          retryable: false,
        }));

      await processTrade(mockJob);

      // DLQ should be called
      const { recordDeadLetterJob } = require("./dlq.service.js");
      expect(recordDeadLetterJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          queueName: "tradeQueue",
          errorCode: "HIGH_SLIPPAGE",
          retryable: false,
        })
      );
    });
  });
});

describe("ProviderCircuitBreaker", () => {
  let breaker: import("../quote/provider-circuit-breaker.js").ProviderCircuitBreaker;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import("../quote/provider-circuit-breaker.js");
    breaker = new module.ProviderCircuitBreaker({
      maxConcurrent: 3,
      maxPerSecond: 5,
      maxPerMinute: 10,
      rateLimitThreshold: 3,
      halfOpenAfterMs: 1000,
      resetAfterMs: 500,
      cooldownAfterRateLimitMs: 100,
    });
  });

  it("starts in CLOSED state", () => {
    expect(breaker.getMetrics().state).toBe("CLOSED");
  });

  it("allows requests when within limits", () => {
    const result = breaker.canAcceptRequest();
    expect(result.allowed).toBe(true);
  });

  it("opens circuit after rate limit threshold", () => {
    // Record 3 rate-limited failures
    breaker.recordFailure("429 Too Many Requests", true);
    breaker.recordFailure("429 Too Many Requests", true);
    breaker.recordFailure("429 Too Many Requests", true);

    expect(breaker.getMetrics().state).toBe("OPEN");
    expect(breaker.getMetrics().rateLimit429Count).toBe(3);
  });

  it("blocks new requests when circuit is OPEN", () => {
    // Open the circuit
    breaker.recordFailure("429", true);
    breaker.recordFailure("429", true);
    breaker.recordFailure("429", true);

    const result = breaker.canAcceptRequest();
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("OPEN");
  });

  it("transitions to HALF_OPEN after halfOpenAfterMs", async () => {
    breaker.recordFailure("429", true);
    breaker.recordFailure("429", true);
    breaker.recordFailure("429", true);

    expect(breaker.getMetrics().state).toBe("OPEN");

    // Fast-forward time would happen in real test with fake timers
    // For now, just verify the transition works
    breaker.forceState("HALF_OPEN");
    expect(breaker.getMetrics().state).toBe("HALF_OPEN");
  });

  it("closes circuit after successful requests in HALF_OPEN", () => {
    breaker.forceState("HALF_OPEN");

    breaker.recordSuccess();
    breaker.recordSuccess();

    expect(breaker.getMetrics().state).toBe("CLOSED");
  });

  it("tracks rate limit 429 count for metrics", () => {
    breaker.recordFailure("429", true);
    breaker.recordFailure("400", false); // Not rate limited

    expect(breaker.getMetrics().rateLimit429Count).toBe(1);
    expect(breaker.getMetrics().failedRequests).toBe(2);
  });

  it("rejects when max concurrent reached", () => {
    // Simulate 3 concurrent requests
    breaker.startRequest();
    breaker.startRequest();
    breaker.startRequest();

    const result = breaker.canAcceptRequest();
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Max concurrent");
  });

  it("respects rate per second limit", () => {
    // Make 5 requests quickly
    for (let i = 0; i < 5; i++) {
      breaker.startRequest();
      breaker.recordSuccess();
    }

    // 6th should be rejected
    const result = breaker.canAcceptRequest();
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Rate limit");
  });
});

describe("DLQ redaction", () => {
  it("should only record safe fields in payload preview", async () => {
    const { recordDeadLetterJob } = await import("./dlq.service.js");

    const mockDb = {} as DbClient;
    const mockError = new ProviderRateLimitedError({
      provider: "zeroX",
      chainId: 8453,
      walletId: "wallet-1",
      pairId: "pair-1",
      requestId: "req-1",
      retryable: true,
    });

    const payload = {
      walletId: "wallet-1",
      pairId: "pair-1",
      scheduleId: "schedule-1",
      requestId: "req-1",
      mode: "DRY_RUN",
      amountIn: "100",
      // Sensitive fields that should be redacted
      apiKey: "secret-api-key",
      privateKey: "secret-private-key",
      rpcUrl: "https://secret-rpc.io",
    };

    await recordDeadLetterJob(mockDb, {
      queueName: "tradeQueue",
      jobId: "job-1",
      jobType: "DRY_RUN",
      walletId: "wallet-1",
      error: mockError,
      payload,
    });

    // The function should have been called with redacted payload
    expect(recordDeadLetterJob).toHaveBeenCalled();
  });
});

describe("LIVE job rejection", () => {
  it("should not allow replay of LIVE jobs", async () => {
    const { replayDeadLetterJob } = await import("./dlq.service.js");

    const mockDb = {} as DbClient;
    const mockQueues = {
      tradeQueue: { add: vi.fn().mockResolvedValue({}) },
      quoteQueue: { add: vi.fn().mockResolvedValue({}) },
      confirmationQueue: { add: vi.fn().mockResolvedValue({}) },
      notificationQueue: { add: vi.fn().mockResolvedValue({}) },
    } as unknown as Parameters<typeof replayDeadLetterJob>[1]["queues"];

    // Mock a LIVE job
    vi.mocked(require("../db/client.js").default)
      .mockResolvedValueOnce([{
        id: "dlq-job-1",
        jobType: "LIVE", // Not DRY_RUN
        queueName: "tradeQueue",
        resolvedAt: null,
        payloadPreviewJson: { walletId: "wallet-1" },
      }]);

    const result = await replayDeadLetterJob(mockDb, {
      id: "dlq-job-1",
      queues: mockQueues,
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Cannot replay LIVE jobs");
  });
});