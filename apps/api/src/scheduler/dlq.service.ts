import { eq, desc, and, inArray, isNull, or } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { deadLetterJobs, type NewDeadLetterJob } from "../db/schema.js";
import { getCurrentRequestId } from "../http/request-context.js";
import type { ProviderError } from "../errors/provider.errors.js";

// Safe payload redaction - only keep safe fields, redact sensitive data
const redactPayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  const safeFields = ["walletId", "pairId", "scheduleId", "requestId", "mode", "amountIn", "jobType"];
  const redacted: Record<string, unknown> = {};

  for (const key of safeFields) {
    if (key in payload) {
      redacted[key] = payload[key];
    }
  }

  // Add metadata about what's redacted
  redacted._redacted = Object.keys(payload).filter(k => !safeFields.includes(k)).length;
  return redacted;
};

export interface RecordDeadLetterJobParams {
  queueName: string;
  jobId: string;
  jobType: string;
  walletId?: string | null;
  pairId?: string | null;
  scheduleId?: string | null;
  occurrenceId?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  error: ProviderError | Error;
  payload?: Record<string, unknown>;
}

export const recordDeadLetterJob = async (
  db: DbClient,
  params: RecordDeadLetterJobParams,
): Promise<string> => {
  const error = params.error;
  const isProviderError = "code" in error && error.code !== undefined;

  // Extract error code and determine retryable
  let errorCode: string;
  let retryable: boolean;
  let errorMessage: string;

  if (isProviderError) {
    const providerError = error as ProviderError;
    errorCode = providerError.code;
    retryable = providerError.retryable;
    errorMessage = providerError.message;
  } else {
    errorCode = "UNKNOWN_ERROR";
    retryable = false;
    errorMessage = error.message;
  }

  const payloadPreview = params.payload ? redactPayload(params.payload) : null;

  const [record] = await db
    .insert(deadLetterJobs)
    .values({
      queueName: params.queueName,
      jobId: params.jobId,
      jobType: params.jobType,
      walletId: params.walletId ?? null,
      pairId: params.pairId ?? null,
      scheduleId: params.scheduleId ?? null,
      occurrenceId: params.occurrenceId ?? null,
      requestId: params.requestId ?? getCurrentRequestId() ?? null,
      traceId: params.traceId ?? getCurrentRequestId() ?? null,
      errorCode,
      errorMessage,
      retryable,
      payloadPreviewJson: payloadPreview ?? null,
      failedAt: new Date(),
    })
    .returning();

  return record?.id as string;
};

export interface ListDeadLetterJobsParams {
  queueName?: string;
  walletId?: string;
  pairId?: string;
  errorCode?: string;
  includeResolved?: boolean;
  limit?: number;
  offset?: number;
}

export interface DeadLetterJobEntry {
  id: string;
  queueName: string;
  jobId: string;
  jobType: string;
  walletId: string | null;
  pairId: string | null;
  scheduleId: string | null;
  requestId: string | null;
  traceId: string | null;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  payloadPreviewJson: Record<string, unknown> | null;
  failedAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
}

export const listDeadLetterJobs = async (
  db: DbClient,
  params: ListDeadLetterJobsParams = {},
): Promise<{ jobs: DeadLetterJobEntry[]; total: number }> => {
  const conditions = [];

  if (params.queueName) {
    conditions.push(eq(deadLetterJobs.queueName, params.queueName));
  }
  if (params.walletId) {
    conditions.push(eq(deadLetterJobs.walletId, params.walletId));
  }
  if (params.pairId) {
    conditions.push(eq(deadLetterJobs.pairId, params.pairId));
  }
  if (params.errorCode) {
    conditions.push(eq(deadLetterJobs.errorCode, params.errorCode));
  }
  if (!params.includeResolved) {
    conditions.push(isNull(deadLetterJobs.resolvedAt));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const countResult = await db
    .select({ count: deadLetterJobs.id })
    .from(deadLetterJobs)
    .where(whereClause);
  const total = countResult.length;

  // Get paginated results
  const jobs = await db
    .select()
    .from(deadLetterJobs)
    .where(whereClause)
    .orderBy(desc(deadLetterJobs.failedAt))
    .limit(params.limit ?? 100)
    .offset(params.offset ?? 0);

  return { jobs: jobs as DeadLetterJobEntry[], total };
};

export interface MarkDeadLetterResolvedParams {
  id: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export const markDeadLetterResolved = async (
  db: DbClient,
  params: MarkDeadLetterResolvedParams,
): Promise<DeadLetterJobEntry | null> => {
  const [record] = await db
    .update(deadLetterJobs)
    .set({
      resolvedAt: new Date(),
      resolvedBy: params.resolvedBy ?? "operator",
      resolutionNote: params.resolutionNote ?? null,
    })
    .where(eq(deadLetterJobs.id, params.id))
    .returning();

  return (record ?? null) as DeadLetterJobEntry | null;
}

// Replay a dead letter job back to the queue
// Only allowed for DRY_RUN jobs - LIVE jobs can never be replayed
export interface ReplayDeadLetterJobParams {
  id: string;
  queues: {
    tradeQueue: { add(name: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown> };
    quoteQueue: { add(name: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown> };
    confirmationQueue: { add(name: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown> };
    notificationQueue: { add(name: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown> };
  };
}

export const replayDeadLetterJob = async (
  db: DbClient,
  params: ReplayDeadLetterJobParams,
): Promise<{ success: boolean; message: string }> => {
  const [job] = await db
    .select()
    .from(deadLetterJobs)
    .where(eq(deadLetterJobs.id, params.id));

  if (!job) {
    return { success: false, message: "Dead letter job not found" };
  }

  if (job.resolvedAt) {
    return { success: false, message: "Job already resolved" };
  }

  // CRITICAL: Only allow replay of DRY_RUN jobs
  if (job.jobType !== "DRY_RUN") {
    return { success: false, message: `Cannot replay ${job.jobType} jobs. Only DRY_RUN jobs are allowed for replay.` };
  }

  if (!job.payloadPreviewJson) {
    return { success: false, message: "No payload available to replay" };
  }

  // Determine which queue to use
  let queue: { add(name: string, data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown> };
  let jobName: string;

  switch (job.queueName) {
    case "tradeQueue":
      queue = params.queues.tradeQueue;
      jobName = "replayed-dry-run";
      break;
    case "quoteQueue":
      queue = params.queues.quoteQueue;
      jobName = "replayed-quote";
      break;
    case "confirmationQueue":
      queue = params.queues.confirmationQueue;
      jobName = "replayed-confirmation";
      break;
    default:
      return { success: false, message: `Unknown queue type: ${job.queueName}` };
  }

  // Add backoff for replay to avoid hammering
  const backoffDelay = Math.min(5000 + Math.random() * 5000, 15000);

  await queue.add(jobName, job.payloadPreviewJson as Record<string, unknown>, {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: backoffDelay,
    },
    jobId: undefined, // Let BullMQ generate a new job ID
  });

  // Mark as resolved with replay note
  await markDeadLetterResolved(db, {
    id: params.id,
    resolvedBy: "system-replay",
    resolutionNote: `Replayed to ${job.queueName} at ${new Date().toISOString()}`,
  });

  return { success: true, message: `Job replayed to ${job.queueName}` };
}

// Get DLQ statistics for monitoring
export const getDlqStats = async (db: DbClient) => {
  const allJobs = await db.select().from(deadLetterJobs);

  const stats = {
    total: allJobs.length,
    unresolved: allJobs.filter(j => !j.resolvedAt).length,
    resolved: allJobs.filter(j => j.resolvedAt).length,
    retryableUnresolved: allJobs.filter(j => !j.resolvedAt && j.retryable).length,
    byErrorCode: {} as Record<string, number>,
    byQueue: {} as Record<string, number>,
    byJobType: {} as Record<string, number>,
  };

  for (const job of allJobs) {
    stats.byErrorCode[job.errorCode] = (stats.byErrorCode[job.errorCode] ?? 0) + 1;
    stats.byQueue[job.queueName] = (stats.byQueue[job.queueName] ?? 0) + 1;
    stats.byJobType[job.jobType] = (stats.byJobType[job.jobType] ?? 0) + 1;
  }

  return stats;
};