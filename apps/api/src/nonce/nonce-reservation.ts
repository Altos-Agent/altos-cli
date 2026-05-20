import { and, eq, asc } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  pendingWalletLocks,
  transactions,
  wallets,
  type PendingWalletLock,
  type Transaction,
  type Wallet,
} from "../db/schema.js";
import { basePublicClient } from "../blockchain/baseClient.js";
import type { Address } from "viem";

export type LockReason =
  | "LIVE_EXECUTE_ONCE"
  | "LIVE_APPROVE"
  | "LIVE_REVOKE"
  | "SCHEDULER_TRADE";

export type WalletNonceState = "CLEAN" | "UNCERTAIN" | "QUARANTINED";

export interface NonceReservation {
  reservationId: string;
  nonce: number;
}

export interface WalletLockState {
  hasActiveLock: boolean;
  lockReason?: LockReason;
  nonce?: number;
  txHash?: string;
  age?: number;
  finalityRequired?: boolean;
}

export interface ReconciliationResult {
  latestNonce: number;
  pendingNonce: number;
  storedNonce: number | null;
  pendingCount: number;
  state: WalletNonceState;
  stuckTxHashes: string[];
  droppedTxHashes: string[];
}

export class NonceReservationError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "NonceReservationError";
  }
}

export class NonceReservationService {
  constructor(private readonly db: DbClient) {}

  async canWalletSubmit(walletId: string): Promise<{ canSubmit: boolean; reason?: string }> {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    if (!wallet) {
      return { canSubmit: false, reason: "Wallet not found" };
    }
    if (wallet.status === "PAUSED" || wallet.status === "DISABLED") {
      return { canSubmit: false, reason: `Wallet status is ${wallet.status}` };
    }
    if (wallet.nonceStatus === "QUARANTINED") {
      return { canSubmit: false, reason: "Wallet is quarantined" };
    }

    const [activeLock] = await this.db
      .select()
      .from(pendingWalletLocks)
      .where(
        and(
          eq(pendingWalletLocks.walletId, walletId),
          eq(pendingWalletLocks.status, "ACTIVE")
        )
      )
      .limit(1);

    if (activeLock) {
      return { canSubmit: false, reason: "Wallet has an active nonce reservation" };
    }

    return { canSubmit: true };
  }

  async reserveNonceForWallet(
    walletId: string,
    chainId: number,
    reason: LockReason,
    finalityRequired = false
  ): Promise<NonceReservation> {
    const canSubmit = await this.canWalletSubmit(walletId);
    if (!canSubmit.canSubmit) {
      throw new NonceReservationError(canSubmit.reason ?? "Wallet cannot submit", 409);
    }

    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    if (!wallet) {
      throw new NonceReservationError("Wallet not found", 404);
    }

    const walletAddress = wallet.address as Address;
    const pendingNonce = await basePublicClient.getTransactionCount({
      address: walletAddress,
      blockTag: "pending",
    });
    const latestNonce = await basePublicClient.getTransactionCount({
      address: walletAddress,
      blockTag: "latest",
    });

    const reservedNonce = Math.max(Number(pendingNonce), Number(latestNonce));

    const [newLock] = await this.db
      .insert(pendingWalletLocks)
      .values({
        walletId,
        lockedByRequestId: walletId, // FK placeholder; real requestId attached later
        nonce: reservedNonce,
        lockReason: reason,
        status: "ACTIVE",
        finalityRequired,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min default expiry
      })
      .returning();

    if (!newLock) {
      throw new NonceReservationError("Failed to create nonce reservation", 500);
    }

    return { reservationId: newLock.id, nonce: reservedNonce };
  }

  async attachSubmittedTx(
    walletId: string,
    reservationId: string,
    txHash: string
  ): Promise<void> {
    await this.db
      .update(pendingWalletLocks)
      .set({ txHash, updatedAt: new Date() })
      .where(
        and(
          eq(pendingWalletLocks.id, reservationId),
          eq(pendingWalletLocks.walletId, walletId)
        )
      );
  }

  async releaseWalletLockAfterFinality(
    walletId: string,
    txHash: string
  ): Promise<void> {
    const [lock] = await this.db
      .select()
      .from(pendingWalletLocks)
      .where(
        and(
          eq(pendingWalletLocks.walletId, walletId),
          eq(pendingWalletLocks.txHash, txHash),
          eq(pendingWalletLocks.status, "ACTIVE")
        )
      )
      .limit(1);

    if (!lock) {
      return;
    }

    await this.db
      .update(pendingWalletLocks)
      .set({ status: "FINALIZED", updatedAt: new Date() })
      .where(eq(pendingWalletLocks.id, lock.id));

    await this.db
      .update(wallets)
      .set({ nonce: lock.nonce, updatedAt: new Date() })
      .where(eq(wallets.id, walletId));
  }

  async forceReleaseWithOperatorApproval(
    walletId: string,
    reservationId: string,
    operatorId: string,
    reason: string,
    operatorNotes?: string
  ): Promise<void> {
    const [lock] = await this.db
      .select()
      .from(pendingWalletLocks)
      .where(
        and(
          eq(pendingWalletLocks.id, reservationId),
          eq(pendingWalletLocks.walletId, walletId)
        )
      )
      .limit(1);

    if (!lock) {
      throw new NonceReservationError("Reservation not found", 404);
    }

    await this.db
      .update(pendingWalletLocks)
      .set({
        status: "RELEASED",
        operatorReviewed: true,
        operatorReviewedAt: new Date(),
        operatorReviewedBy: operatorId,
        recoveryNotes: operatorNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(pendingWalletLocks.id, reservationId));
  }

  async forcePauseWallet(walletId: string, reason: string): Promise<void> {
    await this.db
      .update(wallets)
      .set({
        status: "QUARANTINED",
        nonceStatus: "QUARANTINED",
        quarantineReason: reason,
        quarantinedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId));

    await this.db
      .update(pendingWalletLocks)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(
        and(
          eq(pendingWalletLocks.walletId, walletId),
          eq(pendingWalletLocks.status, "ACTIVE")
        )
      );
  }

  async reconcileWalletNonce(
    walletId: string,
    chainId: number
  ): Promise<ReconciliationResult> {
    const [wallet] = await this.db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    if (!wallet) {
      throw new NonceReservationError("Wallet not found", 404);
    }

    const walletAddress = wallet.address as Address;

    const [pendingNonce, latestNonce] = await Promise.all([
      basePublicClient.getTransactionCount({ address: walletAddress, blockTag: "pending" }),
      basePublicClient.getTransactionCount({ address: walletAddress, blockTag: "latest" }),
    ]);

    const activeLocks = await this.db
      .select()
      .from(pendingWalletLocks)
      .where(
        and(
          eq(pendingWalletLocks.walletId, walletId),
          eq(pendingWalletLocks.status, "ACTIVE")
        )
      )
      .orderBy(asc(pendingWalletLocks.createdAt));

    const submittedTxs = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, walletId),
          eq(transactions.status, "SUBMITTED")
        )
      );

    const storedNonce = wallet.nonce ?? null;
    const pendingCount = activeLocks.length;

    const stuckTxHashes: string[] = [];
    const droppedTxHashes: string[] = [];

    for (const lock of activeLocks) {
      if (!lock.txHash) continue;

      try {
        const receipt = await basePublicClient.getTransactionReceipt({
          hash: lock.txHash as Address,
        });

        if (receipt.status === "reverted") {
          stuckTxHashes.push(lock.txHash);
        }
      } catch (err: unknown) {
        const errorCode = (err as { code?: number }).code;
        if (errorCode === -32883 || errorCode === -32000) {
          try {
            await basePublicClient.getTransaction({ hash: lock.txHash as Address });
          } catch {
            droppedTxHashes.push(lock.txHash);
          }
        }
      }
    }

    let state: WalletNonceState = "CLEAN";

    if (stuckTxHashes.length > 0 || droppedTxHashes.length > 0) {
      state = "QUARANTINED";
    } else if (
      storedNonce !== null &&
      Number(latestNonce) > storedNonce + pendingCount + submittedTxs.length
    ) {
      state = "UNCERTAIN";
    }

    if (state === "QUARANTINED") {
      await this.forcePauseWallet(
        walletId,
        stuckTxHashes.length > 0
          ? `Stuck tx detected: ${stuckTxHashes.join(", ")}`
          : `Dropped tx detected: ${droppedTxHashes.join(", ")}`
      );
    } else if (state === "UNCERTAIN" && wallet.nonceStatus !== "UNCERTAIN") {
      await this.db
        .update(wallets)
        .set({ nonceStatus: "UNCERTAIN", updatedAt: new Date() })
        .where(eq(wallets.id, walletId));
    }

    return {
      latestNonce: Number(latestNonce),
      pendingNonce: Number(pendingNonce),
      storedNonce,
      pendingCount,
      state,
      stuckTxHashes,
      droppedTxHashes,
    };
  }

  async getWalletLockState(walletId: string): Promise<WalletLockState> {
    const [lock] = await this.db
      .select()
      .from(pendingWalletLocks)
      .where(
        and(
          eq(pendingWalletLocks.walletId, walletId),
          eq(pendingWalletLocks.status, "ACTIVE")
        )
      )
      .limit(1);

    if (!lock) {
      return { hasActiveLock: false };
    }

    const ageMs = Date.now() - lock.createdAt.getTime();

    const result: WalletLockState = {
      hasActiveLock: true,
      lockReason: lock.lockReason as LockReason,
      nonce: lock.nonce,
      age: ageMs,
    };

    if (lock.txHash != null) {
      result.txHash = lock.txHash;
    }
    if (lock.finalityRequired != null) {
      result.finalityRequired = lock.finalityRequired;
    }

    return result;
  }
}