// Provider circuit breaker and rate limiter
// Prevents hammering the quote provider with 10+ wallet dry-runs

export type CircuitState = "CLOSED" | "HALF_OPEN" | "OPEN";

export interface CircuitBreakerConfig {
  // Maximum concurrent quote requests
  maxConcurrent: number;
  // Maximum requests per second
  maxPerSecond: number;
  // Maximum requests per minute
  maxPerMinute: number;
  // Number of 429 errors before opening circuit
  rateLimitThreshold: number;
  // Time in ms to wait before transitioning OPEN -> HALF_OPEN
  halfOpenAfterMs: number;
  // Time in ms to wait before auto-closing circuit from HALF_OPEN
  resetAfterMs: number;
  // Cooldown period after hitting rate limit
  cooldownAfterRateLimitMs: number;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  rejectedRequests: number;
  currentConcurrent: number;
  rateLimit429Count: number;
  lastRateLimitedAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCode: string | null;
  circuitOpenedAt: Date | null;
  circuitClosedAt: Date | null;
  halfOpenAttempts: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
}

const defaultConfig: CircuitBreakerConfig = {
  maxConcurrent: 5,
  maxPerSecond: 10,
  maxPerMinute: 50,
  rateLimitThreshold: 3,
  halfOpenAfterMs: 60_000,
  resetAfterMs: 30_000,
  cooldownAfterRateLimitMs: 30_000,
};

export class ProviderCircuitBreaker {
  private state: CircuitState = "CLOSED";
  private config: CircuitBreakerConfig;
  private metrics: CircuitBreakerMetrics;

  // Rate limiting tracking
  private requestTimestamps: number[] = [];
  private minuteTimestamps: number[] = [];

  // Concurrency tracking
  private activeRequests = 0;

  // Circuit breaker state
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private circuitOpenedAt: Date | null = null;
  private circuitClosedAt: Date | null = null;
  private lastRateLimitedAt: Date | null = null;
  private lastErrorAt: Date | null = null;
  private lastErrorCode: string | null = null;
  private rateLimit429Count = 0;
  private inCooldownUntil: Date | null = null;

  // Half-open probe tracking
  private halfOpenAttempts = 0;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.metrics = this.initMetrics();
  }

  private initMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      rejectedRequests: 0,
      currentConcurrent: 0,
      rateLimit429Count: 0,
      lastRateLimitedAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
      circuitOpenedAt: null,
      circuitClosedAt: null,
      halfOpenAttempts: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
    };
  }

  // Check if a new request can be accepted
  canAcceptRequest(): { allowed: boolean; reason?: string } {
    const now = Date.now();

    // Check cooldown period
    if (this.inCooldownUntil && now < this.inCooldownUntil.getTime()) {
      this.metrics.rejectedRequests++;
      return {
        allowed: false,
        reason: `Provider in cooldown until ${this.inCooldownUntil.toISOString()}`,
      };
    }

    // Check circuit state
    if (this.state === "OPEN") {
      if (
        this.circuitOpenedAt &&
        now - this.circuitOpenedAt.getTime() >= this.config.halfOpenAfterMs
      ) {
        // Time to try half-open
        this.transitionTo("HALF_OPEN");
      } else {
        this.metrics.rejectedRequests++;
        return {
          allowed: false,
          reason: `Circuit breaker is OPEN. Will retry after ${this.config.halfOpenAfterMs / 1000}s`,
        };
      }
    }

    // Check concurrent limit
    if (this.activeRequests >= this.config.maxConcurrent) {
      this.metrics.rejectedRequests++;
      return {
        allowed: false,
        reason: `Max concurrent requests (${this.config.maxConcurrent}) reached`,
      };
    }

    // Check rate limits
    this.cleanupTimestamps();
    const secondAgo = now - 1000;
    const minuteAgo = now - 60_000;

    if (this.requestTimestamps.filter((t) => t > secondAgo).length >= this.config.maxPerSecond) {
      this.metrics.rejectedRequests++;
      return {
        allowed: false,
        reason: `Rate limit: max ${this.config.maxPerSecond} requests/second`,
      };
    }

    if (this.minuteTimestamps.filter((t) => t > minuteAgo).length >= this.config.maxPerMinute) {
      this.metrics.rejectedRequests++;
      return {
        allowed: false,
        reason: `Rate limit: max ${this.config.maxPerMinute} requests/minute`,
      };
    }

    return { allowed: true };
  }

  // Record that we're starting a request
  startRequest(): void {
    this.activeRequests++;
    this.requestTimestamps.push(Date.now());
    this.minuteTimestamps.push(Date.now());
    this.metrics.currentConcurrent = this.activeRequests;
    this.metrics.totalRequests++;
  }

  // Record successful request completion
  recordSuccess(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses++;
    this.metrics.currentConcurrent = this.activeRequests;
    this.metrics.successfulRequests++;
    this.lastErrorCode = null;

    // If in half-open and succeeded, close the circuit
    if (this.state === "HALF_OPEN" && this.consecutiveSuccesses >= 2) {
      this.transitionTo("CLOSED");
    }
  }

  // Record failed request
  recordFailure(errorCode?: string, isRateLimited = false): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.metrics.currentConcurrent = this.activeRequests;
    this.metrics.failedRequests++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastErrorAt = new Date();
    if (errorCode) {
      this.lastErrorCode = errorCode;
    }
    this.metrics.lastErrorAt = this.lastErrorAt;
    this.metrics.lastErrorCode = errorCode ?? null;

    if (isRateLimited) {
      this.metrics.rateLimitedRequests++;
      this.metrics.rateLimit429Count++;
      this.lastRateLimitedAt = new Date();
      this.metrics.lastRateLimitedAt = this.lastRateLimitedAt;
      this.rateLimit429Count++;
      this.inCooldownUntil = new Date(Date.now() + this.config.cooldownAfterRateLimitMs);

      // If we hit the rate limit threshold, open the circuit
      if (this.rateLimit429Count >= this.config.rateLimitThreshold) {
        this.transitionTo("OPEN");
      }
    } else {
      // Non-rate-limit failure
      // If too many consecutive failures in CLOSED state, open circuit
      if (this.consecutiveFailures >= this.config.rateLimitThreshold && this.state === "CLOSED") {
        this.transitionTo("OPEN");
      } else if (this.state === "HALF_OPEN") {
        // Any failure in half-open goes back to open
        this.transitionTo("OPEN");
      }
    }
  }

  // Get current metrics
  getMetrics(): CircuitBreakerMetrics {
    return {
      ...this.metrics,
      state: this.state,
      rateLimit429Count: this.rateLimit429Count,
      lastRateLimitedAt: this.lastRateLimitedAt,
      lastErrorAt: this.lastErrorAt,
      lastErrorCode: this.lastErrorCode,
      circuitOpenedAt: this.circuitOpenedAt,
      circuitClosedAt: this.circuitClosedAt,
      halfOpenAttempts: this.halfOpenAttempts,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
    };
  }

  // Force transition to a specific state (for testing/admin)
  forceState(state: CircuitState): void {
    this.transitionTo(state);
  }

  // Reset all metrics
  reset(): void {
    this.state = "CLOSED";
    this.metrics = this.initMetrics();
    this.requestTimestamps = [];
    this.minuteTimestamps = [];
    this.activeRequests = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.circuitOpenedAt = null;
    this.circuitClosedAt = null;
    this.lastRateLimitedAt = null;
    this.lastErrorAt = null;
    this.lastErrorCode = null;
    this.rateLimit429Count = 0;
    this.inCooldownUntil = null;
    this.halfOpenAttempts = 0;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === "OPEN") {
      this.circuitOpenedAt = new Date();
      this.metrics.circuitOpenedAt = this.circuitOpenedAt;
      this.circuitClosedAt = null;
      this.halfOpenAttempts = 0;
    } else if (newState === "CLOSED") {
      this.circuitClosedAt = new Date();
      this.metrics.circuitClosedAt = this.circuitClosedAt;
      this.circuitOpenedAt = null;
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
      this.rateLimit429Count = 0;
      this.inCooldownUntil = null;
    } else if (newState === "HALF_OPEN") {
      this.halfOpenAttempts++;
      this.metrics.halfOpenAttempts = this.halfOpenAttempts;
    }

    this.metrics.state = newState;
    console.info(`[circuit-breaker] State transition: ${oldState} -> ${newState}`);
  }

  private cleanupTimestamps(): void {
    const now = Date.now();
    const cutoffSecond = now - 1000;
    const cutoffMinute = now - 60_000;

    this.requestTimestamps = this.requestTimestamps.filter((t) => t > cutoffSecond);
    this.minuteTimestamps = this.minuteTimestamps.filter((t) => t > cutoffMinute);
  }
}

// Global circuit breaker instance
let globalCircuitBreaker: ProviderCircuitBreaker | null = null;

export const getCircuitBreaker = (): ProviderCircuitBreaker => {
  if (!globalCircuitBreaker) {
    globalCircuitBreaker = new ProviderCircuitBreaker();
  }
  return globalCircuitBreaker;
};

export const resetCircuitBreaker = (): void => {
  if (globalCircuitBreaker) {
    globalCircuitBreaker.reset();
  }
};

// Utility to wrap provider calls with circuit breaker
export interface CircuitBreakerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  circuitOpen?: boolean;
  rateLimited?: boolean;
}

export const withCircuitBreaker = async <T>(
  provider: () => Promise<T>,
  onRateLimited?: (errorCode: string) => void,
): Promise<CircuitBreakerResult<T>> => {
  const breaker = getCircuitBreaker();

  const canProceed = breaker.canAcceptRequest();
  if (!canProceed.allowed) {
    return {
      success: false,
      error: canProceed.reason,
      circuitOpen: breaker.getMetrics().state === "OPEN",
      rateLimited: breaker.getMetrics().state === "OPEN",
    };
  }

  breaker.startRequest();
  try {
    const result = await provider();
    breaker.recordSuccess();
    return { success: true, data: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isRateLimited =
      errorMessage.includes("429") ||
      errorMessage.includes("rate limit") ||
      errorMessage.includes("TOO_MANY_REQUESTS");

    breaker.recordFailure(errorMessage, isRateLimited);

    if (isRateLimited && onRateLimited) {
      onRateLimited("PROVIDER_RATE_LIMITED");
    }

    return {
      success: false,
      error: errorMessage,
      rateLimited: isRateLimited,
    };
  }
};