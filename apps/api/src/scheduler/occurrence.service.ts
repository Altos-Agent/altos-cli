import { eq, and, inArray, gte, sql } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  scheduleOccurrences,
  type ScheduleOccurrence,
  type NewScheduleOccurrence,
} from "../db/schema.js";

export type OccurrenceStatus =
  | "PLANNED"
  | "QUEUED"
  | "RUNNING"
  | "DRY_RUN_ACCEPTED"
  | "DRY_RUN_REJECTED"
  | "LIVE_BLOCKED"
  | "FAILED"
  | "CANCELLED"
  | "DLQ";

export type OccurrenceMode = "DRY_RUN" | "LIVE";

export interface CreateOccurrenceInput {
  scheduleId: string;
  walletId: string;
  pairId: string;
  strategyProfileId?: string | null;
  mode: OccurrenceMode;
  scheduledFor: Date;
  requestId?: string | null;
  traceId?: string | null;
  quoteHash?: string | null;
  simulationHash?: string | null;
}

/**
 * Generates a deterministic occurrence key from schedule + wallet + pair + mode + time bucket.
 * The time bucket is rounded to the minute to ensure same-slot ticks map to same occurrence.
 */
export const generateOccurrenceKey = (
  scheduleId: string,
  walletId: string,
  pairId: string,
  mode: OccurrenceMode,
  scheduledFor: Date,
): string => {
  const bucketMs = 60_000; // 1-minute bucket
  const bucket = Math.floor(scheduledFor.getTime() / bucketMs) * bucketMs;
  const bucketDate = new Date(bucket).toISOString();
  return `occ_${scheduleId}_${walletId}_${pairId}_${mode}_${bucketDate}`;
};

/**
 * Generates an idempotency key that is unique per scheduler tick attempt.
 * Includes scheduleId, walletId, pairId, mode, and scheduledFor time so that
 * every distinct tick generates a distinct key — but retries of the same tick
 * use the same occurrence via occurrenceKey uniqueness.
 */
export const generateIdempotencyKey = (
  scheduleId: string,
  walletId: string,
  pairId: string,
  mode: OccurrenceMode,
  scheduledFor: Date,
): string => {
  // Use a stable "tick bucket" — same minute = same tick identity
  const tickBucket = Math.floor(scheduledFor.getTime() / 60_000) * 60_000;
  const tickId = `tick_${scheduleId}_${walletId}_${pairId}_${mode}_${tickBucket}`;
  return tickId;
};

/**
 * Creates or retrieves an existing occurrence record.
 * Uses ON CONFLICT DO NOTHING via unique index on occurrenceKey for idempotency.
 * The idempotencyKey provides a second uniqueness axis for correlation.
 *
 * Returns the existing record if one already exists for this occurrenceKey.
 */
export const createOrGetOccurrence = async (
  db: DbClient,
  input: CreateOccurrenceInput,
): Promise<{ occurrence: ScheduleOccurrence; created: boolean }> => {
  const now = new Date();
  const occurrenceKey = generateOccurrenceKey(
    input.scheduleId,
    input.walletId,
    input.pairId,
    input.mode,
    input.scheduledFor,
  );
  const idempotencyKey = generateIdempotencyKey(
    input.scheduleId,
    input.walletId,
    input.pairId,
    input.mode,
    input.scheduledFor,
  );

  // Try to insert — on conflict (occurrenceKey unique index), return existing
  const insertResult = await db
    .insert(scheduleOccurrences)
    .values({
      scheduleId: input.scheduleId,
      walletId: input.walletId,
      pairId: input.pairId,
      strategyProfileId: input.strategyProfileId ?? null,
      mode: input.mode,
      scheduledFor: input.scheduledFor,
      occurrenceKey,
      idempotencyKey,
      status: "PLANNED",
      requestId: input.requestId ?? null,
      traceId: input.traceId ?? null,
      quoteHash: input.quoteHash ?? null,
      simulationHash: input.simulationHash ?? null,
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .onConflictDoNothing()
    .execute();

  if (insertResult.length > 0) {
    const occ = insertResult[0] as ScheduleOccurrence;
    return { occurrence: occ, created: true };
  }

  // Occurrence already exists — fetch by occurrenceKey
  const [existing] = await db
    .select()
    .from(scheduleOccurrences)
    .where(eq(scheduleOccurrences.occurrenceKey, occurrenceKey))
    .limit(1);

  if (!existing) {
    throw new Error(
      `createOrGetOccurrence: no occurrence found for key ${occurrenceKey} after insert conflict`,
    );
  }

  return { occurrence: existing, created: false };
};

/**
 * Marks an occurrence as QUEUED and records the jobId.
 */
export const markOccurrenceQueued = async (
  db: DbClient,
  occurrenceId: string,
  jobId: string,
): Promise<ScheduleOccurrence> => {
  const now = new Date();
  const [updated] = await db
    .update(scheduleOccurrences)
    .set({
      status: "QUEUED",
      jobId,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduleOccurrences.id, occurrenceId),
        inArray(scheduleOccurrences.status, ["PLANNED", "RUNNING"]),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error(
      `markOccurrenceQueued: occurrence ${occurrenceId} not found or not in valid state`,
    );
  }

  return updated;
};

/**
 * Marks an occurrence as RUNNING and increments attemptCount.
 */
export const markOccurrenceRunning = async (
  db: DbClient,
  occurrenceId: string,
): Promise<ScheduleOccurrence> => {
  const now = new Date();
  const [updated] = await db
    .update(scheduleOccurrences)
    .set({
      status: "RUNNING",
      attemptCount: sql`attempt_count + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduleOccurrences.id, occurrenceId),
        inArray(scheduleOccurrences.status, ["PLANNED", "QUEUED"]),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error(
      `markOccurrenceRunning: occurrence ${occurrenceId} not found or not in valid state`,
    );
  }

  return updated;
};

/**
 * Attaches a transactionId to an occurrence.
 */
export const attachTransaction = async (
  db: DbClient,
  occurrenceId: string,
  transactionId: string,
): Promise<ScheduleOccurrence> => {
  const now = new Date();
  const [updated] = await db
    .update(scheduleOccurrences)
    .set({
      transactionId,
      updatedAt: now,
    })
    .where(eq(scheduleOccurrences.id, occurrenceId))
    .returning();

  if (!updated) {
    throw new Error(
      `attachTransaction: occurrence ${occurrenceId} not found`,
    );
  }

  return updated;
};

/**
 * Marks a dry-run occurrence as accepted (quote was valid and trade simulated).
 */
export const markDryRunAccepted = async (
  db: DbClient,
  occurrenceId: string,
  quoteHash?: string | null,
  simulationHash?: string | null,
): Promise<ScheduleOccurrence> => {
  const now = new Date();
  const [updated] = await db
    .update(scheduleOccurrences)
    .set({
      status: "DRY_RUN_ACCEPTED",
      quoteHash: quoteHash ?? null,
      simulationHash: simulationHash ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduleOccurrences.id, occurrenceId),
        eq(scheduleOccurrences.status, "RUNNING"),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error(
      `markDryRunAccepted: occurrence ${occurrenceId} not found or not in RUNNING state`,
    );
  }

  return updated;
};

/**
 * Marks a dry-run occurrence as rejected (quote failed or risk rejected).
 */
export const markDryRunRejected = async (
  db: DbClient,
  occurrenceId: string,
  lastErrorCode?: string | null,
  lastErrorMessage?: string | null,
): Promise<ScheduleOccurrence> => {
  const now = new Date();
  const [updated] = await db
    .update(scheduleOccurrences)
    .set({
      status: "DRY_RUN_REJECTED",
      lastErrorCode: lastErrorCode ?? null,
      lastErrorMessage: lastErrorMessage ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduleOccurrences.id, occurrenceId),
        eq(scheduleOccurrences.status, "RUNNING"),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error(
      `markDryRunRejected: occurrence ${occurrenceId} not found or not in RUNNING state`,
    );
  }

  return updated;
};

/**
 * Marks a live-mode occurrence as blocked (live execution not allowed).
 */
export const markLiveBlocked = async (
  db: DbClient,
  occurrenceId: string,
  lastErrorCode?: string | null,
  lastErrorMessage?: string | null,
): Promise<ScheduleOccurrence> => {
  const now = new Date();
  const [updated] = await db
    .update(scheduleOccurrences)
    .set({
      status: "LIVE_BLOCKED",
      lastErrorCode: lastErrorCode ?? "LIVE_MODE_BLOCKED",
      lastErrorMessage: lastErrorMessage ?? "Live scheduled execution is not implemented",
      updatedAt: now,
    })
    .where(eq(scheduleOccurrences.id, occurrenceId))
    .returning();

  if (!updated) {
    throw new Error(
      `markLiveBlocked: occurrence ${occurrenceId} not found`,
    );
  }

  return updated;
};

/**
 * Marks an occurrence as failed with error details.
 */
export const markFailed = async (
  db: DbClient,
  occurrenceId: string,
  lastErrorCode?: string | null,
  lastErrorMessage?: string | null,
): Promise<ScheduleOccurrence> => {
  const now = new Date();
  const [updated] = await db
    .update(scheduleOccurrences)
    .set({
      status: "FAILED",
      lastErrorCode: lastErrorCode ?? null,
      lastErrorMessage: lastErrorMessage ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduleOccurrences.id, occurrenceId),
        inArray(scheduleOccurrences.status, ["PLANNED", "QUEUED", "RUNNING"]),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error(
      `markFailed: occurrence ${occurrenceId} not found or not in valid state`,
    );
  }

  return updated;
};

/**
 * Marks an occurrence as dead-letter (DLQ).
 */
export const markDlq = async (
  db: DbClient,
  occurrenceId: string,
  lastErrorCode?: string | null,
  lastErrorMessage?: string | null,
): Promise<ScheduleOccurrence> => {
  const now = new Date();
  const [updated] = await db
    .update(scheduleOccurrences)
    .set({
      status: "DLQ",
      lastErrorCode: lastErrorCode ?? null,
      lastErrorMessage: lastErrorMessage ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduleOccurrences.id, occurrenceId),
        inArray(scheduleOccurrences.status, ["RUNNING", "FAILED"]),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error(
      `markDlq: occurrence ${occurrenceId} not found or not in valid state`,
    );
  }

  return updated;
};

/**
 * Gets an occurrence by ID.
 */
export const getOccurrenceById = async (
  db: DbClient,
  occurrenceId: string,
): Promise<ScheduleOccurrence | null> => {
  const [row] = await db
    .select()
    .from(scheduleOccurrences)
    .where(eq(scheduleOccurrences.id, occurrenceId))
    .limit(1);

  return row ?? null;
};

/**
 * Gets occurrences for a schedule, ordered by scheduledFor desc.
 */
export const getOccurrencesForSchedule = async (
  db: DbClient,
  scheduleId: string,
  limit = 50,
): Promise<ScheduleOccurrence[]> => {
  return db
    .select()
    .from(scheduleOccurrences)
    .where(eq(scheduleOccurrences.scheduleId, scheduleId))
    .orderBy(sql`${scheduleOccurrences.scheduledFor} DESC`)
    .limit(limit);
};

/**
 * Gets occurrences for a wallet, ordered by scheduledFor desc.
 */
export const getOccurrencesForWallet = async (
  db: DbClient,
  walletId: string,
  limit = 50,
): Promise<ScheduleOccurrence[]> => {
  return db
    .select()
    .from(scheduleOccurrences)
    .where(eq(scheduleOccurrences.walletId, walletId))
    .orderBy(sql`${scheduleOccurrences.scheduledFor} DESC`)
    .limit(limit);
};

/**
 * Reconciles stale occurrences on scheduler startup.
 * - RUNNING/QUEUED occurrences older than staleThresholdMs are marked FAILED.
 * - Does NOT touch LIVE mode occurrences.
 *
 * Returns count of reconciled occurrences.
 */
export const reconcileStaleOccurrences = async (
  db: DbClient,
  staleThresholdMs = 30 * 60 * 1000, // 30 minutes
): Promise<number> => {
  const staleBefore = new Date(Date.now() - staleThresholdMs);

  const result = await db
    .update(scheduleOccurrences)
    .set({
      status: "FAILED",
      lastErrorCode: "STALE_RECONCILE",
      lastErrorMessage: `Scheduler restart: occurrence was stuck in ${scheduleOccurrences.status} for more than ${Math.round(staleThresholdMs / 60000)} minutes`,
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(scheduleOccurrences.status, ["QUEUED", "RUNNING"]),
        eq(scheduleOccurrences.mode, "DRY_RUN"), // Do not touch LIVE
        gte(scheduleOccurrences.updatedAt, staleBefore),
      ),
    )
    .returning();

  return result.length;
};