import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  pendingWalletLocks,
  wallets,
  type PendingWalletLock,
} from "../db/schema.js";
import { getRuntimeConfig } from "../config/runtime-config.js";

export class WalletLockTransitionError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "WalletLockTransitionError";
  }
}

// Valid state transitions map
const VALID_TRANSITIONS: Record<string, string[]> = {
  RESERVED: ["SIGNING", "RELEASED", "EXPIRED"],
  SIGNING: ["SUBMITTED", "RELEASED", "EXPIRED"],
  SUBMITTED: ["CONFIRMED_PENDING_FINALITY", "STUCK", "RELEASED"],
  CONFIRMED_PENDING_FINALITY: ["FINALIZED", "STUCK", "DROPPED"],
  STUCK: ["RELEASED"],
  DROPPED: ["RELEASED"],
  FINALIZED: [],
  RELEASED: [],
  EXPIRED: [],
  ACTIVE: ["RESERVED", "SIGNING", "SUBMITTED", "FINALIZED", "RELEASED", "EXPIRED"], // backward compat
};

export interface AcquireWalletLockInput {
  walletId: string;
  requestId: string;
  occurrenceId?: string | null;
  traceId?: string | null;
  riskReservationId?: string | null;
  nonce?: number | null;
  lockReason: string;
  finalityRequired?: boolean;
  lockTtlMs?: number;
}

export const checkWalletNotQuarantined = async (
  db: DbClient,
  walletId: string
): Promise<{ blocked: boolean; reason?: string }> => {
  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.id, walletId))
    .limit(1);
  if (!wallet) return { blocked: true, reason: "Wallet not found" };
  // Check status and nonceStatus directly to handle both QUARANTINED cases
  const isQuarantined = wallet.status === "QUARANTINED" || wallet.nonceStatus === "QUARANTINED";
  if (isQuarantined) {
    return { blocked: true, reason: "Wallet is quarantined" };
  }
  return { blocked: false };
};

export const acquireWalletLockAtomic = async (
  db: DbClient,
  input: AcquireWalletLockInput
): Promise<PendingWalletLock> => {
  return await db.transaction(async (tx) => {
    const check = await checkWalletNotQuarantined(tx, input.walletId);
    if (check.blocked) {
      throw new WalletLockTransitionError(check.reason ?? "Wallet blocked", 409);
    }

    const config = getRuntimeConfig();
    const lockTtlMs = input.lockTtlMs ?? config.walletLockTtlMs ?? 30 * 60 * 1000;
    const expiresAt = new Date(Date.now() + lockTtlMs);

    const [existing] = await tx
      .select()
      .from(pendingWalletLocks)
      .where(eq(pendingWalletLocks.walletId, input.walletId))
      .limit(1)
      .for("update");

    if (existing && existing.status === "ACTIVE") {
      if (existing.expiresAt.getTime() > Date.now()) {
        throw new WalletLockTransitionError(
          "Wallet already has an active pending transaction lock", 409);
      }
      const [updated] = await tx
        .update(pendingWalletLocks)
        .set({
          lockedByRequestId: input.requestId,
          nonce: input.nonce ?? existing.nonce ?? 0,
          lockReason: input.lockReason,
          status: "RESERVED",
          finalityRequired: input.finalityRequired ?? false,
          occurrenceId: input.occurrenceId ?? null,
          traceId: input.traceId ?? null,
          riskReservationId: input.riskReservationId ?? null,
          expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(pendingWalletLocks.id, existing.id))
        .returning();
      return updated as PendingWalletLock;
    }

    const [created] = await tx
      .insert(pendingWalletLocks)
      .values({
        walletId: input.walletId,
        lockedByRequestId: input.requestId,
        nonce: input.nonce ?? 0,
        lockReason: input.lockReason,
        status: "RESERVED",
        finalityRequired: input.finalityRequired ?? false,
        occurrenceId: input.occurrenceId ?? null,
        traceId: input.traceId ?? null,
        riskReservationId: input.riskReservationId ?? null,
        expiresAt,
      })
      .returning();

    if (!created) {
      throw new WalletLockTransitionError("Failed to acquire wallet lock", 500);
    }
    return created as PendingWalletLock;
  });
};

export interface TransitionWalletLockInput {
  lockId: string;
  walletId: string;
  fromStates: string[];
  toState: string;
}

export const transitionWalletLock = async (
  db: DbClient,
  input: TransitionWalletLockInput
): Promise<PendingWalletLock> => {
  return await db.transaction(async (tx) => {
    const [lock] = await tx
      .select()
      .from(pendingWalletLocks)
      .where(eq(pendingWalletLocks.id, input.lockId))
      .limit(1)
      .for("update");

    if (!lock) throw new WalletLockTransitionError("Wallet lock not found", 404);
    if (lock.walletId !== input.walletId) throw new WalletLockTransitionError("Wallet mismatch", 400);
    if (!input.fromStates.includes(lock.status)) {
      throw new WalletLockTransitionError(
        `Invalid transition: cannot go from ${lock.status} to ${input.toState}`, 409);
    }
    const allowedNextStates = VALID_TRANSITIONS[lock.status] ?? [];
    if (!allowedNextStates.includes(input.toState)) {
      throw new WalletLockTransitionError(
        `Invalid transition: ${lock.status} -> ${input.toState} not allowed`, 409);
    }

    const [updated] = await tx
      .update(pendingWalletLocks)
      .set({ status: input.toState, updatedAt: new Date() })
      .where(eq(pendingWalletLocks.id, input.lockId))
      .returning();

    return updated as PendingWalletLock;
  });
};