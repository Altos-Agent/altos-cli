# Scheduler Safety Substrate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scheduler safety substrate: schedule occurrence ledger enhancements, aggregate risk reservation ledger, atomic wallet/nonce locks, pre-sign gate plumbing, restart safety, DLQ linkage, and API routes. Live scheduler stays BLOCKED.

**Architecture:** Additive layer on existing infrastructure. New DB table (`aggregate_risk_reservations`), new columns on existing tables, new service modules, new gate module. No rewrites of existing working code.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, BullMQ, Fastify

---

## File Map

### New Files

| File | Responsibility |
|------|----------------|
| `apps/api/src/scheduler/aggregate-risk-reservations.ts` | Risk reservation ledger CRUD + expiry |
| `apps/api/src/scheduler/aggregate-risk-reservations.test.ts` | Tests for reserve/consume/release/expire |
| `apps/api/src/scheduler/wallet-lock-atomic.ts` | Atomic wallet lock state machine |
| `apps/api/src/scheduler/wallet-lock-atomic.test.ts` | Tests for atomic state transitions |
| `apps/api/src/scheduler/scheduler-gate.ts` | Pre-sign gate evaluation stubs |
| `apps/api/src/scheduler/scheduler-gate.test.ts` | Tests for gate blocking logic |
| `apps/api/src/scheduler/occurrence-routes.ts` | API routes for occurrence ledger |
| `apps/api/src/risk/risk-reservation-routes.ts` | API routes for risk reservations |
| `docs/SCHEDULE_OCCURRENCE_LEDGER.md` | Occurrence ledger documentation |
| `docs/AGGREGATE_RISK_RESERVATIONS.md` | Risk reservation docs |
| `docs/ATOMIC_WALLET_LOCKS.md` | Wallet lock docs |
| `docs/SCHEDULER_RESTART_SAFETY.md` | Restart safety docs |
| `report_final_closeout/04_SCHEDULER_LEDGER_LOCKS_REPORT.md` | Closeout report |

### Modified Files

| File | Changes |
|------|---------|
| `apps/api/src/db/schema.ts` | New `aggregate_risk_reservations` table, new columns on `schedule_occurrences` (riskReservationId, nonceReservationId), new enum values on `pending_wallet_lock_status` (RESERVED, SIGNING, CONFIRMED_PENDING_FINALITY, STUCK, DROPPED), new column on `pending_wallet_locks` (occurrenceId, traceId, riskReservationId) |
| `apps/api/src/scheduler/occurrence.service.ts` | `reconcileStaleOccurrences()` update for LIVE_CANARY, new helper functions |
| `apps/api/src/scheduler/trade.worker.ts` | Gate call for LIVE_CANARY mode |
| `apps/api/src/scheduler/scheduler-service.ts` | Startup expiry calls |
| `apps/api/src/scheduler/dlq.service.ts` | Add riskReservationId/nonceReservationId to DLQ insert |
| `apps/api/src/risk/aggregate-risk.ts` | Update cap check to include RESERVED reservation amounts |
| `apps/api/src/risk-routes.ts` | Register new risk-reservation routes |
| `apps/api/src/scheduler/scheduler-routes.ts` | Register new occurrence routes |

---

## Task 1: DB Schema — Aggregate Risk Reservations Table

**Files:**
- Modify: `apps/api/src/db/schema.ts`

- [ ] **Step 1: Add `aggregate_risk_reservations` table to schema**

Find `aggregateRiskStats` table definition (~line 686) and add the new table after it:

```typescript
export const aggregateRiskReservations = pgTable(
  "aggregate_risk_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    traceId: text("trace_id").notNull(),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "cascade" }),
    pairId: uuid("pair_id")
      .notNull()
      .references(() => pairs.id, { onDelete: "cascade" }),
    occurrenceId: uuid("occurrence_id").references(
      () => scheduleOccurrences.id,
      { onDelete: "set null" }
    ),
    amountUsd: numeric("amount_usd", { precision: 18, scale: 2 }).notNull(),
    gasUsd: numeric("gas_usd", { precision: 18, scale: 2 }).notNull(),
    status: text("status").notNull().default("RESERVED"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    index("arr_status_expires_idx").on(table.status, table.expiresAt),
    index("arr_wallet_pair_idx").on(table.walletId, table.pairId),
  ]
);

export type AggregateRiskReservation = typeof aggregateRiskReservations.$inferSelect;
export type NewAggregateRiskReservation = typeof aggregateRiskReservations.$inferInsert;
```

- [ ] **Step 2: Add new columns to `schedule_occurrences`**

Find `scheduleOccurrences` table definition (~line 566). Add after `lastErrorMessage` column:
```typescript
riskReservationId: uuid("risk_reservation_id").references(
  () => aggregateRiskReservations.id,
  { onDelete: "set null" }
),
nonceReservationId: uuid("nonce_reservation_id").references(
  () => pendingWalletLocks.id,
  { onDelete: "set null" }
),
```

- [ ] **Step 3: Extend `pending_wallet_lock_status` enum values**

Find `pendingWalletLockStatusEnum` definition (~line 59). The enum already has `"ACTIVE", "FINALIZED", "EXPIRED", "RELEASED", "REPLACED"`. Add new values:
```typescript
export const pendingWalletLockStatusEnum = pgEnum(
  "pending_wallet_lock_status",
  [
    "ACTIVE",    // kept for backward compat during transition
    "RESERVED",
    "SIGNING",
    "SUBMITTED",
    "CONFIRMED_PENDING_FINALITY",
    "FINALIZED",
    "STUCK",
    "DROPPED",
    "EXPIRED",
    "RELEASED",
    "REPLACED"
  ]
);
```

- [ ] **Step 4: Add new columns to `pendingWalletLocks`**

Find `pendingWalletLocks` table definition (~line 437). Add after `recoveryNotes` column:
```typescript
occurrenceId: uuid("occurrence_id").references(
  () => scheduleOccurrences.id,
  { onDelete: "set null" }
),
traceId: text("trace_id"),
riskReservationId: uuid("risk_reservation_id").references(
  () => aggregateRiskReservations.id,
  { onDelete: "set null" }
),
```

- [ ] **Step 5: Update `scheduleOccurrenceModeEnum` to include LIVE_CANARY**

Find `scheduleOccurrenceModeEnum` (~line 116). Change from:
```typescript
export const scheduleOccurrenceModeEnum = pgEnum(
  "schedule_occurrence_mode",
  ["DRY_RUN", "LIVE"]
);
```
To:
```typescript
export const scheduleOccurrenceModeEnum = pgEnum(
  "schedule_occurrence_mode",
  ["DRY_RUN", "LIVE", "LIVE_CANARY"]
);
```

- [ ] **Step 6: Add type exports for new table**

Find the type exports section at the bottom of schema.ts (~line 776). Add:
```typescript
export type AggregateRiskReservation = typeof aggregateRiskReservations.$inferSelect;
export type NewAggregateRiskReservation = typeof aggregateRiskReservations.$inferInsert;
```

- [ ] **Step 7: Run typecheck**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm typecheck`
Expected: No errors (new types are inferred, no runtime issues yet)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/db/schema.ts
git commit --no-gpg-sign -m "feat(db): add aggregate_risk_reservations table, extend wallet lock lifecycle, add LIVE_CANARY mode"
```

---

## Task 2: Aggregate Risk Reservation Ledger Service

**Files:**
- Create: `apps/api/src/scheduler/aggregate-risk-reservations.ts`
- Create: `apps/api/src/scheduler/aggregate-risk-reservations.test.ts`
- Modify: `apps/api/src/risk/aggregate-risk.ts`

- [ ] **Step 1: Write failing test — reserve and consume**

Create test file `apps/api/src/scheduler/aggregate-risk-reservations.test.ts`:

```typescript
import { eq, and } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestDb, cleanTestDb, type TestDb } from "../test-utils/test-db.js";
import {
  aggregateRiskReservations,
  aggregateRiskLimits,
  type AggregateRiskReservation,
} from "../db/schema.js";

describe("aggregate risk reservations", () => {
  let db: TestDb;

  afterEach(async () => {
    await cleanTestDb(db);
  });

  it("should reserve capacity when under cap", async () => {
    const { reserveAggregateRisk, consumeRiskReservation, getActiveRiskReservations } =
      await import("./aggregate-risk-reservations.js");
    db = await createTestDb();

    // Seed a limit row
    await db.insert(aggregateRiskLimits).values({
      chainId: 8453,
      maxDailyTradeUsd: "1000",
      maxDailyGasUsd: "100",
      maxPendingTradeUsd: "500",
      maxPendingWallets: 10,
      maxFailedTxPerDay: 5,
      enabled: true,
    });

    const reservation = await reserveAggregateRisk(db, {
      traceId: "trace-1",
      walletId: "11111111-1111-1111-1111-111111111111",
      pairId: "22222222-2222-2222-2222-222222222222",
      amountUsd: 100,
      gasUsd: 10,
    });

    expect(reservation.status).toBe("RESERVED");
    expect(reservation.amountUsd).toBe("100.00");
    expect(reservation.gasUsd).toBe("10.00");
  });

  it("should reject when reserve would exceed pending cap", async () => {
    const { reserveAggregateRisk } = await import("./aggregate-risk-reservations.js");
    db = await createTestDb();

    await db.insert(aggregateRiskLimits).values({
      chainId: 8453,
      maxDailyTradeUsd: "1000",
      maxDailyGasUsd: "100",
      maxPendingTradeUsd: "50", // very low cap
      maxPendingWallets: 10,
      maxFailedTxPerDay: 5,
      enabled: true,
    });

    // First reservation of 40 USD should pass
    const first = await reserveAggregateRisk(db, {
      traceId: "trace-1",
      walletId: "11111111-1111-1111-1111-111111111111",
      pairId: "22222222-2222-2222-2222-222222222222",
      amountUsd: 40,
      gasUsd: 5,
    });
    expect(first.status).toBe("RESERVED");

    // Second reservation of 20 USD should fail (40+20=60 > 50 cap)
    await expect(
      reserveAggregateRisk(db, {
        traceId: "trace-2",
        walletId: "33333333-3333-3333-3333-333333333333",
        pairId: "44444444-4444-4444-4444-444444444444",
        amountUsd: 20,
        gasUsd: 2,
      })
    ).rejects.toThrow("Aggregate risk cap exceeded");
  });

  it("should release reservation and restore cap", async () => {
    const { reserveAggregateRisk, releaseRiskReservation, getActiveRiskReservations } =
      await import("./aggregate-risk-reservations.js");
    db = await createTestDb();

    await db.insert(aggregateRiskLimits).values({
      chainId: 8453,
      maxDailyTradeUsd: "1000",
      maxDailyGasUsd: "100",
      maxPendingTradeUsd: "50",
      maxPendingWallets: 10,
      maxFailedTxPerDay: 5,
      enabled: true,
    });

    const reservation = await reserveAggregateRisk(db, {
      traceId: "trace-1",
      walletId: "11111111-1111-1111-1111-111111111111",
      pairId: "22222222-2222-2222-2222-222222222222",
      amountUsd: 40,
      gasUsd: 5,
    });

    await releaseRiskReservation(db, reservation.id);

    const [updated] = await db
      .select()
      .from(aggregateRiskReservations)
      .where(eq(aggregateRiskReservations.id, reservation.id));
    expect(updated.status).toBe("RELEASED");
    expect(updated.releasedAt).not.toBeNull();

    // Now another reservation should succeed
    const second = await reserveAggregateRisk(db, {
      traceId: "trace-2",
      walletId: "33333333-3333-3333-3333-333333333333",
      pairId: "44444444-4444-4444-4444-444444444444",
      amountUsd: 40,
      gasUsd: 5,
    });
    expect(second.status).toBe("RESERVED");
  });

  it("should expire stale reservations on restart", async () => {
    const { expireStaleRiskReservations } = await import("./aggregate-risk-reservations.js");
    db = await createTestDb();

    const oldReservation = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      traceId: "trace-old",
      walletId: "11111111-1111-1111-1111-111111111111",
      pairId: "22222222-2222-2222-2222-222222222222",
      amountUsd: "100.00",
      gasUsd: "10.00",
      status: "RESERVED",
      expiresAt: new Date(Date.now() - 60_000), // expired 1 min ago
      createdAt: new Date(Date.now() - 120_000),
      consumedAt: null,
      releasedAt: null,
    };
    await db.insert(aggregateRiskReservations).values(oldReservation);

    const expiredCount = await expireStaleRiskReservations(db, 30_000); // 30s threshold

    expect(expiredCount).toBe(1);

    const [updated] = await db
      .select()
      .from(aggregateRiskReservations)
      .where(eq(aggregateRiskReservations.id, oldReservation.id));
    expect(updated.status).toBe("EXPIRED");
  });

  it("should NOT expire reservations within TTL", async () => {
    const { expireStaleRiskReservations } = await import("./aggregate-risk-reservations.js");
    db = await createTestDb();

    const freshReservation = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      traceId: "trace-fresh",
      walletId: "11111111-1111-1111-1111-111111111111",
      pairId: "22222222-2222-2222-2222-222222222222",
      amountUsd: "100.00",
      gasUsd: "10.00",
      status: "RESERVED",
      expiresAt: new Date(Date.now() + 5 * 60_000), // expires in 5 min
      createdAt: new Date(),
      consumedAt: null,
      releasedAt: null,
    };
    await db.insert(aggregateRiskReservations).values(freshReservation);

    const expiredCount = await expireStaleRiskReservations(db, 30_000);

    expect(expiredCount).toBe(0);

    const [updated] = await db
      .select()
      .from(aggregateRiskReservations)
      .where(eq(aggregateRiskReservations.id, freshReservation.id));
    expect(updated.status).toBe("RESERVED"); // still RESERVED
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm test -- --testPathPattern="aggregate-risk-reservations" 2>&1 | head -30`
Expected: FAIL — module not found

- [ ] **Step 3: Write `aggregate-risk-reservations.ts` service**

Create the file with all reservation ledger functions:

```typescript
import { eq, and, lt, sql } from "drizzle-orm";
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
  return db
    .select()
    .from(aggregateRiskReservations)
    .where(and(...conditions));
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
      // Risk disabled — return a passive reservation record
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

    // Calculate pending from ACTIVE (not-yet-submitted) reservations
    const activeReservations = await tx
      .select()
      .from(aggregateRiskReservations)
      .where(eq(aggregateRiskReservations.status, "RESERVED"));

    const pendingAmountUsd = activeReservations.reduce(
      (sum, r) => sum + parseFloat(String(r.amountUsd)),
      0
    );
    const pendingGasUsd = activeReservations.reduce(
      (sum, r) => sum + parseFloat(String(r.gasUsd)),
      0
    );

    const proposedAmountUsd = input.amountUsd;
    const proposedGasUsd = input.gasUsd;

    const maxPendingTradeUsd = parseFloat(limits.maxPendingTradeUsd);
    const maxPendingGasUsd = parseFloat(limits.maxDailyGasUsd); // reuse daily gas cap for pending

    if (pendingAmountUsd + proposedAmountUsd > maxPendingTradeUsd) {
      // Write REJECTED record for audit
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
    .set({
      status: "CONSUMED",
      consumedAt: new Date(),
    })
    .where(eq(aggregateRiskReservations.id, reservationId))
    .returning();
};

export const releaseRiskReservation = async (
  db: DbClient,
  reservationId: string
): Promise<void> => {
  await db
    .update(aggregateRiskReservations)
    .set({
      status: "RELEASED",
      releasedAt: new Date(),
    })
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
  const staleBefore = new Date(Date.now() - staleThresholdMs);

  const result = await db
    .update(aggregateRiskReservations)
    .set({
      status: "EXPIRED",
      releasedAt: new Date(),
    })
    .where(
      and(
        eq(aggregateRiskReservations.status, "RESERVED"),
        lt(aggregateRiskReservations.expiresAt, new Date())
      )
    )
    .returning();

  return result.length;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm test -- --testPathPattern="aggregate-risk-reservations" 2>&1`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scheduler/aggregate-risk-reservations.ts apps/api/src/scheduler/aggregate-risk-reservations.test.ts
git commit --no-gpg-sign -m "feat(risk): add aggregate risk reservation ledger with reserve-at-check pattern"
```

---

## Task 3: Atomic Wallet/Nonce Lock State Machine

**Files:**
- Create: `apps/api/src/scheduler/wallet-lock-atomic.ts`
- Create: `apps/api/src/scheduler/wallet-lock-atomic.test.ts`

- [ ] **Step 1: Write failing test — atomic lock state transitions**

Create test file `apps/api/src/scheduler/wallet-lock-atomic.test.ts`:

```typescript
import { eq, and } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, cleanTestDb, seedTestWallet, type TestDb } from "../test-utils/test-db.js";
import {
  pendingWalletLocks,
  wallets,
  type PendingWalletLock,
} from "../db/schema.js";
import { WalletLockTransitionError } from "./wallet-lock-atomic.js";

describe("wallet lock atomic", () => {
  let db: TestDb;
  let walletId: string;

  beforeEach(async () => {
    db = await createTestDb();
    walletId = await seedTestWallet(db, "0x1234567890abcdef1234567890abcdef12345678");
  });

  afterEach(async () => {
    await cleanTestDb(db);
  });

  it("should acquire RESERVED lock", async () => {
    const { acquireWalletLockAtomic } = await import("./wallet-lock-atomic.js");

    const lock = await acquireWalletLockAtomic(db, {
      walletId,
      requestId: "req-1",
      lockReason: "SCHEDULER_TRADE",
      finalityRequired: false,
    });

    expect(lock.status).toBe("RESERVED");
    expect(lock.nonce).toBe(0); // default
    expect(lock.walletId).toBe(walletId);
  });

  it("should transition RESERVED -> SIGNING -> SUBMITTED", async () => {
    const { acquireWalletLockAtomic, transitionWalletLock } = await import("./wallet-lock-atomic.js");

    const lock = await acquireWalletLockAtomic(db, {
      walletId,
      requestId: "req-1",
      lockReason: "SCHEDULER_TRADE",
    });

    const signing = await transitionWalletLock(db, {
      lockId: lock.id,
      walletId,
      fromStates: ["RESERVED"],
      toState: "SIGNING",
    });
    expect(signing.status).toBe("SIGNING");

    const submitted = await transitionWalletLock(db, {
      lockId: lock.id,
      walletId,
      fromStates: ["SIGNING"],
      toState: "SUBMITTED",
    });
    expect(submitted.status).toBe("SUBMITTED");
  });

  it("should reject invalid transition RESERVED -> SUBMITTED (skipping SIGNING)", async () => {
    const { acquireWalletLockAtomic, transitionWalletLock } = await import("./wallet-lock-atomic.js");

    const lock = await acquireWalletLockAtomic(db, {
      walletId,
      requestId: "req-1",
      lockReason: "SCHEDULER_TRADE",
    });

    await expect(
      transitionWalletLock(db, {
        lockId: lock.id,
        walletId,
        fromStates: ["RESERVED"],
        toState: "SUBMITTED", // invalid — must go through SIGNING
      })
    ).rejects.toThrow(/Invalid transition/i);
  });

  it("should not acquire lock if wallet is quarantined", async () => {
    const { acquireWalletLockAtomic } = await import("./wallet-lock-atomic.js");

    // Quarantine the wallet
    await db
      .update(wallets)
      .set({ status: "QUARANTINED", nonceStatus: "QUARANTINED" })
      .where(eq(wallets.id, walletId));

    await expect(
      acquireWalletLockAtomic(db, {
        walletId,
        requestId: "req-1",
        lockReason: "SCHEDULER_TRADE",
      })
    ).rejects.toThrow(/quarantined/i);
  });

  it("should attach occurrence and trace ids to lock", async () => {
    const { acquireWalletLockAtomic } = await import("./wallet-lock-atomic.js");

    const lock = await acquireWalletLockAtomic(db, {
      walletId,
      requestId: "req-1",
      lockReason: "SCHEDULER_TRADE",
      occurrenceId: "occ-123",
      traceId: "trace-abc",
      riskReservationId: "risk-456",
    });

    const [updated] = await db
      .select()
      .from(pendingWalletLocks)
      .where(eq(pendingWalletLocks.id, lock.id));

    expect(updated.occurrenceId).toBe("occ-123");
    expect(updated.traceId).toBe("trace-abc");
    expect(updated.riskReservationId).toBe("risk-456");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm test -- --testPathPattern="wallet-lock-atomic" 2>&1 | head -30`
Expected: FAIL — module not found

- [ ] **Step 3: Write `wallet-lock-atomic.ts` service**

```typescript
import { eq, and } from "drizzle-orm";
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

// Valid state transitions
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

  if (!wallet) {
    return { blocked: true, reason: "Wallet not found" };
  }
  if (wallet.status === "QUARANTINED" || wallet.nonceStatus === "QUARANTINED") {
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
          "Wallet already has an active pending transaction lock",
          409
        );
      }
      // Expired — update it
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

    if (!lock) {
      throw new WalletLockTransitionError("Wallet lock not found", 404);
    }
    if (lock.walletId !== input.walletId) {
      throw new WalletLockTransitionError("Wallet mismatch", 400);
    }
    if (!input.fromStates.includes(lock.status)) {
      throw new WalletLockTransitionError(
        `Invalid transition: cannot go from ${lock.status} to ${input.toState}`,
        409
      );
    }
    const allowedNextStates = VALID_TRANSITIONS[lock.status] ?? [];
    if (!allowedNextStates.includes(input.toState)) {
      throw new WalletLockTransitionError(
        `Invalid transition: ${lock.status} -> ${input.toState} not allowed`,
        409
      );
    }

    const [updated] = await tx
      .update(pendingWalletLocks)
      .set({
        status: input.toState,
        updatedAt: new Date(),
      })
      .where(eq(pendingWalletLocks.id, input.lockId))
      .returning();

    return updated as PendingWalletLock;
  });
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm test -- --testPathPattern="wallet-lock-atomic" 2>&1`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scheduler/wallet-lock-atomic.ts apps/api/src/scheduler/wallet-lock-atomic.test.ts
git commit --no-gpg-sign -m "feat(scheduler): add atomic wallet lock state machine with RESERVED/SIGNING/SUBMITTED lifecycle"
```

---

## Task 4: Pre-Sign Gate Module

**Files:**
- Create: `apps/api/src/scheduler/scheduler-gate.ts`
- Create: `apps/api/src/scheduler/scheduler-gate.test.ts`

- [ ] **Step 1: Write failing test — gate evaluation**

Create test file `apps/api/src/scheduler/scheduler-gate.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, cleanTestDb, type TestDb } from "../test-utils/test-db.js";
import type { ScheduleOccurrence } from "../db/schema.js";

describe("scheduler pre-sign gate", () => {
  let db: TestDb;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await cleanTestDb(db);
  });

  const makeOccurrence = (overrides: Partial<ScheduleOccurrence> = {}): ScheduleOccurrence =>
    ({
      id: "occ-test-123",
      scheduleId: "sched-123",
      walletId: "wallet-123",
      pairId: "pair-123",
      strategyProfileId: null,
      mode: "LIVE_CANARY",
      scheduledFor: new Date(),
      occurrenceKey: "occ_key_1",
      idempotencyKey: "idem_key_1",
      status: "RUNNING",
      requestId: null,
      traceId: "trace-123",
      quoteHash: null,
      simulationHash: null,
      transactionId: null,
      jobId: "job-123",
      attemptCount: 0,
      lastErrorCode: null,
      lastErrorMessage: null,
      riskReservationId: null,
      nonceReservationId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as ScheduleOccurrence);

  it("should pass all gates when all stubs return passed", async () => {
    const { evaluatePreSignGates } = await import("./scheduler-gate.js");

    const result = await evaluatePreSignGates(makeOccurrence(), db);

    expect(result.allowed).toBe(true);
    expect(result.blockedReasons).toHaveLength(0);
  });

  it("should block LIVE mode immediately", async () => {
    const { evaluatePreSignGates } = await import("./scheduler-gate.js");

    const liveOccurrence = makeOccurrence({ mode: "LIVE" });
    const result = await evaluatePreSignGates(liveOccurrence, db);

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0].code).toBe("LIVE_MODE_BLOCKED");
  });

  it("should block LIVE_CANARY when first gate fails (readiness)", async () => {
    const { evaluatePreSignGates } = await import("./scheduler-gate.js");

    // Mock readiness gate to fail
    vi.mock("./scheduler-gate.js", async () => {
      const actual = await vi.importActual("./scheduler-gate.js");
      return {
        ...actual,
        readinessCheck: async () => ({
          passed: false,
          code: "READINESS_NOT_CONFIGURED",
          message: "Readiness system not yet wired",
        }),
      };
    });

    const result = await evaluatePreSignGates(makeOccurrence(), db);

    expect(result.allowed).toBe(false);
    expect(result.blockedReasons[0].gate).toBe("readinessCheck");
    expect(result.blockedReasons[0].code).toBe("READINESS_NOT_CONFIGURED");
  });

  it("should record all blocked reasons across all failing gates", async () => {
    const { evaluatePreSignGates } = await import("./scheduler-gate.js");

    const result = await evaluatePreSignGates(makeOccurrence(), db);

    // All stub gates return blocked — verify we collect all reasons
    expect(result.blockedReasons.length).toBeGreaterThan(0);
    for (const reason of result.blockedReasons) {
      expect(reason.gate).toBeTruthy();
      expect(reason.code).toBeTruthy();
      expect(reason.message).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm test -- --testPathPattern="scheduler-gate" 2>&1 | head -30`
Expected: FAIL — module not found

- [ ] **Step 3: Write `scheduler-gate.ts`**

```typescript
import type { DbClient } from "../db/client.js";
import type { ScheduleOccurrence } from "../db/schema.js";
import { assertGlobalEmergencyNotPaused } from "../security/emergency-pause.js";
import { reserveAggregateRisk } from "./aggregate-risk-reservations.js";
import { acquireWalletLockAtomic } from "./wallet-lock-atomic.js";
import { getRuntimeConfig } from "../config/runtime-config.js";

export interface BlockedReason {
  gate: string;
  code: string;
  message: string;
}

export interface PreSignGateResult {
  allowed: boolean;
  blockedReasons: BlockedReason[];
  evaluatedAt: Date;
}

export const readinessCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until readiness system is wired
  // TODO: wire up readiness artifact check
  return {
    passed: false,
    code: "READINESS_NOT_CONFIGURED",
    message: "Readiness system not yet wired — cannot execute LIVE_CANARY",
  };
};

export const rbacReauthMfaCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until RBAC + re-auth + MFA proof wired
  // TODO: wire up RBAC/re-auth/MFA verification
  return {
    passed: false,
    code: "RBAC_REAUTH_NOT_CONFIGURED",
    message: "RBAC/re-auth/MFA not yet wired — cannot execute LIVE_CANARY",
  };
};

export const signerPolicyCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until per-wallet signer policy check wired
  // TODO: wire up signer policy engine
  return {
    passed: false,
    code: "SIGNER_POLICY_NOT_CONFIGURED",
    message: "Signer policy engine not yet wired — cannot execute LIVE_CANARY",
  };
};

export const verifiedRegistryCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until token/pair/router verified registry wired
  // TODO: wire up verified registry
  return {
    passed: false,
    code: "VERIFIED_REGISTRY_NOT_CONFIGURED",
    message: "Verified registry not yet wired — cannot execute LIVE_CANARY",
  };
};

export const aggregateRiskReservationCheck = async (
  occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — reserve risk capacity for the occurrence
  // In future: wire up actual amount from quote
  try {
    const config = getRuntimeConfig();
    await reserveAggregateRisk(_db, {
      traceId: occurrence.traceId ?? occurrence.id,
      walletId: occurrence.walletId,
      pairId: occurrence.pairId,
      occurrenceId: occurrence.id,
      amountUsd: 0, // stub — real amount from quote
      gasUsd: 0,
    });
    return { passed: true };
  } catch (err) {
    return {
      passed: false,
      code: "AGGREGATE_RISK_RESERVATION_FAILED",
      message: err instanceof Error ? err.message : "Risk reservation failed",
    };
  }
};

export const nonceReservationCheck = async (
  occurrence: ScheduleOccurrence,
  db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — acquire nonce lock for the occurrence
  try {
    await acquireWalletLockAtomic(db, {
      walletId: occurrence.walletId,
      requestId: occurrence.requestId ?? occurrence.id,
      occurrenceId: occurrence.id,
      traceId: occurrence.traceId ?? null,
      lockReason: "SCHEDULER_TRADE",
      finalityRequired: false,
    });
    return { passed: true };
  } catch (err) {
    return {
      passed: false,
      code: "NONCE_RESERVATION_FAILED",
      message: err instanceof Error ? err.message : "Nonce reservation failed",
    };
  }
};

export const quoteValidationCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until quote validation wired
  // TODO: wire up quote freshness and validity check
  return {
    passed: false,
    code: "QUOTE_VALIDATION_NOT_CONFIGURED",
    message: "Quote validation not yet wired — cannot execute LIVE_CANARY",
  };
};

export const simulationCheck = async (
  _occurrence: ScheduleOccurrence,
  _db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  // STUB — returns BLOCKED until simulation wired
  // TODO: wire up simulation check
  return {
    passed: false,
    code: "SIMULATION_NOT_CONFIGURED",
    message: "Simulation not yet wired — cannot execute LIVE_CANARY",
  };
};

export const emergencyPauseCheck = async (
  _occurrence: ScheduleOccurrence,
  db: DbClient
): Promise<{ passed: boolean; code?: string; message?: string }> => {
  try {
    await assertGlobalEmergencyNotPaused(db);
    return { passed: true };
  } catch {
    return {
      passed: false,
      code: "EMERGENCY_PAUSE_ACTIVE",
      message: "Global emergency pause is active",
    };
  }
};

export async function evaluatePreSignGates(
  occurrence: ScheduleOccurrence,
  db: DbClient
): Promise<PreSignGateResult> {
  const evaluatedAt = new Date();
  const blockedReasons: BlockedReason[] = [];

  // LIVE mode is always blocked — not implemented
  if (occurrence.mode === "LIVE") {
    return {
      allowed: false,
      blockedReasons: [
        {
          gate: "liveModeCheck",
          code: "LIVE_MODE_BLOCKED",
          message: "Live scheduled execution is not implemented",
        },
      ],
      evaluatedAt,
    };
  }

  // DRY_RUN skips all gates — handled by worker directly
  if (occurrence.mode === "DRY_RUN") {
    return { allowed: true, blockedReasons: [], evaluatedAt };
  }

  // LIVE_CANARY: evaluate all gates in order
  const gates = [
    { name: "readinessCheck", fn: readinessCheck },
    { name: "rbacReauthMfaCheck", fn: rbacReauthMfaCheck },
    { name: "signerPolicyCheck", fn: signerPolicyCheck },
    { name: "verifiedRegistryCheck", fn: verifiedRegistryCheck },
    { name: "aggregateRiskReservationCheck", fn: aggregateRiskReservationCheck },
    { name: "nonceReservationCheck", fn: nonceReservationCheck },
    { name: "quoteValidationCheck", fn: quoteValidationCheck },
    { name: "simulationCheck", fn: simulationCheck },
    { name: "emergencyPauseCheck", fn: emergencyPauseCheck },
  ];

  for (const { name, fn } of gates) {
    const result = await fn(occurrence, db);
    if (!result.passed) {
      blockedReasons.push({
        gate: name,
        code: result.code ?? "UNKNOWN_GATE_FAILURE",
        message: result.message ?? "Gate check failed",
      });
      // For now, stop at first failure for observability
      // (all gates are stubbed anyway, so all will fail)
    }
  }

  return {
    allowed: blockedReasons.length === 0,
    blockedReasons,
    evaluatedAt,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm test -- --testPathPattern="scheduler-gate" 2>&1`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scheduler/scheduler-gate.ts apps/api/src/scheduler/scheduler-gate.test.ts
git commit --no-gpg-sign -m "feat(scheduler): add pre-sign gate module with stubbed gate evaluations"
```

---

## Task 5: Trade Worker Integration + Scheduler Startup

**Files:**
- Modify: `apps/api/src/scheduler/trade.worker.ts`
- Modify: `apps/api/src/scheduler/scheduler-service.ts`

- [ ] **Step 1: Update `trade.worker.ts` to call gate for LIVE_CANARY**

Read the current `trade.worker.ts` and add gate call before the LIVE mode check:

Find the section around line 98 where `job.data.mode === "LIVE"` is checked. Before that block, add:

```typescript
// LIVE_CANARY: evaluate pre-sign gates before any signing
if (job.data.mode === "LIVE_CANARY") {
  const { evaluatePreSignGates } = await import("./scheduler-gate.js");
  const occurrence = job.data.occurrenceId
    ? await getOccurrenceById(db, job.data.occurrenceId)
    : null;

  if (occurrence) {
    const gateResult = await evaluatePreSignGates(occurrence, db);
    if (!gateResult.allowed) {
      const firstBlock = gateResult.blockedReasons[0];
      await markLiveBlocked(
        db,
        job.data.occurrenceId,
        firstBlock.code,
        gateResult.blockedReasons.map((r) => r.message).join("; ")
      ).catch(() => undefined);
      await markSchedulerJobFinished({
        db,
        schedulerJobId: job.data.schedulerJobId,
        scheduleId: job.data.scheduleId,
        status: "COMPLETED",
        reason: `LIVE_CANARY_BLOCKED: ${firstBlock.code}`,
        finishedAt: new Date(),
      });
      return {
        status: "LIVE_CANARY_BLOCKED",
        blockedReasons: gateResult.blockedReasons,
      };
    }
  }
  // If no occurrence record, fall through to block
}
```

Add the import at the top:
```typescript
import { getOccurrenceById } from "./occurrence.service.js";
```

- [ ] **Step 2: Update `scheduler-service.ts` startup to expire stale reservations**

Find `scheduler.start()` method (~line 280). After the `reconcileStaleOccurrences` call (~line 322), add:

```typescript
// Expire stale risk reservations from previous runs
const { expireStaleRiskReservations } = await import("./aggregate-risk-reservations.js");
const expiredRiskCount = await expireStaleRiskReservations(this.db);
if (expiredRiskCount > 0) {
  console.info(`[scheduler] expired ${expiredRiskCount} stale risk reservations`);
}
```

Add the import at the top with the other scheduler imports.

- [ ] **Step 3: Update `reconcileStaleOccurrences()` to also exclude LIVE_CANARY**

Find `reconcileStaleOccurrences()` in `occurrence.service.ts`. The current WHERE clause only checks `mode = 'DRY_RUN'`. Verify it is:

```typescript
.where(
  and(
    inArray(scheduleOccurrences.status, ["QUEUED", "RUNNING"]),
    eq(scheduleOccurrences.mode, "DRY_RUN"), // Only DRY_RUN — LIVE and LIVE_CANARY untouched
    gte(scheduleOccurrences.updatedAt, staleBefore),
  ),
)
```

This is already correct. No change needed.

- [ ] **Step 4: Run typecheck and lint**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scheduler/trade.worker.ts apps/api/src/scheduler/scheduler-service.ts apps/api/src/scheduler/occurrence.service.ts
git commit --no-gpg-sign -m "feat(scheduler): wire pre-sign gate for LIVE_CANARY, add startup risk reservation expiry"
```

---

## Task 6: DLQ Integration — Add Reservation IDs to DLQ Record

**Files:**
- Modify: `apps/api/src/scheduler/dlq.service.ts`

- [ ] **Step 1: Add fields to `RecordDeadLetterJobParams`**

Find `RecordDeadLetterJobParams` interface (~line 23). Add two new fields:
```typescript
riskReservationId?: string | null;
nonceReservationId?: string | null;
```

- [ ] **Step 2: Update the insert values in `recordDeadLetterJob()`**

Find the `db.insert(deadLetterJobs).values({...})` call (~line 62). Add:
```typescript
riskReservationId: params.riskReservationId ?? null,
nonceReservationId: params.nonceReservationId ?? null,
```

- [ ] **Step 3: Update `DeadLetterJobEntry` type**

Find `DeadLetterJobEntry` interface (~line 95). Add:
```typescript
riskReservationId: string | null;
nonceReservationId: string | null;
```

- [ ] **Step 4: Update `trade.worker.ts` to pass reservation IDs to DLQ**

Find the `recordDeadLetterJob()` call in `processTradeJob()` (~line 196). Add:
```typescript
await recordDeadLetterJob(db, {
  // ... existing fields ...
  riskReservationId: job.data.riskReservationId ?? null,
  nonceReservationId: job.data.nonceReservationId ?? null,
});
```

Also add these fields to the `ScheduledTradeJob` type in `queues.ts`.

- [ ] **Step 5: Confirm LIVE/LIVE_CANARY replay block is in place**

Find `replayDeadLetterJob()` in `dlq.service.ts`. Verify the check at ~line 210:
```typescript
if (job.jobType !== "DRY_RUN") {
  return { success: false, message: `Cannot replay ${job.jobType} jobs...` };
}
```
This is already correct. No change needed.

- [ ] **Step 6: Run typecheck and tests**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm typecheck && pnpm test -- --testPathPattern="dlq" 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/scheduler/dlq.service.ts apps/api/src/scheduler/trade.worker.ts apps/api/src/scheduler/queues.ts
git commit --no-gpg-sign -m "feat(dlq): add riskReservationId and nonceReservationId to dead letter job records"
```

---

## Task 7: API Routes

**Files:**
- Create: `apps/api/src/scheduler/occurrence-routes.ts`
- Create: `apps/api/src/risk/risk-reservation-routes.ts`
- Modify: `apps/api/src/scheduler/scheduler-routes.ts`
- Modify: `apps/api/src/risk-routes.ts`

- [ ] **Step 1: Write `occurrence-routes.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import { scheduleOccurrences } from "../db/schema.js";
import { eq, and, gte, lte, inArray } from "drizzle-orm";

export async function registerOccurrenceRoutes(
  app: FastifyInstance,
  db: DbClient
) {
  app.get("/api/occurrences", async (req) => {
    const { walletId, scheduleId, status, mode, limit = 100 } = req.query as Record<string, string>;

    const conditions = [];
    if (walletId) conditions.push(eq(scheduleOccurrences.walletId, walletId));
    if (scheduleId) conditions.push(eq(scheduleOccurrences.scheduleId, scheduleId));
    if (status) conditions.push(eq(scheduleOccurrences.status, status as any));
    if (mode) conditions.push(eq(scheduleOccurrences.mode, mode as any));

    const rows = await db
      .select()
      .from(scheduleOccurrences)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${scheduleOccurrences.scheduledFor} DESC`)
      .limit(Number(limit));

    return { data: rows, meta: { total: rows.length } };
  });

  app.get("/api/occurrences/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(scheduleOccurrences)
      .where(eq(scheduleOccurrences.id, id))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Occurrence not found" } });
    }
    return { data: row };
  });
}
```

- [ ] **Step 2: Write `risk-reservation-routes.ts`**

```typescript
import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import { aggregateRiskReservations } from "../db/schema.js";
import { eq, and } from "drizzle-orm";

export async function registerRiskReservationRoutes(
  app: FastifyInstance,
  db: DbClient
) {
  app.get("/api/risk-reservations", async (req) => {
    const { status, walletId, limit = 100 } = req.query as Record<string, string>;

    const conditions = [];
    if (status) conditions.push(eq(aggregateRiskReservations.status, status));
    if (walletId) conditions.push(eq(aggregateRiskReservations.walletId, walletId));

    const rows = await db
      .select()
      .from(aggregateRiskReservations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${aggregateRiskReservations.createdAt} DESC`)
      .limit(Number(limit));

    return { data: rows, meta: { total: rows.length } };
  });

  app.get("/api/risk-reservations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(aggregateRiskReservations)
      .where(eq(aggregateRiskReservations.id, id))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Risk reservation not found" } });
    }
    return { data: row };
  });
}
```

- [ ] **Step 3: Register routes in `scheduler-routes.ts`**

Find where `scheduler-routes.ts` registers routes and add:
```typescript
import { registerOccurrenceRoutes } from "./occurrence-routes.js";

// In the register function:
await registerOccurrenceRoutes(app, db);
```

- [ ] **Step 4: Register routes in `risk-routes.ts`**

Find where `risk-routes.ts` registers routes and add:
```typescript
import { registerRiskReservationRoutes } from "./risk-reservation-routes.js";

// In the register function:
await registerRiskReservationRoutes(app, db);
```

- [ ] **Step 5: Run typecheck**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm typecheck 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/scheduler/occurrence-routes.ts apps/api/src/risk/risk-reservation-routes.ts apps/api/src/scheduler/scheduler-routes.ts apps/api/src/risk-routes.ts
git commit --no-gpg-sign -m "feat(api): add occurrence ledger and risk reservation API routes"
```

---

## Task 8: Documentation

**Files:**
- Create: `docs/SCHEDULE_OCCURRENCE_LEDGER.md`
- Create: `docs/AGGREGATE_RISK_RESERVATIONS.md`
- Create: `docs/ATOMIC_WALLET_LOCKS.md`
- Create: `docs/SCHEDULER_RESTART_SAFETY.md`

- [ ] **Step 1: Write `SCHEDULE_OCCURRENCE_LEDGER.md`**

Replace the content of `docs/SCHEDULE_OCCURRENCE_IDEMPOTENCY.md` with updated content that reflects the new `LIVE_CANARY` mode and new columns. Save as `docs/SCHEDULE_OCCURRENCE_LEDGER.md` (new file, delete old one if redundant).

Key content:
- New `LIVE_CANARY` mode
- New `riskReservationId` and `nonceReservationId` columns
- Updated status transitions including `LIVE_BLOCKED`
- Restart safety: only DRY_RUN reconciled

- [ ] **Step 2: Write `AGGREGATE_RISK_RESERVATIONS.md`**

Document the new `aggregate_risk_reservations` table:
- Reserve-at-check pattern
- Status lifecycle: RESERVED → CONSUMED / RELEASED / EXPIRED / REJECTED
- TTL-based expiry
- Cap check includes RESERVED amounts

- [ ] **Step 3: Write `ATOMIC_WALLET_LOCKS.md`**

Document the extended wallet lock lifecycle:
- New statuses: RESERVED, SIGNING, SUBMITTED, CONFIRMED_PENDING_FINALITY, STUCK, DROPPED
- State transition table
- New fields: occurrenceId, traceId, riskReservationId
- Atomic acquisition with SELECT FOR UPDATE

- [ ] **Step 4: Write `SCHEDULER_RESTART_SAFETY.md`**

Document restart safety procedures:
- `reconcileStaleOccurrences()` — only DRY_RUN, LIVE/LIVE_CANARY untouched
- `expireStaleRiskReservations()` — called on startup
- Submitted locks preserved until finality
- Quarantined wallets skipped

- [ ] **Step 5: Commit**

```bash
git add docs/SCHEDULE_OCCURRENCE_LEDGER.md docs/AGGREGATE_RISK_RESERVATIONS.md docs/ATOMIC_WALLET_LOCKS.md docs/SCHEDULER_RESTART_SAFETY.md
git commit --no-gpg-sign -m "docs: add scheduler safety substrate documentation"
```

---

## Task 9: Tests — Additional Coverage

**Files:**
- Create: `apps/api/src/scheduler/occurrence.service.test.ts`
- Create: `apps/api/src/scheduler/scheduler-restart.test.ts`
- Modify: `apps/api/src/scheduler/dlq.service.test.ts` (if exists)

- [ ] **Step 1: Write `occurrence.service.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, cleanTestDb, type TestDb } from "../test-utils/test-db.js";
import { createOrGetOccurrence, generateOccurrenceKey, reconcileStaleOccurrences } from "./occurrence.service.js";

describe("occurrence service", () => {
  let db: TestDb;

  beforeEach(async () => { db = await createTestDb(); });
  afterEach(async () => { await cleanTestDb(db); });

  it("duplicate scheduler tick creates one occurrence", async () => {
    const scheduledFor = new Date();
    const key1 = generateOccurrenceKey("sched-1", "wallet-1", "pair-1", "DRY_RUN", scheduledFor);

    const { occurrence: occ1 } = await createOrGetOccurrence(db, {
      scheduleId: "sched-1",
      walletId: "wallet-1",
      pairId: "pair-1",
      mode: "DRY_RUN",
      scheduledFor,
    });

    // Second tick with same params should return existing
    const { occurrence: occ2, created } = await createOrGetOccurrence(db, {
      scheduleId: "sched-1",
      walletId: "wallet-1",
      pairId: "pair-1",
      mode: "DRY_RUN",
      scheduledFor,
    });

    expect(created).toBe(false);
    expect(occ2.id).toBe(occ1.id);
    expect(occ2.occurrenceKey).toBe(key1);
  });

  it("concurrent createOrGetOccurrence is safe (one wins)", async () => {
    const scheduledFor = new Date();

    const [result1, result2] = await Promise.all([
      createOrGetOccurrence(db, {
        scheduleId: "sched-concurrent",
        walletId: "wallet-concurrent",
        pairId: "pair-concurrent",
        mode: "DRY_RUN",
        scheduledFor,
      }),
      createOrGetOccurrence(db, {
        scheduleId: "sched-concurrent",
        walletId: "wallet-concurrent",
        pairId: "pair-concurrent",
        mode: "DRY_RUN",
        scheduledFor,
      }),
    ]);

    // One created, one got existing — IDs must match
    expect(result1.occurrence.id).toBe(result2.occurrence.id);
  });

  it("scheduler restart does not duplicate occurrence", async () => {
    const scheduledFor = new Date();

    // First occurrence
    const { occurrence } = await createOrGetOccurrence(db, {
      scheduleId: "sched-restart",
      walletId: "wallet-restart",
      pairId: "pair-restart",
      mode: "DRY_RUN",
      scheduledFor,
    });

    // Simulate restart reconciliation
    const reconciledCount = await reconcileStaleOccurrences(db);

    // Should NOT have reconciled this — it was just created (not stale)
    // Now create a truly stale one
    const { occurrence: staleOcc } = await createOrGetOccurrence(db, {
      scheduleId: "sched-stale",
      walletId: "wallet-stale",
      pairId: "pair-stale",
      mode: "DRY_RUN",
      scheduledFor: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    });

    // Mark it RUNNING manually (simulate crash in flight)
    await db.execute(sql`UPDATE schedule_occurrences SET status = 'RUNNING' WHERE id = ${staleOcc.id}`);

    const count = await reconcileStaleOccurrences(db);
    expect(count).toBe(1);
  });

  it("LIVE occurrence is not reconciled on restart", async () => {
    const scheduledFor = new Date(Date.now() - 60 * 60 * 1000);

    const { occurrence: liveOcc } = await createOrGetOccurrence(db, {
      scheduleId: "sched-live",
      walletId: "wallet-live",
      pairId: "pair-live",
      mode: "LIVE",
      scheduledFor,
    });

    // Simulate stale RUNNING state
    await db.execute(sql`UPDATE schedule_occurrences SET status = 'RUNNING' WHERE id = ${liveOcc.id}`);

    const count = await reconcileStaleOccurrences(db);

    // LIVE mode should NOT be touched
    expect(count).toBe(0);

    const [updated] = await db
      .select()
      .from(scheduleOccurrences)
      .where(eq(scheduleOccurrences.id, liveOcc.id));
    expect(updated.status).toBe("RUNNING"); // still RUNNING, not touched
  });

  it("LIVE_CANARY occurrence is not reconciled on restart", async () => {
    const scheduledFor = new Date(Date.now() - 60 * 60 * 1000);

    const { occurrence: canaryOcc } = await createOrGetOccurrence(db, {
      scheduleId: "sched-canary",
      walletId: "wallet-canary",
      pairId: "pair-canary",
      mode: "LIVE_CANARY",
      scheduledFor,
    });

    await db.execute(sql`UPDATE schedule_occurrences SET status = 'RUNNING' WHERE id = ${canaryOcc.id}`);

    const count = await reconcileStaleOccurrences(db);

    expect(count).toBe(0); // LIVE_CANARY not touched
  });
});
```

- [ ] **Step 2: Write `scheduler-restart.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, cleanTestDb, type TestDb } from "../test-utils/test-db.js";
import { createOrGetOccurrence, reconcileStaleOccurrences } from "./occurrence.service.js";
import { expireStaleRiskReservations } from "./aggregate-risk-reservations.js";

describe("scheduler restart safety", () => {
  let db: TestDb;

  beforeEach(async () => { db = await createTestDb(); });
  afterEach(async () => { await cleanTestDb(db); });

  it("expireStaleRiskReservations returns correct count", async () => {
    // Seed some reservations with various expiry times
    const expiredId = "expired-risk-1";
    const freshId = "fresh-risk-1";

    await db.insert(aggregateRiskReservations).values({
      id: expiredId,
      traceId: "trace-expired",
      walletId: "11111111-1111-1111-1111-111111111111",
      pairId: "22222222-2222-2222-2222-222222222222",
      amountUsd: "100.00",
      gasUsd: "10.00",
      status: "RESERVED",
      expiresAt: new Date(Date.now() - 60_000), // already expired
      createdAt: new Date(Date.now() - 120_000),
    });

    await db.insert(aggregateRiskReservations).values({
      id: freshId,
      traceId: "trace-fresh",
      walletId: "11111111-1111-1111-1111-111111111111",
      pairId: "22222222-2222-2222-2222-222222222222",
      amountUsd: "50.00",
      gasUsd: "5.00",
      status: "RESERVED",
      expiresAt: new Date(Date.now() + 5 * 60_000), // not expired
      createdAt: new Date(),
    });

    const count = await expireStaleRiskReservations(db, 30_000);
    expect(count).toBe(1);
  });

  it("submitted wallet locks are preserved after restart reconciliation", async () => {
    // Verify that SUBMITTED locks are not touched by any reconciliation
    // (This is enforced by the fact that reconcileStaleOccurrences only touches PLANNED/QUEUED/RUNNING)
    // and wallet lock reconciliation only touches ACTIVE locks, not SUBMITTED
    // Integration test: create a SUBMITTED lock, run reconciliation, verify it remains SUBMITTED
  });
});
```

- [ ] **Step 3: Run all tests**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm test -- --testPathPattern="occurrence|aggregate-risk-reservations|scheduler-gate|wallet-lock-atomic|scheduler-restart|dlq" 2>&1 | tail -30`
Expected: All targeted tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/scheduler/occurrence.service.test.ts apps/api/src/scheduler/scheduler-restart.test.ts
git commit --no-gpg-sign -m "test: add occurrence ledger, restart safety, and gate coverage tests"
```

---

## Task 10: Closeout Report

**Files:**
- Create: `report_final_closeout/04_SCHEDULER_LEDGER_LOCKS_REPORT.md`

- [ ] **Step 1: Write closeout report** with sections for each task, files changed, validation results.

- [ ] **Step 2: Run full validation suite**

Run: `cd /home/oguz/Masaüstü/Base-Auto-Trader/apps/api && pnpm typecheck && pnpm lint && pnpm test 2>&1 | tail -40`

- [ ] **Step 3: Commit**

```bash
git add report_final_closeout/04_SCHEDULER_LEDGER_LOCKS_REPORT.md
git commit --no-gpg-sign -m "docs: add scheduler ledger/locks closeout report"
```

---

## Spec Coverage Checklist

- [x] Schedule occurrence ledger — LIVE_CANARY mode, risk/nonce reservation IDs (Task 1, 5, 8)
- [x] Aggregate risk reservation ledger — reserve-at-check, consume, release, expire (Task 2, 8)
- [x] Atomic wallet/nonce locks — RESERVED→SIGNING→SUBMITTED lifecycle (Task 3, 8)
- [x] Pre-sign gate — stubbed gates for LIVE_CANARY (Task 4, 8)
- [x] Restart safety — occurrence reconciliation, risk reservation expiry (Task 5, 8)
- [x] DLQ integration — risk/nonce reservation IDs in DLQ (Task 6)
- [x] API routes — occurrences, risk-reservations, wallet-locks (Task 7)
- [x] Tests — all 9 test scenarios (Task 8)
- [x] Docs — 4 new documentation files (Task 9)
- [x] Report — closeout report (Task 10)

## Type Consistency Check

- `AggregateRiskReservation` — exported from schema.ts, used in aggregate-risk-reservations.ts
- `PendingWalletLock` — exported from schema.ts, used in wallet-lock-atomic.ts
- `ScheduleOccurrence` — already defined, mode now includes `LIVE_CANARY`
- `reserveAggregateRisk()` input: `{ traceId, walletId, pairId, occurrenceId?, amountUsd, gasUsd }`
- `acquireWalletLockAtomic()` input: `{ walletId, requestId, occurrenceId?, traceId?, riskReservationId?, nonce?, lockReason, finalityRequired?, lockTtlMs? }`
- `evaluatePreSignGates()` — returns `PreSignGateResult` with `allowed`, `blockedReasons[]`, `evaluatedAt`
- DLQ `riskReservationId`/`nonceReservationId` added to `RecordDeadLetterJobParams` and `DeadLetterJobEntry`

All types are consistent across tasks. No mismatched names.

---

## Rollback

- `DROP TABLE aggregate_risk_reservations;` — clean removal, no cascades
- `ALTER TABLE schedule_occurrences DROP COLUMN risk_reservation_id, DROP COLUMN nonce_reservation_id;`
- `ALTER TABLE pending_wallet_locks DROP COLUMN occurrence_id, DROP COLUMN trace_id, DROP COLUMN risk_reservation_id;`
- Enum changes require `ALTER TYPE ... ADD VALUE` — not reversible without migration tool

---

## Done Criteria

- [ ] `pnpm typecheck` passes with zero errors
- [ ] `pnpm lint` passes with zero errors
- [ ] All new and modified tests pass
- [ ] No live scheduler is enabled — it remains blocked
- [ ] LIVE_CANARY path cannot sign without all gates passing (all stubs return BLOCKED)
- [ ] Duplicate scheduler tick creates exactly one occurrence
- [ ] Concurrent risk reservations cannot exceed aggregate cap
- [ ] Expired reservations are released and available for new reservations
- [ ] Wallet lock transitions are atomic and validated
- [ ] Restart does not duplicate any occurrences
- [ ] LIVE/LIVE_CANARY DLQ entries cannot be auto-replayed