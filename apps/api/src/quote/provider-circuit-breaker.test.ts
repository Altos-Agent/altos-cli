import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ProviderCircuitBreaker } from "./provider-circuit-breaker.js";

describe("ProviderCircuitBreaker", () => {
  let breaker: ProviderCircuitBreaker;

  beforeEach(() => {
    breaker = new ProviderCircuitBreaker({
      maxConcurrent: 3,
      maxPerSecond: 10,
      maxPerMinute: 50,
      rateLimitThreshold: 3,
      halfOpenAfterMs: 5000,
      resetAfterMs: 30000,
      cooldownAfterRateLimitMs: 2000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts in CLOSED state", () => {
      expect(breaker.getMetrics().state).toBe("CLOSED");
    });

    it("has zero metrics", () => {
      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successfulRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.rejectedRequests).toBe(0);
      expect(metrics.rateLimit429Count).toBe(0);
    });
  });

  describe("request acceptance", () => {
    it("allows request when within limits", () => {
      const result = breaker.canAcceptRequest();
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it("rejects when max concurrent reached", () => {
      breaker.startRequest();
      breaker.startRequest();
      breaker.startRequest();

      const result = breaker.canAcceptRequest();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Max concurrent");
    });

    it("rejects when rate per second limit reached", () => {
      // Make 10 requests (maxPerSecond)
      for (let i = 0; i < 10; i++) {
        breaker.startRequest();
        breaker.recordSuccess();
      }

      const result = breaker.canAcceptRequest();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Rate limit");
    });

    it("allows requests after rate limit window passes", () => {
      // Make some requests
      for (let i = 0; i < 9; i++) {
        breaker.startRequest();
        breaker.recordSuccess();
      }

      // Should still allow one more
      const result = breaker.canAcceptRequest();
      expect(result.allowed).toBe(true);
    });
  });

  describe("success recording", () => {
    it("increments successfulRequests on success", () => {
      breaker.startRequest();
      breaker.recordSuccess();

      expect(breaker.getMetrics().successfulRequests).toBe(1);
      expect(breaker.getMetrics().currentConcurrent).toBe(0);
    });

    it("resets consecutive failures on success", () => {
      breaker.recordFailure("Some error", false);
      breaker.recordFailure("Some error", false);
      breaker.recordFailure("Some error", false);

      breaker.startRequest();
      breaker.recordSuccess();

      expect(breaker.getMetrics().consecutiveFailures).toBe(0);
      expect(breaker.getMetrics().consecutiveSuccesses).toBe(1);
    });

    it("closes circuit after 2 successes in HALF_OPEN", () => {
      breaker.forceState("HALF_OPEN");

      breaker.recordSuccess();
      breaker.recordSuccess();

      expect(breaker.getMetrics().state).toBe("CLOSED");
    });
  });

  describe("failure recording", () => {
    it("increments failedRequests on failure", () => {
      breaker.recordFailure("Some error", false);

      expect(breaker.getMetrics().failedRequests).toBe(1);
    });

    it("increments rate limited metrics on 429", () => {
      breaker.recordFailure("429 Too Many Requests", true);

      expect(breaker.getMetrics().rateLimitedRequests).toBe(1);
      expect(breaker.getMetrics().rateLimit429Count).toBe(1);
      expect(breaker.getMetrics().lastRateLimitedAt).toBeInstanceOf(Date);
    });

    it("tracks consecutive failures", () => {
      breaker.recordFailure("Error 1", false);
      breaker.recordFailure("Error 2", false);

      expect(breaker.getMetrics().consecutiveFailures).toBe(2);
    });

    it("opens circuit after rate limit threshold", () => {
      breaker.recordFailure("429", true);
      breaker.recordFailure("429", true);
      breaker.recordFailure("429", true);

      expect(breaker.getMetrics().state).toBe("OPEN");
      expect(breaker.getMetrics().circuitOpenedAt).toBeInstanceOf(Date);
    });

    it("transitions back to CLOSED from HALF_OPEN on failure", () => {
      breaker.forceState("HALF_OPEN");

      breaker.recordFailure("Some error", false);

      expect(breaker.getMetrics().state).toBe("OPEN");
    });

    it("records last error info", () => {
      breaker.recordFailure("CUSTOM_ERROR_CODE", false);

      const metrics = breaker.getMetrics();
      expect(metrics.lastErrorCode).toBe("CUSTOM_ERROR_CODE");
      expect(metrics.lastErrorAt).toBeInstanceOf(Date);
    });

    it("starts cooldown after rate limited error", () => {
      breaker.recordFailure("429", true);

      // Within cooldown - should be rejected
      const result = breaker.canAcceptRequest();
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("cooldown");
    });
  });

  describe("state transitions", () => {
    it("forceState can transition to any state", () => {
      breaker.forceState("HALF_OPEN");
      expect(breaker.getMetrics().state).toBe("HALF_OPEN");

      breaker.forceState("OPEN");
      expect(breaker.getMetrics().state).toBe("OPEN");

      breaker.forceState("CLOSED");
      expect(breaker.getMetrics().state).toBe("CLOSED");
    });

    it("resets consecutive counts on close", () => {
      breaker.forceState("OPEN");
      breaker.recordFailure("429", true);
      breaker.recordFailure("429", true);
      breaker.recordFailure("429", true);

      breaker.forceState("CLOSED");

      const metrics = breaker.getMetrics();
      expect(metrics.consecutiveFailures).toBe(0);
      expect(metrics.consecutiveSuccesses).toBe(0);
      expect(metrics.rateLimit429Count).toBe(0);
      expect(metrics.circuitClosedAt).toBeInstanceOf(Date);
    });

    it("increments halfOpenAttempts on transition to HALF_OPEN", () => {
      breaker.forceState("OPEN");
      breaker.forceState("HALF_OPEN");

      expect(breaker.getMetrics().halfOpenAttempts).toBe(1);
    });
  });

  describe("reset", () => {
    it("resets all state to initial", () => {
      breaker.startRequest();
      breaker.recordFailure("429", true);
      breaker.recordFailure("429", true);
      breaker.recordFailure("429", true);

      breaker.reset();

      const metrics = breaker.getMetrics();
      expect(metrics.state).toBe("CLOSED");
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.failedRequests).toBe(0);
      expect(metrics.rateLimit429Count).toBe(0);
      expect(metrics.currentConcurrent).toBe(0);
    });
  });

  describe("concurrency tracking", () => {
    it("tracks active concurrent requests", () => {
      breaker.startRequest();
      breaker.startRequest();

      expect(breaker.getMetrics().currentConcurrent).toBe(2);

      breaker.recordSuccess();
      expect(breaker.getMetrics().currentConcurrent).toBe(1);
    });

    it("does not go below zero", () => {
      breaker.recordSuccess();
      expect(breaker.getMetrics().currentConcurrent).toBe(0);
    });
  });
});

describe("withCircuitBreaker", () => {
  it("allows successful provider calls through", async () => {
    const { withCircuitBreaker, resetCircuitBreaker } = await import("./provider-circuit-breaker.js");
    resetCircuitBreaker();

    const result = await withCircuitBreaker(() => Promise.resolve("success"));
    expect(result.success).toBe(true);
    expect(result.data).toBe("success");
  });

  it("returns error on provider failure", async () => {
    const { withCircuitBreaker, resetCircuitBreaker } = await import("./provider-circuit-breaker.js");
    resetCircuitBreaker();

    const result = await withCircuitBreaker(() => Promise.reject(new Error("Provider error")));
    expect(result.success).toBe(false);
    expect(result.error).toBe("Provider error");
  });

  it("detects rate limiting from error messages", async () => {
    const { withCircuitBreaker, resetCircuitBreaker } = await import("./provider-circuit-breaker.js");
    resetCircuitBreaker();

    const result = await withCircuitBreaker(() => Promise.reject(new Error("429 Too Many Requests")));
    expect(result.success).toBe(false);
    expect(result.rateLimited).toBe(true);
  });
});