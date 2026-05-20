// Typed errors for quote/RPC/provider paths
// Each error includes: provider name, chain id, wallet id, pair id,
// request id, retryable boolean, safe public message, internal redacted metadata

export type ProviderErrorCode =
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "STALE_QUOTE"
  | "SIMULATION_FAILED"
  | "HIGH_PRICE_IMPACT"
  | "HIGH_SLIPPAGE"
  | "INVALID_QUOTE_TARGET"
  | "RPC_FINALITY_LAG"
  | "RPC_NONCE_MISMATCH"
  | "UNKNOWN_PROVIDER";

export interface ProviderErrorMetadata {
  provider?: string;
  chainId?: number;
  walletId?: string;
  pairId?: string;
  requestId?: string;
  retryable: boolean;
  // Internal metadata - redacted in public-facing messages
  internal?: Record<string, unknown>;
}

export class ProviderError extends Error {
  public readonly code: ProviderErrorCode;
  public readonly provider: string | null;
  public readonly chainId: number | null;
  public readonly walletId: string | null;
  public readonly pairId: string | null;
  public readonly requestId: string | null;
  public readonly retryable: boolean;
  public readonly internal: Record<string, unknown>;

  constructor(
    code: ProviderErrorCode,
    message: string,
    metadata: ProviderErrorMetadata,
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.provider = metadata.provider ?? null;
    this.chainId = metadata.chainId ?? null;
    this.walletId = metadata.walletId ?? null;
    this.pairId = metadata.pairId ?? null;
    this.requestId = metadata.requestId ?? null;
    this.retryable = metadata.retryable;
    this.internal = metadata.internal ?? {};
  }

  toSafeJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

export class ProviderRateLimitedError extends ProviderError {
  constructor(metadata: ProviderErrorMetadata & { retryAfterMs?: number }) {
    super(
      "PROVIDER_RATE_LIMITED",
      "Rate limit exceeded. Please wait before retrying.",
      {
        ...metadata,
        retryable: true,
        internal: {
          ...metadata.internal,
          retryAfterMs: metadata.retryAfterMs,
        },
      },
    );
    this.name = "ProviderRateLimitedError";
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(metadata: ProviderErrorMetadata) {
    super(
      "PROVIDER_UNAVAILABLE",
      "Provider is temporarily unavailable. Retrying...",
      { ...metadata, retryable: true },
    );
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(metadata: ProviderErrorMetadata & { timeoutMs?: number }) {
    super(
      "PROVIDER_TIMEOUT",
      "Provider request timed out. Retrying...",
      {
        ...metadata,
        retryable: true,
        internal: {
          ...metadata.internal,
          timeoutMs: metadata.timeoutMs,
        },
      },
    );
    this.name = "ProviderTimeoutError";
  }
}

export class StaleQuoteError extends ProviderError {
  constructor(metadata: ProviderErrorMetadata & { quoteAgeMs?: number }) {
    super(
      "STALE_QUOTE",
      "Quote is stale and can no longer be executed.",
      {
        ...metadata,
        retryable: false,
        internal: {
          ...metadata.internal,
          quoteAgeMs: metadata.quoteAgeMs,
        },
      },
    );
    this.name = "StaleQuoteError";
  }
}

export class SimulationFailedError extends ProviderError {
  constructor(metadata: ProviderErrorMetadata & { simulationError?: string }) {
    super(
      "SIMULATION_FAILED",
      "Transaction simulation failed. Please try again.",
      {
        ...metadata,
        retryable: true,
        internal: {
          ...metadata.internal,
          simulationError: metadata.simulationError,
        },
      },
    );
    this.name = "SimulationFailedError";
  }
}

export class HighPriceImpactError extends ProviderError {
  constructor(
    metadata: ProviderErrorMetadata & { priceImpactBps?: number; threshold?: number },
  ) {
    super(
      "HIGH_PRICE_IMPACT",
      "Price impact exceeds safety threshold.",
      {
        ...metadata,
        retryable: false,
        internal: {
          ...metadata.internal,
          priceImpactBps: metadata.priceImpactBps,
          threshold: metadata.threshold,
        },
      },
    );
    this.name = "HighPriceImpactError";
  }
}

export class HighSlippageError extends ProviderError {
  constructor(
    metadata: ProviderErrorMetadata & { slippageBps?: number; threshold?: number },
  ) {
    super(
      "HIGH_SLIPPAGE",
      "Slippage exceeds safety threshold.",
      {
        ...metadata,
        retryable: false,
        internal: {
          ...metadata.internal,
          slippageBps: metadata.slippageBps,
          threshold: metadata.threshold,
        },
      },
    );
    this.name = "HighSlippageError";
  }
}

export class InvalidQuoteTargetError extends ProviderError {
  constructor(metadata: ProviderErrorMetadata & { targetAddress?: string }) {
    super(
      "INVALID_QUOTE_TARGET",
      "Quote target address is invalid or unsafe.",
      {
        ...metadata,
        retryable: false,
        internal: {
          ...metadata.internal,
          targetAddress: metadata.targetAddress,
        },
      },
    );
    this.name = "InvalidQuoteTargetError";
  }
}

export class RpcFinalityLagError extends ProviderError {
  constructor(metadata: ProviderErrorMetadata & { lagMs?: number; threshold?: number }) {
    super(
      "RPC_FINALITY_LAG",
      "RPC node is lagging behind. Retrying with alternative node...",
      {
        ...metadata,
        retryable: true,
        internal: {
          ...metadata.internal,
          lagMs: metadata.lagMs,
          threshold: metadata.threshold,
        },
      },
    );
    this.name = "RpcFinalityLagError";
  }
}

export class RpcNonceMismatchError extends ProviderError {
  constructor(metadata: ProviderErrorMetadata & { expectedNonce?: number; actualNonce?: number }) {
    super(
      "RPC_NONCE_MISMATCH",
      "Transaction nonce mismatch. Please retry.",
      {
        ...metadata,
        retryable: true,
        internal: {
          ...metadata.internal,
          expectedNonce: metadata.expectedNonce,
          actualNonce: metadata.actualNonce,
        },
      },
    );
    this.name = "RpcNonceMismatchError";
  }
}

export class UnknownProviderError extends ProviderError {
  constructor(metadata: ProviderErrorMetadata & { originalError?: string }) {
    super(
      "UNKNOWN_PROVIDER",
      "An unexpected provider error occurred.",
      {
        ...metadata,
        retryable: true,
        internal: {
          ...metadata.internal,
          originalError: metadata.originalError,
        },
      },
    );
    this.name = "UnknownProviderError";
  }
}

// Type guards
export const isProviderError = (error: unknown): error is ProviderError => {
  return error instanceof ProviderError;
};

export const isRetryableProviderError = (error: unknown): error is ProviderError => {
  return isProviderError(error) && error.retryable;
};

export const isSafeToRetryJob = (mode: "DRY_RUN" | "LIVE") => mode === "DRY_RUN";

// Error code categorization
export const isRetryableErrorCode = (code: ProviderErrorCode): boolean => {
  const nonRetryableCodes: ProviderErrorCode[] = [
    "STALE_QUOTE",
    "HIGH_PRICE_IMPACT",
    "HIGH_SLIPPAGE",
    "INVALID_QUOTE_TARGET",
  ];
  return !nonRetryableCodes.includes(code);
};

export const getErrorCode = (error: unknown): ProviderErrorCode | null => {
  if (isProviderError(error)) {
    return error.code;
  }
  return null;
};