import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { DbClient } from "../db/client.js";
import {
  pendingWalletLocks,
  transactionRequests,
  transactions,
  type Transaction,
  type TransactionRequest
} from "../db/schema.js";
import { getRuntimeConfig } from "../config/runtime-config.js";

type TransactionRequestStatus = TransactionRequest["status"];
type TransactionAction = Transaction["action"];

export class TransactionManagerError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400
  ) {
    super(message);
    this.name = "TransactionManagerError";
  }
}

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const hashObject = (value: unknown) =>
  createHash("sha256").update(stableStringify(value)).digest("hex");

export const hashString = (value: string | null | undefined) =>
  value ? createHash("sha256").update(value).digest("hex") : null;

export const requireIdempotencyKey = (request: FastifyRequest) => {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || key.trim() === "") {
    throw new TransactionManagerError("Idempotency-Key header is required", 400);
  }
  if (key.length > 200) {
    throw new TransactionManagerError("Idempotency-Key header is too long", 400);
  }
  return key;
};

const toResultStatus = (status: Transaction["status"]) =>
  status === "SUBMITTED" || status === "FAILED" || status === "REJECTED"
    ? status
    : "REJECTED";

export const transactionToRouteResult = (transaction: Transaction) => ({
  accepted: transaction.status === "SUBMITTED",
  rejected: transaction.status !== "SUBMITTED",
  reasons: transaction.errorMessage ? [transaction.errorMessage] : [],
  status: toResultStatus(transaction.status),
  txHash: transaction.txHash,
  basescanUrl: transaction.basescanUrl,
  transactionId: transaction.id,
  requestId: transaction.requestId
});

export class TransactionManager {
  constructor(private readonly db: DbClient) {}

  async createOrReplayRequest(input: {
    idempotencyKey: string;
    walletId: string;
    action: TransactionAction;
    requestHash: string;
    pairId?: string | null;
    routerId?: string | null;
    sellToken?: string | null;
    buyToken?: string | null;
    sellAmountRaw?: string | null;
    quoteHash?: string | null;
    simulationHash?: string | null;
  }) {
    const [existing] = await this.db
      .select()
      .from(transactionRequests)
      .where(eq(transactionRequests.idempotencyKey, input.idempotencyKey));

    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        throw new TransactionManagerError(
          "Idempotency-Key was already used for a different request",
          409
        );
      }
      const [transaction] = await this.db
        .select()
        .from(transactions)
        .where(eq(transactions.requestId, existing.id));
      return {
        replay: true,
        request: existing,
        transaction: transaction ?? null
      };
    }

    const [created] = await this.db
      .insert(transactionRequests)
      .values({
        idempotencyKey: input.idempotencyKey,
        walletId: input.walletId,
        action: input.action,
        status: "PENDING",
        requestHash: input.requestHash,
        pairId: input.pairId ?? null,
        routerId: input.routerId ?? null,
        sellToken: input.sellToken ?? null,
        buyToken: input.buyToken ?? null,
        sellAmountRaw: input.sellAmountRaw ?? null,
        quoteHash: input.quoteHash ?? null,
        simulationHash: input.simulationHash ?? null
      })
      .returning();

    if (!created) {
      throw new TransactionManagerError("Failed to create transaction request", 500);
    }

    return {
      replay: false,
      request: created,
      transaction: null
    };
  }

  async acquireWalletLock(input: {
    walletId: string;
    requestId: string;
    nonce?: number | null;
  }) {
    const now = Date.now();
    const [existing] = await this.db
      .select()
      .from(pendingWalletLocks)
      .where(eq(pendingWalletLocks.walletId, input.walletId));

    if (
      existing?.status === "ACTIVE" &&
      existing.expiresAt.getTime() > now &&
      existing.lockedByRequestId !== input.requestId
    ) {
      throw new TransactionManagerError(
        "Wallet already has an active pending transaction lock",
        409
      );
    }

    const expiresAt = new Date(now + getRuntimeConfig().walletLockTtlMs);

    if (existing) {
      const [updated] = await this.db
        .update(pendingWalletLocks)
        .set({
          lockedByRequestId: input.requestId,
          nonce: input.nonce ?? existing.nonce ?? 0,
          status: "ACTIVE",
          expiresAt,
          updatedAt: new Date()
        })
        .where(eq(pendingWalletLocks.walletId, input.walletId))
        .returning();
      return updated ?? null;
    }

    const [created] = await this.db
      .insert(pendingWalletLocks)
      .values({
        walletId: input.walletId,
        lockedByRequestId: input.requestId,
        nonce: input.nonce ?? 0,
        status: "ACTIVE",
        expiresAt,
        lockReason: "SCHEDULER_TRADE",
        finalityRequired: false,
      })
      .returning();
    return created ?? null;
  }

  async releaseWalletLock(input: {
    walletId: string;
    requestId: string;
    status?: "RELEASED" | "EXPIRED";
  }) {
    await this.db
      .update(pendingWalletLocks)
      .set({
        status: input.status ?? "RELEASED",
        updatedAt: new Date()
      })
      .where(
        and(
          eq(pendingWalletLocks.walletId, input.walletId),
          eq(pendingWalletLocks.lockedByRequestId, input.requestId)
        )
      )
      .returning();
  }

  async updateRequestStatus(id: string, status: TransactionRequestStatus) {
    await this.db
      .update(transactionRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(transactionRequests.id, id))
      .returning();
  }

  async updateRequestHashes(
    id: string,
    input: {
      quoteHash?: string | null;
      simulationHash?: string | null;
    }
  ) {
    await this.db
      .update(transactionRequests)
      .set({
        quoteHash: input.quoteHash ?? null,
        simulationHash: input.simulationHash ?? null,
        updatedAt: new Date()
      })
      .where(eq(transactionRequests.id, id))
      .returning();
  }

  async getWalletPending(walletId: string) {
    const [lock] = await this.db
      .select()
      .from(pendingWalletLocks)
      .where(eq(pendingWalletLocks.walletId, walletId));
    if (!lock || lock.status !== "ACTIVE" || lock.expiresAt.getTime() <= Date.now()) {
      return { lock: null, request: null };
    }
    const [request] = await this.db
      .select()
      .from(transactionRequests)
      .where(eq(transactionRequests.id, lock.lockedByRequestId));
    return { lock, request: request ?? null };
  }

  async assertNoPendingLiveTransaction(walletId: string) {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, walletId),
          inArray(transactions.status, [
            "SUBMITTED",
            "CONFIRMED_PENDING_FINALITY",
            "STUCK"
          ])
        )
      );

    if (rows.length > 0) {
      throw new TransactionManagerError(
        "Wallet already has a submitted or pending-finality transaction",
        409
      );
    }
  }

  async listRequests() {
    const rows = await this.db.select().from(transactionRequests);
    return rows.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    );
  }
}

export const isTransactionManagerError = (
  error: unknown
): error is TransactionManagerError => error instanceof TransactionManagerError;
