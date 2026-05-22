import { eq, and, lt } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  aggregateRiskReservations,
  type AggregateRiskReservation,
} from "../db/schema.js";
import { getAggregateLimits } from "../risk/aggregate-risk.js";

const RESERVATION_TTL_MS = 5 * 60 * 1000; // 5 minutes default

export interface ReserveAggregateRiskInput {
  traceId: string;
  walletId: string;
  pairId: string;
  occurrenceId?: string | null;
  amountUsd: number;
  gasUsd: number;
}

export class AggregateRiskReservationError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "AggregateRiskReservationError";
  }
}

export const getActiveRiskReservations = async (
  db: DbClient,
  walletId?: string
): Promise<AggregateRiskReservation[]> => {
  const conditions = [eq(aggregateRiskReservations.status, "RESERVED")];
  if (walletId) {
    conditions.push(eq(aggregateRiskReservations.walletId, walletId));
  }
  return db.select().from(aggregateRiskReservations).where(and(...conditions));
};

export const getPendingReservationUsd = async (
  db: DbClient,
  walletId?: string
): Promise<{ amountUsd: number; gasUsd: number }> => {
  const active = await getActiveRiskReservations(db, walletId);
  return active.reduce(
    (acc, r) => ({
      amountUsd: acc.amountUsd + parseFloat(String(r.amountUsd)),
      gasUsd: acc.gasUsd + parseFloat(String(r.gasUsd)),
    }),
    { amountUsd: 0, gasUsd: 0 }
  );
};

export const reserveAggregateRisk = async (
  db: DbClient,
  input: ReserveAggregateRiskInput
): Promise<AggregateRiskReservation> => {
  return await db.transaction(async (tx) => {
    const limits = await getAggregateLimits(tx);
    if (!limits || !limits.enabled) {
      const [record] = await tx
        .insert(aggregateRiskReservations)
        .values({
          traceId: input.traceId,
          walletId: input.walletId,
          pairId: input.pairId,
          occurrenceId: input.occurrenceId ?? null,
          amountUsd: String(input.amountUsd),
          gasUsd: String(input.gasUsd),
          status: "RESERVED",
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        })
        .returning();
      return record as AggregateRiskReservation;
    }

    const activeReservations = await tx
      .select()
      .from(aggregateRiskReservations)
      .where(eq(aggregateRiskReservations.status, "RESERVED"));

    const pendingAmountUsd = activeReservations.reduce(
      (sum, r) => sum + parseFloat(String(r.amountUsd)), 0);
    const pendingGasUsd = activeReservations.reduce(
      (sum, r) => sum + parseFloat(String(r.gasUsd)), 0);

    const proposedAmountUsd = input.amountUsd;
    const proposedGasUsd = input.gasUsd;

    const maxPendingTradeUsd = parseFloat(limits.maxPendingTradeUsd);
    const maxPendingGasUsd = parseFloat(limits.maxDailyGasUsd);

    if (pendingAmountUsd + proposedAmountUsd > maxPendingTradeUsd) {
      const [rejected] = await tx
        .insert(aggregateRiskReservations)
        .values({
          traceId: input.traceId,
          walletId: input.walletId,
          pairId: input.pairId,
          occurrenceId: input.occurrenceId ?? null,
          amountUsd: String(input.amountUsd),
          gasUsd: String(input.gasUsd),
          status: "REJECTED",
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        })
        .returning();
      throw new AggregateRiskReservationError(
        `Aggregate risk pending cap exceeded: ${(pendingAmountUsd + proposedAmountUsd).toFixed(2)} > ${maxPendingTradeUsd}`,
        409
      );
    }

    if (pendingGasUsd + proposedGasUsd > maxPendingGasUsd) {
      const [rejected] = await tx
        .insert(aggregateRiskReservations)
        .values({
          traceId: input.traceId,
          walletId: input.walletId,
          pairId: input.pairId,
          occurrenceId: input.occurrenceId ?? null,
          amountUsd: String(input.amountUsd),
          gasUsd: String(input.gasUsd),
          status: "REJECTED",
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        })
        .returning();
      throw new AggregateRiskReservationError(
        `Aggregate risk pending gas cap exceeded: ${(pendingGasUsd + proposedGasUsd).toFixed(2)} > ${maxPendingGasUsd}`,
        409
      );
    }

    const [record] = await tx
      .insert(aggregateRiskReservations)
      .values({
        traceId: input.traceId,
        walletId: input.walletId,
        pairId: input.pairId,
        occurrenceId: input.occurrenceId ?? null,
        amountUsd: String(input.amountUsd),
        gasUsd: String(input.gasUsd),
        status: "RESERVED",
        expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      })
      .returning();

    return record as AggregateRiskReservation;
  });
};

export const consumeRiskReservation = async (
  db: DbClient,
  reservationId: string
): Promise<void> => {
  await db
    .update(aggregateRiskReservations)
    .set({ status: "CONSUMED", consumedAt: new Date() })
    .where(eq(aggregateRiskReservations.id, reservationId))
    .returning();
};

export const releaseRiskReservation = async (
  db: DbClient,
  reservationId: string
): Promise<void> => {
  await db
    .update(aggregateRiskReservations)
    .set({ status: "RELEASED", releasedAt: new Date() })
    .where(
      and(
        eq(aggregateRiskReservations.id, reservationId),
        eq(aggregateRiskReservations.status, "RESERVED")
      )
    )
    .returning();
};

export const expireStaleRiskReservations = async (
  db: DbClient,
  staleThresholdMs = 5 * 60 * 1000
): Promise<number> => {
  const result = await db
    .update(aggregateRiskReservations)
    .set({ status: "EXPIRED", releasedAt: new Date() })
    .where(
      and(
        eq(aggregateRiskReservations.status, "RESERVED"),
        lt(aggregateRiskReservations.expiresAt, new Date())
      )
    )
    .returning();

  return result.length;
};