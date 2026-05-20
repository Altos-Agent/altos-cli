import { Queue, type JobsOptions, type QueueOptions } from "bullmq";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { isSafeToRetryJob, isRetryableErrorCode, type ProviderError } from "../errors/provider.errors.js";

export const queueNames = {
  quote: "quoteQueue",
  trade: "tradeQueue",
  confirmation: "confirmationQueue",
  notification: "notificationQueue",
  reconciliation: "reconciliationQueue",
} as const;

export interface ScheduledTradeJob {
  walletId: string;
  pairId: string;
  scheduleId?: string | null;
  schedulerJobId?: string | null;
  occurrenceId: string;
  idempotencyKey: string;
  traceId?: string | null;
  amountIn: string;
  mode: "DRY_RUN" | "LIVE";
  requestId?: string | null;
}

export interface ConfirmationJob {
  transactionId: string;
  walletId: string;
  requestId?: string | null;
}

export interface NotificationJob {
  eventType:
    | "dry-run accepted"
    | "dry-run rejected"
    | "transaction submitted"
    | "transaction failed"
    | "transaction rejected"
    | "wallet paused due to risk limit"
    | "emergency pause";
  walletName: string;
  walletAddress: string;
  action: string;
  pair: string;
  amount: string;
  status: string;
  txHash: string | null;
  basescanUrl: string | null;
  walletId?: string | null;
  transactionId?: string | null;
  requestId?: string | null;
}

export interface ReconciliationJob {
  walletId: string;
}

const redisConnection = () => {
  const redisUrl = new URL(getRuntimeConfig().redisUrl);

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || "6379"),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname ? Number(redisUrl.pathname.slice(1) || "0") : 0,
    maxRetriesPerRequest: null
  };
};

export const bullQueueOptions = (): QueueOptions => ({
  connection: redisConnection()
});

// Retry configuration constants
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60000;

// Exponential backoff with jitter
export const calculateRetryBackoff = (attempt: number): number => {
  const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
};

// Determine if an error is retryable for job retry decisions
export const isJobRetryableError = (error: unknown): boolean => {
  if (!error) return false;

  // Check if it's a ProviderError with known retryability
  if (error instanceof Error && "code" in error) {
    const code = (error as ProviderError).code;
    if (typeof code === "string") {
      return isRetryableErrorCode(code as Parameters<typeof isRetryableErrorCode>[0]);
    }
  }

  // Default to non-retryable for unknown errors
  return false;
};

// Default job options - no automatic retries by default
// Jobs that should retry must be explicitly configured with retry options
export const defaultJobOptions: JobsOptions = {
  attempts: 1,
  removeOnComplete: 100,
  removeOnFail: 100
};

// Retry-enabled job options for dry-run jobs with transient errors
export const getRetryableJobOptions = (mode: "DRY_RUN" | "LIVE"): JobsOptions => {
  // Only dry-run jobs can safely retry
  if (!isSafeToRetryJob(mode)) {
    return { ...defaultJobOptions, attempts: 1 };
  }

  return {
    ...defaultJobOptions,
    attempts: MAX_RETRY_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: BASE_RETRY_DELAY_MS,
    },
    removeOnComplete: false, // Keep for debugging
    removeOnFail: false, // Keep for DLQ processing
  };
};

// Job options for jobs with non-retryable errors - fail immediately
export const getFailFastJobOptions = (): JobsOptions => {
  return {
    ...defaultJobOptions,
    attempts: 1,
    backoff: {
      type: "fixed",
      delay: 0,
    },
  };
};

export const createSchedulerQueues = () => {
  const options = bullQueueOptions();

  return {
    quoteQueue: new Queue(queueNames.quote, options),
    tradeQueue: new Queue<ScheduledTradeJob>(queueNames.trade, options),
    confirmationQueue: new Queue<ConfirmationJob>(
      queueNames.confirmation,
      options
    ),
    notificationQueue: new Queue<NotificationJob>(
      queueNames.notification,
      options
    ),
    reconciliationQueue: new Queue<ReconciliationJob>(
      queueNames.reconciliation,
      options
    ),
  };
};

export type SchedulerQueues = ReturnType<typeof createSchedulerQueues>;
