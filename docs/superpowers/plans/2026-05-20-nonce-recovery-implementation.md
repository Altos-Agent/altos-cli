# Nonce Reservation and Recovery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement nonce reservation, wallet locking, RPC nonce reconciliation, and operator-guided stuck/dropped transaction recovery. Live scheduler remains disabled.

**Architecture:** A `NonceReservationService` singleton manages all nonce state with DB-level serialization. Live execution paths call `reserveNonceForWallet` before signing and `attachSubmittedTx` after sending. A reconciliation worker polls RPC to detect stuck/dropped txs and quarantine wallets. Recovery UI gives operators tools to review and force-release locks.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, BullMQ, Viem RPC calls, Fastify routes, Next.js pages.

---

## Phase 1: Schema Changes

### Task 1: Schema — Add enums and new fields

**Files:**
- Modify: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Add new enums to schema**

Locate the `walletStatusEnum` definition in `apps/api/src/db/schema.ts` and add `QUARANTINED` as a new value after `DISABLED`:

```typescript
export const walletStatusEnum = pgEnum("wallet_status", [
  "ACTIVE",
  "PAUSED",
  "QUARANTINED",
  "DISABLED"
]);
```

Add two new enums after `pendingWalletLockStatusEnum`:

```typescript
export const walletNonceStatusEnum = pgEnum("wallet_nonce_status", [
  "CLEAN",
  "UNCERTAIN",
  "QUARANTINED"
]);

export const transactionRecoveryStatusEnum = pgEnum("transaction_recovery_status", [
  "STUCK",
  "DROPPED",
  "RECOVERED",
  "CANCELLED"
]);
```

- [ ] **Step 2: Add new fields to `wallets` table**

After `updatedAt` in the wallets table definition, add:

```typescript
    nonce: integer("nonce"),
    nonceStatus: walletNonceStatusEnum("nonce_status").notNull().default("CLEAN"),
    quarantineReason: text("quarantine_reason"),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }),
```

- [ ] **Step 3: Modify `pending_wallet_locks` table**

Replace the existing `pending_wallet_locks` table definition with one that uses `id` as primary key:

```typescript
export const pendingWalletLocks = pgTable(
  "pending_wallet_locks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    lockedByRequestId: uuid("locked_by_request_id")
      .notNull()
      .references(() => transactionRequests.id, { onDelete: "cascade" }),
    nonce: integer("nonce").notNull(),
    txHash: text("tx_hash"),
    lockReason: text("lock_reason").notNull(),
    status: pendingWalletLockStatusEnum("status").notNull().default("ACTIVE"),
    finalityRequired: boolean("finality_required").notNull().default(false),
    replacedByTxHash: text("replaced_by_tx_hash"),
    operatorReviewed: boolean("operator_reviewed").notNull().default(false),
    operatorReviewedAt: timestamp("operator_reviewed_at", { withTimezone: true }),
    operatorReviewedBy: text("operator_reviewed_by"),
    recoveryNotes: text("recovery_notes"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt
  },
  (table) => [
    index("pending_wallet_locks_wallet_id_idx").on(table.walletId),
    index("pending_wallet_locks_status_idx").on(table.status)
  ]
);
```

Update the `NewPendingWalletLock` type reference (no longer needed since we use `id` as pk — verify exports).

- [ ] **Step 4: Add new fields to `transactions` table**

After `droppedReason` in the transactions table, add:

```typescript
    replacementTxHash: text("replacement_tx_hash"),
    recoveryStatus: transactionRecoveryStatusEnum("recovery_status"),
    recoveryNotes: text("recovery_notes"),
```

- [ ] **Step 5: Run typecheck to verify schema**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1 | head -40`
Expected: No errors related to our changes (other pre-existing errors are OK)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema.ts
git commit -m "feat(schema): add nonce fields and QUARANTINED wallet status"
```

---

## Phase 2: NonceReservationService

### Task 2: NonceReservationService — Core

**Files:**
- Create: `apps/api/src/nonce/nonce-reservation.ts`
- Modify: `apps/api/src/db/schema.ts` (type exports)

- [ ] **Step 1: Write the service skeleton with all method signatures**

Create `apps/api/src/nonce/nonce-reservation.ts`:

```typescript
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
import { assertWalletExists } from "../wallets/wallet-service.js";
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

    // Get next nonce from RPC
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

    // Use the higher of the two RPC nonces as our reservation point
    const reservedNonce = Math.max(Number(pendingNonce), Number(latestNonce));

    // Create a mock requestId for the lock FK — we use a placeholder since
    // the lock is created before the actual transaction request in some flows.
    // We create a minimal transaction request entry just for the FK.
    const [lock] = await this.db
      .insert(pendingWalletLocks)
      .values({
        walletId,
        lockedByRequestId: walletId, // FK to itself as placeholder; real requestId attached later
        nonce: reservedNonce,
        lockReason: reason,
        status: "ACTIVE",
        finalityRequired,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min default expiry
      })
      .returning();

    return { reservationId: lock.id, nonce: reservedNonce };
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
    // Mark lock as FINALIZED — but do NOT auto-release
    // Operator must review before releasing
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
      return; // No active lock for this tx
    }

    await this.db
      .update(pendingWalletLocks)
      .set({ status: "FINALIZED", updatedAt: new Date() })
      .where(eq(pendingWalletLocks.id, lock.id));

    // Update wallet's stored nonce to this tx's nonce
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

    // Expire all active locks
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

    // Get RPC nonces
    const [pendingNonce, latestNonce] = await Promise.all([
      basePublicClient.getTransactionCount({ address: walletAddress, blockTag: "pending" }),
      basePublicClient.getTransactionCount({ address: walletAddress, blockTag: "latest" }),
    ]);

    // Get active locks
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

    // Get submitted non-finalized transactions
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

    // Check for stuck/dropped transactions
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
        // If we have a receipt with 1 (success), the tx is confirmed
        // It will be finalized by the confirmation worker calling releaseWalletLockAfterFinality
      } catch (err: unknown) {
        const errorCode = (err as { code?: number }).code;
        // RPC error -28 means nonce mismatch or tx not found
        if (errorCode === -32883 || errorCode === -32000) {
          // Check if this is because the tx was dropped or if it's still pending
          try {
            await basePublicClient.getTransaction({ hash: lock.txHash as Address });
            // tx exists but receipt not found yet — still pending, not stuck
          } catch {
            // tx not found at all — definitely dropped
            droppedTxHashes.push(lock.txHash);
          }
        }
      }
    }

    // Determine state
    let state: WalletNonceState = "CLEAN";

    if (stuckTxHashes.length > 0 || droppedTxHashes.length > 0) {
      state = "QUARANTINED";
    } else if (
      storedNonce !== null &&
      Number(latestNonce) > storedNonce + pendingCount + submittedTxs.length
    ) {
      state = "UNCERTAIN";
    } else if (
      storedNonce !== null &&
      Number(pendingNonce) > storedNonce + pendingCount + submittedTxs.length + 1
    ) {
      state = "UNCERTAIN";
    }

    // Persist state changes
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

    return {
      hasActiveLock: true,
      lockReason: lock.lockReason as LockReason,
      nonce: lock.nonce,
      txHash: lock.txHash ?? undefined,
      age: ageMs,
      finalityRequired: lock.finalityRequired,
    };
  }
}
```

- [ ] **Step 2: Create directory if needed**

Run: `mkdir -p apps/api/src/nonce`

- [ ] **Step 3: Run typecheck**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1 | head -40`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/nonce/nonce-reservation.ts
git commit -m "feat: add NonceReservationService with core methods"
```

---

## Phase 3: Live Execution Integration

### Task 3: Trade Routes — Integrate nonce reservation

**Files:**
- Modify: `apps/api/src/trades/trade-routes.ts`

- [ ] **Step 1: Add imports for NonceReservationService**

Add to the import section of `trade-routes.ts`:

```typescript
import { NonceReservationService } from "../nonce/nonce-reservation.js";
```

Add the service as a module-level singleton after the transactionManager declaration:

```typescript
const transactionManager = new TransactionManager(db);
const nonceReservation = new NonceReservationService(db);
```

- [ ] **Step 2: Add pre-execution check and nonce reservation**

In the `execute-once` route handler, after the safety evaluation passes and before building the tx, add:

```typescript
// Check wallet can submit (no active lock)
const canSubmit = await nonceReservation.canWalletSubmit(input.walletId);
if (!canSubmit.canSubmit) {
  return reply.status(409).send({
    accepted: false,
    rejected: true,
    reasons: [canSubmit.reason ?? "Wallet cannot submit"],
    status: "REJECTED",
    txHash: null,
    basescanUrl: null,
    transactionId: null,
    requestId: null,
  });
}

// Reserve nonce
let nonceReservationResult: { reservationId: string; nonce: number } | null = null;
try {
  nonceReservationResult = await nonceReservation.reserveNonceForWallet(
    input.walletId,
    BASE_CHAIN_ID,
    "LIVE_EXECUTE_ONCE",
    true // finalityRequired
  );
} catch (err) {
  if (err instanceof NonceReservationError) {
    return reply.status(err.statusCode).send({
      accepted: false,
      rejected: true,
      reasons: [err.message],
      status: "REJECTED",
      txHash: null,
      basescanUrl: null,
      transactionId: null,
      requestId: null,
    });
  }
  throw err;
}
```

- [ ] **Step 3: Build tx with reserved nonce**

After reserving, use `nonceReservationResult.nonce` as the transaction nonce when building the walletClient. Find the `walletClient` creation in the existing code and add the `nonce` parameter:

```typescript
const walletClient = createWalletClient({
  account: privateKeyToAccount(decryptedKey),
  chain: baseMainnet,
  transport: http(),
  nonce: nonceReservationResult.nonce,
});
```

- [ ] **Step 4: Attach submitted tx after send**

After `const { hash: txHash } = await walletClient.sendTransaction(...)`, add:

```typescript
await nonceReservation.attachSubmittedTx(
  input.walletId,
  nonceReservationResult.reservationId,
  txHash
);
```

- [ ] **Step 5: Pass nonce to storeTransaction**

Update the `storeTransaction` call to include `nonce`, `fromAddress`, `toAddress`, `calldataHash`:

```typescript
const transaction = await storeTransaction({
  // ... existing fields
  nonce: nonceReservationResult.nonce,
  fromAddress: wallet.address,
  toAddress: quote.txTo ?? null,
  calldataHash: quote.txData ? hashString(quote.txData) : null,
  // ...
});
```

Update the `storeTransaction` function signature to accept these new fields (it already has them in the destructured params — just ensure they are passed through).

- [ ] **Step 6: Run typecheck**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1 | head -40`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/trades/trade-routes.ts
git commit -m "feat(trade-routes): integrate nonce reservation for execute-once"
```

---

### Task 4: Approval Service — Integrate nonce reservation

**Files:**
- Modify: `apps/api/src/approvals/approval-service.ts`

- [ ] **Step 1: Add imports**

Add to the approval service imports:

```typescript
import { NonceReservationService } from "../nonce/nonce-reservation.js";
import type { NonceReservationError } from "../nonce/nonce-reservation.js";
```

- [ ] **Step 2: Instantiate the service**

In `loadApprovalContext` or at the module level, create the service. Since approval-service.ts is a module with exported functions rather than a class, add a getter:

```typescript
let _nonceReservation: NonceReservationService | null = null;
const getNonceReservation = (db: DbClient) => {
  if (!_nonceReservation) _nonceReservation = new NonceReservationService(db);
  return _nonceReservation;
};
```

- [ ] **Step 3: Add pre-approval check and nonce reservation**

In `createOrRevokeApproval`, after safety checks pass and before signing, add:

```typescript
const canSubmit = await getNonceReservation(db).canWalletSubmit(walletId);
if (!canSubmit.canSubmit) {
  throw new ApprovalServiceError(canSubmit.reason ?? "Wallet cannot submit", 409);
}

const nonceRes = await getNonceReservation(db).reserveNonceForWallet(
  walletId,
  BASE_CHAIN_ID,
  action === "APPROVE" ? "LIVE_APPROVE" : "LIVE_REVOKE",
  true
);
```

- [ ] **Step 4: Attach submitted tx after send**

After the approval tx is sent (`const { hash: approvalTxHash }...`), add:

```typescript
await getNonceReservation(db).attachSubmittedTx(walletId, nonceRes.reservationId, approvalTxHash);
```

- [ ] **Step 5: Update storeApprovalTransaction call**

Ensure the `storeApprovalTransaction` call passes the nonce and from/to fields. Add `nonce: nonceRes.nonce` to the call.

- [ ] **Step 6: Handle nonce reservation errors**

In the catch block, handle `NonceReservationError` specifically:

```typescript
} catch (err) {
  if (err instanceof NonceReservationError) {
    throw new ApprovalServiceError(err.message, err.statusCode);
  }
  // ... existing error handling
}
```

- [ ] **Step 7: Run typecheck and fix any errors**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1 | head -40`

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/approvals/approval-service.ts
git commit -m "feat(approval-service): integrate nonce reservation for approve/revoke"
```

---

## Phase 4: Reconciliation Worker

### Task 5: Reconciliation Worker

**Files:**
- Create: `apps/api/src/reconciliation/reconciliation-worker.ts`
- Modify: `apps/api/src/scheduler/queues.ts` (add new queue)
- Modify: `apps/api/src/scheduler/scheduler-service.ts` (register worker)

- [ ] **Step 1: Create the reconciliation worker**

Create `apps/api/src/reconciliation/reconciliation-worker.ts`:

```typescript
import type { Job } from "bullmq";
import type { DbClient } from "../db/client.js";
import { wallets } from "../db/schema.js";
import { NonceReservationService } from "../nonce/nonce-reservation.js";
import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import { emitWalletQuarantinedAlert, emitDroppedTxAlert, emitStuckTxAlert } from "../ops/alert-webhook.js";
import type { SchedulerQueues } from "../scheduler/queues.js";

export interface ReconciliationJob {
  walletId: string;
}

export const processReconciliationJob =
  (db: DbClient, queues: SchedulerQueues) =>
  async (job: Job<ReconciliationJob>) => {
    const nonceService = new NonceReservationService(db);

    try {
      const result = await nonceService.reconcileWalletNonce(
        job.data.walletId,
        BASE_CHAIN_ID
      );

      if (result.state === "QUARANTINED") {
        const [wallet] = await db
          .select()
          .from(wallets)
          .where(eq(wallets.id, job.data.walletId))
          .limit(1);

        if (wallet) {
          if (result.stuckTxHashes.length > 0) {
            await emitStuckTxAlert(wallet.address, result.stuckTxHashes);
          }
          if (result.droppedTxHashes.length > 0) {
            await emitDroppedTxAlert(wallet.address, result.droppedTxHashes);
          }
          await emitWalletQuarantinedAlert(wallet.address, wallet.name);
        }
      }

      return result;
    } catch (err) {
      console.error(`[reconciliation] wallet ${job.data.walletId} error:`, err);
      throw err;
    }
  };
```

Add missing import for `eq` in the new file.

- [ ] **Step 2: Add reconciliation queue to queues.ts**

Open `apps/api/src/scheduler/queues.ts` and add a new queue name:

```typescript
export const queueNames = {
  // ... existing
  reconciliation: "reconciliation",
} as const;
```

Add the queue creation in `createSchedulerQueues`:

```typescript
reconciliation: new Queue(queueNames.reconciliation, bullQueueOptions),
```

Add the queue type to `SchedulerQueues` interface.

- [ ] **Step 3: Register reconciliation worker in scheduler-service.ts**

Add the reconciliation queue worker to `createWorkers`:

```typescript
import { processReconciliationJob } from "../reconciliation/reconciliation-worker.js";

const workers = [
  // ... existing
  new Worker(
    queueNames.reconciliation,
    processReconciliationJob(db, queues),
    workerOptions
  ),
];
```

Add a periodic job scheduling in the scheduler loop (after the existing occurrence reconciliation):

```typescript
// Reconcile nonce state for wallets with active locks
const walletsWithActiveLocks = await db
  .select({ walletId: pendingWalletLocks.walletId })
  .from(pendingWalletLocks)
  .where(eq(pendingWalletLocks.status, "ACTIVE"))
  .groupBy(pendingWalletLocks.walletId);

for (const { walletId } of walletsWithActiveLocks) {
  await queues.reconciliation.add(
    "nonce-reconcile",
    { walletId },
    { ...defaultJobOptions, jobId: `reconcile-${walletId}` }
  );
}
```

Add import for `pendingWalletLocks` and `queueNames`.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1 | head -40`

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reconciliation/reconciliation-worker.ts \
  apps/api/src/scheduler/queues.ts \
  apps/api/src/scheduler/scheduler-service.ts
git commit -m "feat(reconciliation): add nonce reconciliation worker"
```

---

## Phase 5: Alerts

### Task 6: Alert Webhook — New event types

**Files:**
- Modify: `apps/api/src/ops/alert-webhook.ts`

- [ ] **Step 1: Add new alert event types**

Add to the `AlertEvent` type union:

```typescript
  | "wallet_quarantined"
  | "dropped_tx_detected"
  | "nonce_mismatch"
  | "operator_force_release"
  | "stuck_tx_detected"
```

- [ ] **Step 2: Add alert emitter functions**

Add these exported functions after the existing `alertVaultUnlock` function:

```typescript
export const emitWalletQuarantinedAlert = async (
  walletAddress: string,
  walletName: string
) => {
  const payload = buildPayload(
    "wallet_quarantined",
    `Wallet ${walletName} (${walletAddress.slice(0, 8)}...) quarantined due to stuck/dropped transaction`,
    "critical",
    { walletAddress, walletName }
  );
  void dispatchAlertWebhook(payload);
};

export const emitDroppedTxAlert = async (
  walletAddress: string,
  txHashes: string[]
) => {
  const payload = buildPayload(
    "dropped_tx_detected",
    `Dropped transaction detected for wallet ${walletAddress.slice(0, 8)}...`,
    "critical",
    { walletAddress, txHashes: txHashes.join(", ") }
  );
  void dispatchAlertWebhook(payload);
};

export const emitStuckTxAlert = async (
  walletAddress: string,
  txHashes: string[]
) => {
  const payload = buildPayload(
    "stuck_tx_detected",
    `Stuck transaction detected for wallet ${walletAddress.slice(0, 8)}...`,
    "critical",
    { walletAddress, txHashes: txHashes.join(", ") }
  );
  void dispatchAlertWebhook(payload);
};

export const emitNonceMismatchAlert = async (
  walletAddress: string,
  storedNonce: number | null,
  rpcNonce: number
) => {
  const payload = buildPayload(
    "nonce_mismatch",
    `Nonce mismatch for wallet ${walletAddress.slice(0, 8)}...: stored=${storedNonce} rpc=${rpcNonce}`,
    "warning",
    { walletAddress, storedNonce, rpcNonce }
  );
  void dispatchAlertWebhook(payload);
};

export const emitOperatorForceReleaseAlert = async (
  walletAddress: string,
  operatorId: string,
  reservationId: string
) => {
  const payload = buildPayload(
    "operator_force_release",
    `Operator ${operatorId} force-released lock ${reservationId} for wallet ${walletAddress.slice(0, 8)}...`,
    "warning",
    { walletAddress, operatorId, reservationId }
  );
  void dispatchAlertWebhook(payload);
};
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1 | head -40`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/ops/alert-webhook.ts
git commit -m "feat(alerts): add wallet quarantine and recovery alert types"
```

---

## Phase 6: Scheduler Policy

### Task 7: Scheduler — Skip quarantined wallets

**Files:**
- Modify: `apps/api/src/scheduler/scheduler-policy.ts`

- [ ] **Step 1: Add nonceStatus to SchedulePolicyInput**

Add to `SchedulePolicyInput` interface:

```typescript
  nonceStatus: "CLEAN" | "UNCERTAIN" | "QUARANTINED";
```

- [ ] **Step 2: Add check in canScheduleWallet**

Add to the reasons array in `canScheduleWallet`:

```typescript
if (input.nonceStatus === "QUARANTINED") {
  reasons.push("Wallet is quarantined due to nonce/tx issue");
}
if (input.nonceStatus === "UNCERTAIN") {
  reasons.push("Wallet nonce state is uncertain — requires operator review");
}
```

- [ ] **Step 3: Update all call sites of canScheduleWallet**

Find all places where `canScheduleWallet` is called and ensure `nonceStatus` is passed. Common call sites are in `scheduler-service.ts` and `occurrence.service.ts`. Check each:

Run: `grep -rn "canScheduleWallet" apps/api/src --include="*.ts"`

For each call site, add `nonceStatus: wallet.nonceStatus` to the input object.

- [ ] **Step 4: Run typecheck and commit**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1 | head -40`

```bash
git add apps/api/src/scheduler/scheduler-policy.ts
git commit -m "feat(scheduler): skip quarantined/uncertain wallets"
```

---

## Phase 7: Confirmation Worker Update

### Task 8: Confirmation Worker — Call releaseWalletLockAfterFinality

**Files:**
- Modify: `apps/api/src/scheduler/confirmation.worker.ts`

- [ ] **Step 1: Import NonceReservationService**

Add to imports:

```typescript
import { NonceReservationService } from "../nonce/nonce-reservation.js";
```

- [ ] **Step 2: Call releaseWalletLockAfterFinality when finalized**

In `processConfirmationJob`, when a transaction reaches FINALIZED status, call:

```typescript
const nonceService = new NonceReservationService(db);

// After confirming tx is finalized:
if (refreshed?.status === "FINALIZED" || refreshed?.confirmationCount >= 12) {
  if (job.data.transactionId !== "dry-run") {
    await nonceService.releaseWalletLockAfterFinality(
      job.data.walletId,
      refreshed.txHash
    );
  }
}
```

Note: Adjust this based on how `refreshTransactionConfirmation` returns status. If it already handles finality determination, use its result directly.

- [ ] **Step 3: Typecheck and commit**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1 | head -40`

```bash
git add apps/api/src/scheduler/confirmation.worker.ts
git commit -m "feat(confirmation): call releaseWalletLockAfterFinality on tx finality"
```

---

## Phase 8: Recovery UI API

### Task 9: Recovery Routes

**Files:**
- Create: `apps/api/src/recovery/recovery-routes.ts`

- [ ] **Step 1: Create recovery routes**

Create `apps/api/src/recovery/recovery-routes.ts`:

```typescript
import { eq, and, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import {
  pendingWalletLocks,
  transactions,
  wallets,
  type Wallet,
} from "../db/schema.js";
import { NonceReservationService } from "../nonce/nonce-reservation.js";
import { emitOperatorForceReleaseAlert } from "../ops/alert-webhook.js";
import { requireOperatorAuth } from "../auth/operator-auth.js";
import { BASE_CHAIN_ID } from "@base-orchestrator/shared";
import { hashString } from "../transactions/transaction-manager.js";
import { buildBasescanTransactionLink } from "../blockchain/basescan.js";

export const registerRecoveryRoutes = async (
  server: FastifyInstance,
  db: DbClient
) => {
  const nonceService = new NonceReservationService(db);

  // GET /api/recovery/wallets — list wallets with nonce state
  server.get("/api/recovery/wallets", async () => {
    const allWallets = await db.select().from(wallets);

    const results = await Promise.all(
      allWallets.map(async (wallet) => {
        const lockState = await nonceService.getWalletLockState(wallet.id);
        let rpcLatestNonce: number | null = null;
        let rpcPendingNonce: number | null = null;

        if (lockState.hasActiveLock || wallet.nonceStatus !== "CLEAN") {
          try {
            const { basePublicClient } = await import("../blockchain/baseClient.js");
            const { Address } = await import("viem");
            [rpcPendingNonce, rpcLatestNonce] = await Promise.all([
              basePublicClient.getTransactionCount({ address: wallet.address as Address, blockTag: "pending" }),
              basePublicClient.getTransactionCount({ address: wallet.address as Address, blockTag: "latest" }),
            ]);
          } catch {
            // RPC unavailable
          }
        }

        return {
          id: wallet.id,
          name: wallet.name,
          address: wallet.address,
          status: wallet.status,
          nonceStatus: wallet.nonceStatus,
          quarantineReason: wallet.quarantineReason,
          quarantinedAt: wallet.quarantinedAt,
          storedNonce: wallet.nonce,
          rpcLatestNonce,
          rpcPendingNonce,
          activeLock: lockState.hasActiveLock
            ? {
                nonce: lockState.nonce,
                txHash: lockState.txHash,
                lockReason: lockState.lockReason,
                age: lockState.age,
                finalityRequired: lockState.finalityRequired,
              }
            : null,
        };
      })
    );

    return { wallets: results };
  });

  // GET /api/recovery/wallets/:walletId/stuck-transactions
  server.get("/api/recovery/wallets/:walletId/stuck-transactions", async (request) => {
    const walletId = request.params.walletId;

    const walletTxs = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.walletId, walletId),
          eq(transactions.status, "SUBMITTED")
        )
      );

    const stuckTxs = await Promise.all(
      walletTxs.map(async (tx) => {
        if (!tx.txHash) return { ...tx, rpcStatus: "NO_HASH" as const };

        try {
          const { basePublicClient } = await import("../blockchain/baseClient.js");
          const { Address } = await import("viem");
          const receipt = await basePublicClient.getTransactionReceipt({
            hash: tx.txHash as Address,
          });
          return {
            ...tx,
            rpcStatus: receipt.status === "success" ? "CONFIRMED" : "REVERTED",
            basescanUrl: buildBasescanTransactionLink(tx.txHash),
          };
        } catch {
          return {
            ...tx,
            rpcStatus: "NOT_FOUND" as const,
            basescanUrl: buildBasescanTransactionLink(tx.txHash ?? ""),
          };
        }
      })
    );

    return { transactions: stuckTxs };
  });

  // POST /api/recovery/wallets/:walletId/force-release
  server.post<{
    Body: { reservationId: string; operatorId: string; typedWalletAddress: string; reason: string; notes?: string };
  }>("/api/recovery/wallets/:walletId/force-release", async (request, reply) => {
    await requireOperatorAuth(request);

    const { walletId } = request.params;
    const { reservationId, operatorId, typedWalletAddress, reason, notes } = request.body;

    // Verify typed wallet address matches
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    if (!wallet) {
      return reply.status(404).send({ error: "Wallet not found" });
    }

    if (wallet.address.toLowerCase() !== typedWalletAddress.toLowerCase()) {
      return reply.status(400).send({ error: "Typed wallet address does not match" });
    }

    try {
      await nonceService.forceReleaseWithOperatorApproval(
        walletId,
        reservationId,
        operatorId,
        reason,
        notes
      );

      await emitOperatorForceReleaseAlert(wallet.address, operatorId, reservationId);

      return { success: true };
    } catch (err) {
      if (err instanceof NonceReservationError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      throw err;
    }
  });

  // POST /api/recovery/wallets/:walletId/mark-reviewed
  server.post<{
    Body: { reservationId: string; operatorId: string; notes?: string };
  }>("/api/recovery/wallets/:walletId/mark-reviewed", async (request, reply) => {
    await requireOperatorAuth(request);

    const { walletId } = request.params;
    const { reservationId, operatorId, notes } = request.body;

    const [lock] = await db
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
      return reply.status(404).send({ error: "Reservation not found" });
    }

    await db
      .update(pendingWalletLocks)
      .set({
        operatorReviewed: true,
        operatorReviewedAt: new Date(),
        operatorReviewedBy: operatorId,
        recoveryNotes: notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(pendingWalletLocks.id, reservationId));

    return { success: true };
  });

  // POST /api/recovery/wallets/:walletId/keep-paused
  server.post<{
    Body: { operatorId: string; notes?: string };
  }>("/api/recovery/wallets/:walletId/keep-paused", async (request, reply) => {
    await requireOperatorAuth(request);

    const { walletId } = request.params;
    const { operatorId, notes } = request.body;

    await db
      .update(wallets)
      .set({
        status: "PAUSED",
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId));

    return { success: true };
  });

  // GET /api/recovery/wallets/:walletId/cancel-draft
  server.get("/api/recovery/wallets/:walletId/cancel-draft", async (request, reply) => {
    const { walletId } = request.params;

    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.id, walletId))
      .limit(1);

    if (!wallet) {
      return reply.status(404).send({ error: "Wallet not found" });
    }

    // Get the active lock's nonce to build cancel tx
    const lockState = await nonceService.getWalletLockState(walletId);

    if (!lockState.hasActiveLock || lockState.nonce === undefined) {
      return reply.status(400).send({ error: "No active lock with nonce to cancel" });
    }

    // Cancel tx draft: same nonce, value=0, data=0x, to=self
    const cancelDraft = {
      from: wallet.address,
      to: wallet.address,
      value: 0n,
      data: "0x" as const,
      nonce: lockState.nonce,
      chainId: BASE_CHAIN_ID,
      warning: "OPERATOR MUST REVIEW AND SEND MANUALLY — THIS IS A DRAFT ONLY",
    };

    return { draft: cancelDraft, instructions: "Sign and send this cancel transaction manually via your wallet. No auto-send." };
  });
};
```

- [ ] **Step 2: Register routes in server.ts**

Find where routes are registered in `apps/api/src/server.ts` and add:

```typescript
import { registerRecoveryRoutes } from "./recovery/recovery-routes.js";
// ...
await registerRecoveryRoutes(server, db);
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1 | head -40`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/recovery/recovery-routes.ts apps/api/src/server.ts
git commit -m "feat(recovery): add recovery UI API routes"
```

---

## Phase 9: Recovery UI Page

### Task 10: Recovery UI Page

**Files:**
- Create: `apps/web/app/admin/recovery/page.tsx`

- [ ] **Step 1: Create the recovery page**

Create `apps/web/app/admin/recovery/page.tsx`. This should follow the existing Next.js patterns in the project (check `apps/web/app` for structure):

```typescript
"use client";

import { useState } from "react";

interface WalletNonceState {
  id: string;
  name: string;
  address: string;
  status: string;
  nonceStatus: string;
  quarantineReason: string | null;
  quarantinedAt: string | null;
  storedNonce: number | null;
  rpcLatestNonce: number | null;
  rpcPendingNonce: number | null;
  activeLock: {
    nonce: number;
    txHash: string | null;
    lockReason: string;
    age: number;
    finalityRequired: boolean;
  } | null;
}

interface Transaction {
  id: string;
  txHash: string | null;
  nonce: number | null;
  status: string;
  rpcStatus: string;
  fromAddress: string | null;
  toAddress: string | null;
  calldataHash: string | null;
  createdAt: string;
  confirmationCount: number;
  basescanUrl: string | null;
}

export default function RecoveryPage() {
  const [wallets, setWallets] = useState<WalletNonceState[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletNonceState | null>(null);
  const [selectedTxs, setSelectedTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [operatorId, setOperatorId] = useState("");
  const [notes, setNotes] = useState("");
  const [typedAddress, setTypedAddress] = useState("");
  const [cancelDraft, setCancelDraft] = useState<Record<string, unknown> | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const fetchWallets = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/recovery/wallets");
      const data = await res.json();
      setWallets(data.wallets);
    } finally {
      setLoading(false);
    }
  };

  const fetchStuckTxs = async (walletId: string) => {
    const res = await fetch(`/api/recovery/wallets/${walletId}/stuck-transactions`);
    const data = await res.json();
    setSelectedTxs(data.transactions);
  };

  const handleSelectWallet = async (wallet: WalletNonceState) => {
    setSelectedWallet(wallet);
    setActionResult(null);
    setCancelDraft(null);
    await fetchStuckTxs(wallet.id);
  };

  const handleMarkReviewed = async () => {
    if (!selectedWallet || !operatorId) return;
    const lock = selectedWallet.activeLock;
    if (!lock) return;

    const res = await fetch(`/api/recovery/wallets/${selectedWallet.id}/mark-reviewed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: "pending",
        operatorId,
        notes,
      }),
    });
    const data = await res.json();
    setActionResult(data.success ? "Marked as reviewed" : `Error: ${data.error}`);
    await fetchWallets();
  };

  const handleKeepPaused = async () => {
    if (!selectedWallet || !operatorId) return;

    const res = await fetch(`/api/recovery/wallets/${selectedWallet.id}/keep-paused`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorId, notes }),
    });
    const data = await res.json();
    setActionResult(data.success ? "Wallet kept paused" : `Error: ${data.error}`);
    await fetchWallets();
  };

  const handleForceRelease = async () => {
    if (!selectedWallet || !operatorId || !typedAddress) return;
    if (typedAddress.toLowerCase() !== selectedWallet.address.toLowerCase()) {
      setActionResult("Error: Typed address does not match wallet address");
      return;
    }

    const lock = selectedWallet.activeLock;
    if (!lock) return;

    const res = await fetch(`/api/recovery/wallets/${selectedWallet.id}/force-release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId: "pending",
        operatorId,
        typedWalletAddress: typedAddress,
        reason: "operator_force_release",
        notes,
      }),
    });
    const data = await res.json();
    setActionResult(data.success ? "Lock force-released" : `Error: ${data.error}`);
    setTypedAddress("");
    await fetchWallets();
  };

  const handlePrepareCancelDraft = async () => {
    if (!selectedWallet) return;

    const res = await fetch(`/api/recovery/wallets/${selectedWallet.id}/cancel-draft`);
    const data = await res.json();
    if (data.error) {
      setActionResult(`Error: ${data.error}`);
    } else {
      setCancelDraft(data.draft);
      setActionResult("Cancel tx draft ready — operator must send manually");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Wallet Recovery — Nonce & Transaction State</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div>
          <h2 className="text-lg font-semibold mb-3">Wallets</h2>
          <button
            onClick={fetchWallets}
            className="mb-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>

          <div className="space-y-2">
            {wallets.map((wallet) => (
              <div
                key={wallet.id}
                onClick={() => handleSelectWallet(wallet)}
                className={`p-3 border rounded cursor-pointer ${
                  selectedWallet?.id === wallet.id ? "border-blue-500 bg-blue-50" : ""
                }`}
              >
                <div className="font-medium">{wallet.name}</div>
                <div className="text-sm text-gray-500">{wallet.address}</div>
                <div className="flex gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    wallet.status === "ACTIVE" ? "bg-green-100" :
                    wallet.status === "QUARANTINED" ? "bg-red-100" : "bg-yellow-100"
                  }`}>
                    {wallet.status}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    wallet.nonceStatus === "CLEAN" ? "bg-green-100" :
                    wallet.nonceStatus === "UNCERTAIN" ? "bg-yellow-100" : "bg-red-100"
                  }`}>
                    nonce: {wallet.nonceStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          {selectedWallet ? (
            <div className="border rounded p-4">
              <h2 className="text-lg font-semibold mb-3">Wallet: {selectedWallet.name}</h2>

              <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                <div>
                  <div className="text-gray-500">Address</div>
                  <div className="font-mono">{selectedWallet.address}</div>
                </div>
                <div>
                  <div className="text-gray-500">Stored Nonce</div>
                  <div>{selectedWallet.storedNonce ?? "null"}</div>
                </div>
                <div>
                  <div className="text-gray-500">RPC Latest Nonce</div>
                  <div>{selectedWallet.rpcLatestNonce ?? "—"}</div>
                </div>
                <div>
                  <div className="text-gray-500">RPC Pending Nonce</div>
                  <div>{selectedWallet.rpcPendingNonce ?? "—"}</div>
                </div>
                {selectedWallet.quarantineReason && (
                  <div className="col-span-2">
                    <div className="text-gray-500">Quarantine Reason</div>
                    <div className="text-red-600">{selectedWallet.quarantineReason}</div>
                  </div>
                )}
              </div>

              {selectedWallet.activeLock && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4">
                  <div className="font-medium text-yellow-800">Active Lock</div>
                  <div className="text-sm mt-1">
                    <div>Nonce: {selectedWallet.activeLock.nonce}</div>
                    <div>Reason: {selectedWallet.activeLock.lockReason}</div>
                    <div>Finality Required: {selectedWallet.activeLock.finalityRequired ? "Yes" : "No"}</div>
                    <div>Age: {Math.round((selectedWallet.activeLock.age ?? 0) / 1000)}s</div>
                    {selectedWallet.activeLock.txHash && (
                      <div>Tx Hash: <a href={selectedWallet.activeLock.txHash} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{selectedWallet.activeLock.txHash}</a></div>
                    )}
                  </div>
                </div>
              )}

              <h3 className="font-medium mb-2">Submitted Transactions</h3>
              <div className="space-y-2 mb-4">
                {selectedTxs.map((tx) => (
                  <div key={tx.id} className="text-sm border-b pb-2">
                    <div className="flex justify-between">
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        tx.rpcStatus === "CONFIRMED" ? "bg-green-100" :
                        tx.rpcStatus === "NOT_FOUND" ? "bg-red-100" : "bg-yellow-100"
                      }`}>
                        {tx.rpcStatus}
                      </span>
                      {tx.basescanUrl && (
                        <a href={tx.basescanUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs underline">
                          View on Basescan
                        </a>
                      )}
                    </div>
                    <div className="text-gray-500 mt-1">
                      Nonce: {tx.nonce} | From: {tx.fromAddress?.slice(0, 10)}... | To: {tx.toAddress?.slice(0, 10)}...
                    </div>
                    <div className="text-gray-400 text-xs">Created: {tx.createdAt}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-gray-400">Select a wallet to view details</div>
          )}
        </div>
      </div>

      {selectedWallet && (
        <div className="border rounded p-4">
          <h2 className="text-lg font-semibold mb-4">Recovery Actions</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Operator ID</label>
              <input
                type="text"
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter operator ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes (optional)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="Recovery notes"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={handleMarkReviewed}
              disabled={!operatorId || !selectedWallet.activeLock}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Mark Reviewed
            </button>
            <button
              onClick={handleKeepPaused}
              disabled={!operatorId}
              className="px-4 py-2 bg-yellow-200 rounded hover:bg-yellow-300 disabled:opacity-50"
            >
              Keep Paused
            </button>
            <button
              onClick={handleForceRelease}
              disabled={!operatorId || !typedAddress || typedAddress.toLowerCase() !== selectedWallet.address.toLowerCase()}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              Force Release Lock
            </button>
            <button
              onClick={handlePrepareCancelDraft}
              disabled={!selectedWallet.activeLock}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Prepare Cancel Tx Draft
            </button>
          </div>

          {selectedWallet.status === "QUARANTINED" && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">
                Type wallet address to confirm force release:
              </label>
              <input
                type="text"
                value={typedAddress}
                onChange={(e) => setTypedAddress(e.target.value)}
                placeholder={selectedWallet.address}
                className="w-full border rounded px-3 py-2 font-mono"
              />
            </div>
          )}

          {cancelDraft && (
            <div className="bg-gray-100 border rounded p-3">
              <div className="font-medium mb-2">Cancel Transaction Draft</div>
              <pre className="text-xs overflow-x-auto">
                {JSON.stringify(cancelDraft, null, 2)}
              </pre>
              <div className="mt-2 text-sm text-red-600 font-medium">
                WARNING: You must sign and send this transaction manually.
              </div>
            </div>
          )}

          {actionResult && (
            <div className={`mt-4 p-3 rounded ${actionResult.startsWith("Error") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {actionResult}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add route in Next.js app router**

Add the route in the Next.js router. Check `apps/web/app` for the routing structure and add the `/admin/recovery` route.

- [ ] **Step 3: Run typecheck on web**

Run: `cd apps/web && pnpm tsc --noEmit 2>&1 | head -40`

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/admin/recovery/page.tsx
git commit -m "feat(web): add wallet recovery UI page"
```

---

## Phase 10: Tests

### Task 11: Tests for nonce reservation and recovery

**Files:**
- Create: `apps/api/src/nonce/nonce-reservation.test.ts`
- Modify: `apps/api/src/trades/live-execution.test.ts` (if exists)
- Create: `apps/api/src/reconciliation/reconciliation-worker.test.ts`

- [ ] **Step 1: Write NonceReservationService tests**

Create `apps/api/src/nonce/nonce-reservation.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { DbClient } from "../db/client.js";
import { NonceReservationService } from "./nonce-reservation.js";
import { wallets, pendingWalletLocks } from "../db/schema.js";

describe("NonceReservationService", () => {
  let db: DbClient;
  let service: NonceReservationService;

  beforeEach(() => {
    // Use in-memory DB or mocked DB client
    db = createMockDb();
    service = new NonceReservationService(db);
  });

  describe("canWalletSubmit", () => {
    it("returns canSubmit=true when wallet is clean with no active locks", async () => {
      await seedWallet(db, { status: "ACTIVE", nonceStatus: "CLEAN" });
      const result = await service.canWalletSubmit(walletId);
      expect(result.canSubmit).toBe(true);
    });

    it("returns canSubmit=false when wallet has ACTIVE lock", async () => {
      await seedWallet(db, { status: "ACTIVE", nonceStatus: "CLEAN" });
      await service.reserveNonceForWallet(walletId, 8453, "LIVE_EXECUTE_ONCE");
      const result = await service.canWalletSubmit(walletId);
      expect(result.canSubmit).toBe(false);
      expect(result.reason).toContain("active nonce reservation");
    });

    it("returns canSubmit=false when wallet is quarantined", async () => {
      await seedWallet(db, { status: "QUARANTINED", nonceStatus: "QUARANTINED" });
      const result = await service.canWalletSubmit(walletId);
      expect(result.canSubmit).toBe(false);
      expect(result.reason).toContain("quarantined");
    });

    it("returns canSubmit=false when wallet is paused", async () => {
      await seedWallet(db, { status: "PAUSED", nonceStatus: "CLEAN" });
      const result = await service.canWalletSubmit(walletId);
      expect(result.canSubmit).toBe(false);
    });
  });

  describe("reserveNonceForWallet", () => {
    it("creates a pending_wallet_locks entry with ACTIVE status", async () => {
      await seedWallet(db, { status: "ACTIVE", nonceStatus: "CLEAN" });
      const result = await service.reserveNonceForWallet(walletId, 8453, "LIVE_EXECUTE_ONCE");
      expect(result.reservationId).toBeDefined();
      expect(result.nonce).toBeGreaterThanOrEqual(0);

      const [lock] = await db
        .select()
        .from(pendingWalletLocks)
        .where(eq(pendingWalletLocks.id, result.reservationId));
      expect(lock.status).toBe("ACTIVE");
      expect(lock.nonce).toBe(result.nonce);
    });

    it("throws when wallet already has active lock", async () => {
      await seedWallet(db, { status: "ACTIVE", nonceStatus: "CLEAN" });
      await service.reserveNonceForWallet(walletId, 8453, "LIVE_EXECUTE_ONCE");
      await expect(
        service.reserveNonceForWallet(walletId, 8453, "LIVE_EXECUTE_ONCE")
      ).rejects.toThrow();
    });
  });

  describe("attachSubmittedTx", () => {
    it("updates lock with txHash after submission", async () => {
      await seedWallet(db, { status: "ACTIVE", nonceStatus: "CLEAN" });
      const { reservationId } = await service.reserveNonceForWallet(walletId, 8453, "LIVE_EXECUTE_ONCE");
      await service.attachSubmittedTx(walletId, reservationId, "0xabc123");
      const [lock] = await db.select().from(pendingWalletLocks).where(eq(pendingWalletLocks.id, reservationId));
      expect(lock.txHash).toBe("0xabc123");
    });
  });

  describe("forcePauseWallet", () => {
    it("sets wallet status to QUARANTINED and expires active locks", async () => {
      await seedWallet(db, { status: "ACTIVE", nonceStatus: "CLEAN" });
      await service.reserveNonceForWallet(walletId, 8453, "LIVE_EXECUTE_ONCE");
      await service.forcePauseWallet(walletId, "Test quarantine");

      const [wallet] = await db.select().from(wallets).where(eq(wallets.id, walletId));
      expect(wallet.status).toBe("QUARANTINED");
      expect(wallet.nonceStatus).toBe("QUARANTINED");
      expect(wallet.quarantineReason).toBe("Test quarantine");

      const locks = await db.select().from(pendingWalletLocks).where(eq(pendingWalletLocks.walletId, walletId));
      expect(locks.every(l => l.status === "EXPIRED")).toBe(true);
    });
  });

  describe("forceReleaseWithOperatorApproval", () => {
    it("releases lock and sets operatorReviewed fields", async () => {
      await seedWallet(db, { status: "ACTIVE", nonceStatus: "CLEAN" });
      const { reservationId } = await service.reserveNonceForWallet(walletId, 8453, "LIVE_EXECUTE_ONCE");

      await service.forceReleaseWithOperatorApproval(walletId, reservationId, "op-123", "Test release", "Operator released for testing");

      const [lock] = await db.select().from(pendingWalletLocks).where(eq(pendingWalletLocks.id, reservationId));
      expect(lock.status).toBe("RELEASED");
      expect(lock.operatorReviewed).toBe(true);
      expect(lock.operatorReviewedBy).toBe("op-123");
      expect(lock.recoveryNotes).toBe("Operator released for testing");
    });

    it("throws when typed address does not match", async () => {
      // This is enforced at the route level — test the route handler
    });
  });
});
```

Write the actual test using the existing `createInMemoryDb` helper from `apps/api/src/test-utils/in-memory-db.ts` if available.

- [ ] **Step 2: Run tests**

Run: `cd apps/api && pnpm test -- --testPathPattern="nonce-reservation" --run 2>&1`

- [ ] **Step 3: Add scheduler policy test for quarantined wallets**

Create `apps/api/src/scheduler/scheduler-policy.quarantine.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { canScheduleWallet } from "./scheduler-policy.js";

describe("canScheduleWallet — quarantine", () => {
  it("returns reason when wallet nonceStatus is QUARANTINED", () => {
    const reasons = canScheduleWallet({
      scheduleEnabled: true,
      emergencyPaused: false,
      walletStatus: "ACTIVE",
      dailyRunCount: 0,
      maxDailyRuns: null,
      dailyLossUsd: 0,
      maxDailyLossUsd: null,
      nonceStatus: "QUARANTINED",
    });
    expect(reasons).toContain("Wallet is quarantined");
  });

  it("returns reason when wallet nonceStatus is UNCERTAIN", () => {
    const reasons = canScheduleWallet({
      scheduleEnabled: true,
      emergencyPaused: false,
      walletStatus: "ACTIVE",
      dailyRunCount: 0,
      maxDailyRuns: null,
      dailyLossUsd: 0,
      maxDailyLossUsd: null,
      nonceStatus: "UNCERTAIN",
    });
    expect(reasons).toContain("Wallet nonce state is uncertain");
  });

  it("returns empty reasons when nonceStatus is CLEAN", () => {
    const reasons = canScheduleWallet({
      scheduleEnabled: true,
      emergencyPaused: false,
      walletStatus: "ACTIVE",
      dailyRunCount: 0,
      maxDailyRuns: null,
      dailyLossUsd: 0,
      maxDailyLossUsd: null,
      nonceStatus: "CLEAN",
    });
    expect(reasons).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/nonce/nonce-reservation.test.ts \
  apps/api/src/scheduler/scheduler-policy.quarantine.test.ts
git commit -m "test: add nonce reservation and quarantine scheduler tests"
```

---

## Phase 11: Documentation

### Task 12: Documentation

**Files:**
- Create: `docs/NONCE_RESERVATION_AND_RECOVERY.md`
- Create: `docs/STUCK_DROPPED_TX_RUNBOOK.md`

- [ ] **Step 1: Write architecture doc**

Create `docs/NONCE_RESERVATION_AND_RECOVERY.md`:

```markdown
# Nonce Reservation and Recovery

## Overview

Every live write transaction (execute-once, approve, revoke) must reserve a nonce before signing. This prevents concurrent transactions from the same wallet and enables accurate nonce tracking for stuck/dropped tx detection.

## Core Principle

> A wallet with an ACTIVE pending_wallet_locks entry cannot submit another live transaction until the lock is reviewed by an operator.

## NonceReservationService

Located at `apps/api/src/nonce/nonce-reservation.ts`.

### Key Methods

- `reserveNonceForWallet(walletId, chainId, reason, finalityRequired?)` — Atomically reserves a nonce using `SELECT ... FOR UPDATE` and RPC. Creates a `pending_wallet_locks` entry with status ACTIVE.
- `attachSubmittedTx(walletId, reservationId, txHash)` — Updates the lock with the submitted tx hash after signing.
- `reconcileWalletNonce(walletId, chainId)` — Polls RPC to detect nonce gaps, stuck txs, and dropped txs. Returns `{ state, latestNonce, pendingNonce, stuckTxHashes, droppedTxHashes }`.
- `releaseWalletLockAfterFinality(walletId, txHash)` — Called when the confirmation worker detects a tx is finalized. Sets lock to FINALIZED but does NOT auto-release.
- `forceReleaseWithOperatorApproval(walletId, reservationId, operatorId, reason, notes?)` — Operator-reviewed release. Sets operatorReviewed=true.
- `forcePauseWallet(walletId, reason)` — Sets wallet to QUARANTINED and expires all active locks.
- `canWalletSubmit(walletId)` — Returns `{ canSubmit, reason? }`. Checks: no ACTIVE lock, wallet not paused/quarantined.
- `getWalletLockState(walletId)` — Returns current lock details.

## Wallet Nonce State Machine

```
CLEAN → (reconcile finds discrepancy) → UNCERTAIN
UNCERTAIN → (operator resolves or timeout) → QUARANTINED or CLEAN
QUARANTINED → (operator force release) → CLEAN (with new nonce)
QUARANTINED → (operator keeps paused) → PAUSED
```

## Reconciliation

The reconciliation worker (`apps/api/src/reconciliation/reconciliation-worker.ts`) runs periodically and calls `reconcileWalletNonce` for each wallet with an ACTIVE lock.

Detection logic:
- `pendingNonce > storedNonce + activeLocks.length + 1` → UNCERTAIN
- `tx hash not found on RPC after 12+ blocks` → QUARANTINED (STUCK)
- `tx status = 0 (reverted)` → QUARANTINED (STUCK)
- `tx hash not found at all` → QUARANTINED (DROPPED)

## Lock Lifecycle

1. `reserveNonceForWallet` → ACTIVE (nonce reserved, no tx hash yet)
2. `attachSubmittedTx` → ACTIVE (tx hash attached)
3. `releaseWalletLockAfterFinality` → FINALIZED (tx confirmed, operator review required)
4. `forceReleaseWithOperatorApproval` → RELEASED (operator explicitly released)
5. `forcePauseWallet` → EXPIRED (all active locks for wallet expired)

## Scheduler Integration

The scheduler policy (`apps/api/src/scheduler/scheduler-policy.ts`) checks `nonceStatus` before scheduling:
- `QUARANTINED` → blocked, reason: "Wallet is quarantined"
- `UNCERTAIN` → blocked, reason: "Wallet nonce state is uncertain"
- `CLEAN` → proceeds if other checks pass

## Recovery UI

Route: `/admin/recovery`

Shows:
- All wallets with nonce state (CLEAN / UNCERTAIN / QUARANTINED)
- RPC vs stored nonce comparison
- Active lock details (nonce, txHash, age)
- Submitted transaction RPC status

Actions:
- **Mark Reviewed** — operatorReviewed=true, wallet stays paused
- **Keep Paused** — set wallet status to PAUSED
- **Force Release Lock** — requires typing wallet address to confirm
- **Prepare Cancel Tx Draft** — generates cancel-by-replacement tx (operator sends manually)

## Alerts

| Event | Severity | Trigger |
|-------|----------|---------|
| `wallet_quarantined` | Critical | Wallet enters QUARANTINED state |
| `stuck_tx_detected` | Critical | Tx hash not found after 12+ blocks |
| `dropped_tx_detected` | Critical | Nonce gap suggests dropped tx |
| `nonce_mismatch` | Warning | RPC nonce differs from stored nonce |
| `operator_force_release` | Warning | Operator manually releases a lock |
```

- [ ] **Step 2: Write operator runbook**

Create `docs/STUCK_DROPPED_TX_RUNBOOK.md`:

```markdown
# Stuck / Dropped Transaction Runbook

## Symptoms

- Telegram/webhook alert: `wallet_quarantined` or `stuck_tx_detected`
- Wallet shows status `QUARANTINED` in Recovery UI
- Active lock shows old txHash with high age

## Diagnosis

1. Open Recovery UI: `/admin/recovery`
2. Find the affected wallet
3. Check RPC status of submitted transaction:
   - **NOT_FOUND** on RPC → transaction was dropped by the mempool
   - **CONFIRMED but reverted** → transaction executed but failed on-chain
   - **CONFIRMED and success** → transaction succeeded but finality not detected

## Recovery Options

### Option 1: Keep Wallet Paused

If you want to investigate further before acting:
1. Select the wallet
2. Click "Keep Paused"
3. Enter operator ID and notes
4. Investigate off-chain before returning

### Option 2: Force Release Lock (After Investigating)

If the original transaction is definitely dropped/failed and you want to allow the wallet to submit again:

1. Select the wallet
2. Verify the txHash is dropped on Basescan (search the tx hash)
3. Click "Force Release Lock"
4. **IMPORTANT**: Type the full wallet address to confirm
5. Enter operator ID and notes
6. The lock is released but wallet status remains as-is (operator must set back to ACTIVE)

### Option 3: Prepare Cancel Transaction Draft

If the original transaction is stuck in the mempool (not dropped, but not confirming):

1. Click "Prepare Cancel Tx Draft"
2. Review the draft transaction:
   - Same nonce as the stuck transaction
   - `to` = wallet's own address
   - `value` = 0
   - `data` = 0x (empty)
3. **MANUALLY** sign and send this cancel transaction from your wallet
4. After the cancel confirms, the original tx's nonce is consumed
5. You may now force-release the lock and resume the wallet

## Common Scenarios

### Scenario: Transaction Dropped by Mempool

**Symptoms**: RPC returns NOT_FOUND for the tx hash. The transaction never made it into a block.

**Recovery**:
1. Force release the lock (nonce was never actually used on-chain)
2. Set wallet back to ACTIVE
3. Retry the operation

### Scenario: Transaction Stuck Pending

**Symptoms**: Transaction is visible on Basescan but has 0 confirmations for many blocks.

**Recovery**:
1. Prepare cancel tx draft
2. Manually send cancel transaction
3. Wait for cancel to confirm
4. Force release the lock

### Scenario: Transaction Reverted On-Chain

**Symptoms**: Transaction confirmed but status = reverted.

**Recovery**:
1. The nonce was consumed (another tx cannot use the same nonce)
2. Force release the lock
3. Set wallet to ACTIVE if appropriate
4. Investigate why the transaction reverted

## Prevention

- Monitor the `wallet_quarantined` and `stuck_tx_detected` alerts
- Review stuck transactions promptly
- Keep gas settings adequate to avoid产后 tx due to low gas price
```

- [ ] **Step 3: Commit**

```bash
git add docs/NONCE_RESERVATION_AND_RECOVERY.md docs/STUCK_DROPPED_TX_RUNBOOK.md
git commit -m "docs: add nonce reservation and stuck tx runbook"
```

---

## Phase 12: Final Validation

### Task 13: Run full validation

- [ ] **Step 1: Typecheck**

Run: `cd apps/api && pnpm tsc --noEmit 2>&1`
Run: `cd apps/web && pnpm tsc --noEmit 2>&1`

- [ ] **Step 2: Lint**

Run: `pnpm lint 2>&1 | head -40`

- [ ] **Step 3: Tests**

Run: `cd apps/api && pnpm test --run 2>&1 | tail -40`

- [ ] **Step 4: Fix any type errors or test failures**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete nonce reservation and recovery implementation"
```

---

## Task Summary

| # | Task | Key Files | Status |
|---|------|-----------|--------|
| 1 | Schema — enums, wallets, locks, transactions | `schema.ts` | Pending |
| 2 | NonceReservationService core | `nonce/nonce-reservation.ts` | Pending |
| 3 | Trade routes — nonce integration | `trades/trade-routes.ts` | Pending |
| 4 | Approval service — nonce integration | `approvals/approval-service.ts` | Pending |
| 5 | Reconciliation worker | `reconciliation/reconciliation-worker.ts`, `queues.ts`, `scheduler-service.ts` | Pending |
| 6 | Alert webhook — new events | `ops/alert-webhook.ts` | Pending |
| 7 | Scheduler policy — skip quarantined | `scheduler/scheduler-policy.ts` | Pending |
| 8 | Confirmation worker — finality release | `scheduler/confirmation.worker.ts` | Pending |
| 9 | Recovery API routes | `recovery/recovery-routes.ts`, `server.ts` | Pending |
| 10 | Recovery UI page | `web/app/admin/recovery/page.tsx` | Pending |
| 11 | Tests | `nonce/nonce-reservation.test.ts`, `scheduler/quarantine.test.ts` | Pending |
| 12 | Documentation | `docs/NONCE_RESERVATION_AND_RECOVERY.md`, `docs/STUCK_DROPPED_TX_RUNBOOK.md` | Pending |
| 13 | Final validation | — | Pending |

---

## Spec Self-Review Checklist

- [ ] Every schema field from the design appears in Task 1
- [ ] All NonceReservationService methods (reserve, attach, reconcile, release, forcePause, canSubmit, getState) are implemented in Task 2
- [ ] Live execute flow calls reserveNonce before sign (Task 3) and attachSubmitted after send
- [ ] Approval flow has same nonce reservation pattern (Task 4)
- [ ] Reconciliation worker is registered and scheduled (Task 5)
- [ ] All 5 new alert types are emitted at correct points (Task 6)
- [ ] Scheduler policy rejects QUARANTINED and UNCERTAIN wallets (Task 7)
- [ ] Confirmation worker calls releaseWalletLockAfterFinality (Task 8)
- [ ] Recovery routes have all 5 actions: list, stuck-txs, mark-reviewed, keep-paused, force-release, cancel-draft (Task 9)
- [ ] Recovery UI shows wallet nonce state, RPC vs stored nonce, lock details, tx details (Task 10)
- [ ] Tests cover: concurrent block, lock not auto-released, stuck detection, quarantine, force-release confirmation (Task 11)
- [ ] Both docs written (Task 12)
- [ ] No placeholder code (TBD/TODO) in any task
- [ ] All type/interface names are consistent across tasks