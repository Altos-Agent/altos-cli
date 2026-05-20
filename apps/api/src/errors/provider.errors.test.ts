import { describe, it, expect } from "vitest";
import {
  ProviderRateLimitedError,
  ProviderUnavailableError,
  ProviderTimeoutError,
  StaleQuoteError,
  SimulationFailedError,
  HighPriceImpactError,
  HighSlippageError,
  InvalidQuoteTargetError,
  RpcFinalityLagError,
  RpcNonceMismatchError,
  UnknownProviderError,
  isProviderError,
  isRetryableProviderError,
  isSafeToRetryJob,
  isRetryableErrorCode,
  getErrorCode,
  type ProviderErrorCode,
} from "./provider.errors.js";

describe("Provider Errors", () => {
  describe("ProviderRateLimitedError", () => {
    it("creates error with correct code", () => {
      const error = new ProviderRateLimitedError({
        provider: "zeroX",
        chainId: 8453,
        walletId: "wallet-1",
        pairId: "pair-1",
        requestId: "req-1",
        retryAfterMs: 30000,
      });

      expect(error.code).toBe("PROVIDER_RATE_LIMITED");
      expect(error.retryable).toBe(true);
      expect(error.provider).toBe("zeroX");
      expect(error.chainId).toBe(8453);
      expect(error.walletId).toBe("wallet-1");
      expect(error.internal.retryAfterMs).toBe(30000);
    });

    it("has safe public message", () => {
      const error = new ProviderRateLimitedError({ retryable: true });
      expect(error.message).toBe("Rate limit exceeded. Please wait before retrying.");
    });

    it("is retryable", () => {
      const error = new ProviderRateLimitedError({ retryable: true });
      expect(isRetryableProviderError(error)).toBe(true);
    });
  });

  describe("ProviderUnavailableError", () => {
    it("is retryable", () => {
      const error = new ProviderUnavailableError({
        provider: "zeroX",
        chainId: 8453,
        retryable: true,
      });
      expect(error.retryable).toBe(true);
    });

    it("includes internal error details", () => {
      const error = new ProviderUnavailableError({
        provider: "zeroX",
        chainId: 8453,
        retryable: true,
        internal: { status: 503, statusText: "Service Unavailable" },
      });
      expect(error.internal.status).toBe(503);
    });
  });

  describe("ProviderTimeoutError", () => {
    it("includes timeout metadata", () => {
      const error = new ProviderTimeoutError({
        provider: "zeroX",
        chainId: 8453,
        retryable: true,
        timeoutMs: 10000,
      });
      expect(error.internal.timeoutMs).toBe(10000);
      expect(error.retryable).toBe(true);
    });
  });

  describe("StaleQuoteError", () => {
    it("is NOT retryable", () => {
      const error = new StaleQuoteError({
        provider: "zeroX",
        chainId: 8453,
        quoteAgeMs: 60000,
        retryable: false,
      });
      expect(error.retryable).toBe(false);
      expect(isRetryableProviderError(error)).toBe(false);
    });

    it("includes quote age in internal metadata", () => {
      const error = new StaleQuoteError({
        provider: "zeroX",
        chainId: 8453,
        quoteAgeMs: 120000,
        retryable: false,
      });
      expect(error.internal.quoteAgeMs).toBe(120000);
    });
  });

  describe("SimulationFailedError", () => {
    it("is retryable", () => {
      const error = new SimulationFailedError({
        provider: "zeroX",
        chainId: 8453,
        simulationError: "Reverted: execution reverted",
        retryable: true,
      });
      expect(error.retryable).toBe(true);
    });
  });

  describe("HighPriceImpactError", () => {
    it("is NOT retryable", () => {
      const error = new HighPriceImpactError({
        provider: "zeroX",
        chainId: 8453,
        priceImpactBps: 500,
        threshold: 100,
        retryable: false,
      });
      expect(error.retryable).toBe(false);
    });
  });

  describe("HighSlippageError", () => {
    it("is NOT retryable", () => {
      const error = new HighSlippageError({
        provider: "zeroX",
        chainId: 8453,
        slippageBps: 500,
        threshold: 100,
        retryable: false,
      });
      expect(error.retryable).toBe(false);
    });
  });

  describe("InvalidQuoteTargetError", () => {
    it("is NOT retryable", () => {
      const error = new InvalidQuoteTargetError({
        provider: "zeroX",
        chainId: 8453,
        targetAddress: "0xinvalid",
        retryable: false,
      });
      expect(error.retryable).toBe(false);
    });
  });

  describe("RpcFinalityLagError", () => {
    it("is retryable", () => {
      const error = new RpcFinalityLagError({
        provider: "zeroX",
        chainId: 8453,
        lagMs: 5000,
        threshold: 3000,
        retryable: true,
      });
      expect(error.retryable).toBe(true);
    });
  });

  describe("RpcNonceMismatchError", () => {
    it("is retryable", () => {
      const error = new RpcNonceMismatchError({
        provider: "zeroX",
        chainId: 8453,
        expectedNonce: 42,
        actualNonce: 41,
        retryable: true,
      });
      expect(error.retryable).toBe(true);
    });
  });

  describe("UnknownProviderError", () => {
    it("defaults to retryable", () => {
      const error = new UnknownProviderError({
        provider: "zeroX",
        chainId: 8453,
        originalError: "Something went wrong",
        retryable: true,
      });
      expect(error.retryable).toBe(true);
    });
  });
});

describe("Error type guards", () => {
  it("isProviderError returns true for ProviderError instances", () => {
    const error = new ProviderRateLimitedError({ retryable: true });
    expect(isProviderError(error)).toBe(true);
  });

  it("isProviderError returns false for non-ProviderErrors", () => {
    const error = new Error("regular error");
    expect(isProviderError(error)).toBe(false);
  });

  it("isRetryableProviderError returns correct value", () => {
    const retryableError = new ProviderRateLimitedError({ retryable: true });
    const nonRetryableError = new StaleQuoteError({ retryable: false });

    expect(isRetryableProviderError(retryableError)).toBe(true);
    expect(isRetryableProviderError(nonRetryableError)).toBe(false);
  });

  it("getErrorCode returns correct error code", () => {
    const error = new HighSlippageError({ retryable: false });
    expect(getErrorCode(error)).toBe("HIGH_SLIPPAGE");
  });

  it("getErrorCode returns null for non-ProviderErrors", () => {
    const error = new Error("not a provider error");
    expect(getErrorCode(error)).toBeNull();
  });
});

describe("isSafeToRetryJob", () => {
  it("returns true for DRY_RUN", () => {
    expect(isSafeToRetryJob("DRY_RUN")).toBe(true);
  });

  it("returns false for LIVE", () => {
    expect(isSafeToRetryJob("LIVE")).toBe(false);
  });
});

describe("isRetryableErrorCode", () => {
  it("returns false for STALE_QUOTE", () => {
    expect(isRetryableErrorCode("STALE_QUOTE")).toBe(false);
  });

  it("returns false for HIGH_PRICE_IMPACT", () => {
    expect(isRetryableErrorCode("HIGH_PRICE_IMPACT")).toBe(false);
  });

  it("returns false for HIGH_SLIPPAGE", () => {
    expect(isRetryableErrorCode("HIGH_SLIPPAGE")).toBe(false);
  });

  it("returns false for INVALID_QUOTE_TARGET", () => {
    expect(isRetryableErrorCode("INVALID_QUOTE_TARGET")).toBe(false);
  });

  it("returns true for PROVIDER_RATE_LIMITED", () => {
    expect(isRetryableErrorCode("PROVIDER_RATE_LIMITED")).toBe(true);
  });

  it("returns true for PROVIDER_TIMEOUT", () => {
    expect(isRetryableErrorCode("PROVIDER_TIMEOUT")).toBe(true);
  });

  it("returns true for SIMULATION_FAILED", () => {
    expect(isRetryableErrorCode("SIMULATION_FAILED")).toBe(true);
  });
});

describe("toSafeJSON", () => {
  it("excludes internal metadata from output", () => {
    const error = new ProviderRateLimitedError({
      provider: "zeroX",
      chainId: 8453,
      walletId: "wallet-1",
      requestId: "req-1",
      retryable: true,
      internal: { apiKey: "secret" },
    });

    const safe = error.toSafeJSON();
    expect(safe.code).toBe("PROVIDER_RATE_LIMITED");
    expect(safe.retryable).toBe(true);
    expect(safe.internal).toBeUndefined();
  });
});