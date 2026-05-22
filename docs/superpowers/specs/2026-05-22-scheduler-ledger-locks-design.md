# Scheduler Safety Substrate — Design Spec

## Status

**Accepted** — 2026-05-22

## Context

The scheduler handles automated trade execution across multiple wallets. Before live execution can be safely enabled, a safety substrate must be in place:

1. **Occurrence ledger** — durable, duplicate-safe record of every scheduled execution
2. **Risk reservation ledger** — prevents two concurrent requests from both passing aggregate caps before either writes a submitted tx
3. **Atomic wallet/nonce locks** — serialized wallet access with a richer lifecycle
4. **Pre-sign gate** — structured checkpoint list before any signing
5. **Restart safety** — correct reconciliation without duplication or data loss
6. **DLQ integration** — failed occurrences with full linkage for replay policy

Live scheduler remains BLOCKED throughout this phase. The substrate is the foundation for a future `LIVE_CANARY` path.

---

## 1. Schedule Occurrence Ledger

### Existing State

`schedule_occurrences` table already exists with:
- `id`, `scheduleId`, `walletId`, `pairId`, `strategyProfileId`
- `mode` (DRY_RUN | LIVE), `scheduledFor`, `occurrenceKey` (unique)
- `status` (PLANNED | QUEUED | RUNNING | DRY_RUN_ACCEPTED | DRY_RUN_REJECTED | LIVE_BLOCKED | FAILED | CANCELLED | DLQ)
- `requestId`, `traceId`, `jobId`, `quoteHash`, `simulationHash`
- `transactionId`, `attemptCount`, `lastErrorCode`, `lastErrorMessage`, timestamps

### Changes

**New mode value:**
```sql
ALTER TYPE schedule_occurrence_mode ADD VALUE IF NOT EXISTS 'LIVE_CANARY';
```

**New columns on `schedule_occurrences`:**
```sql
ALTER TABLE schedule_occurrences ADD COLUMN risk_reservation_id UUID REFERENCES aggregate_risk_reservations(id);
ALTER TABLE schedule_occurrences ADD COLUMN nonce_reservation_id UUID REFERENCES pending_wallet_locks(id);
```

**Restart reconciliation exclusion:** `LIVE` and `LIVE_CANARY` mode occurrences are never touched by `reconcileStaleOccurrences()`. Only `DRY_RUN` is reconciled. This invariant is enforced in the SQL WHERE clause.

### Mode Semantics

| Mode | Scheduler behavior | Restart reconciled | Can sign |
|------|-------------------|---------------------|----------|
| `DRY_RUN` | Execute dry-run only | Yes (→ FAILED if stale) | Never |
| `LIVE` | BLOCKED immediately | No | Never |
| `LIVE_CANARY` | Evaluate pre-sign gates | No | Only if all gates pass |

---

## 2. Aggregate Risk Reservations

### Purpose

`checkAggregateRisk()` in `aggregate-risk.ts` currently reads stats and allows/rejects, but two concurrent requests could both pass the cap before either submits a tx. The reservation ledger prevents this by making capacity claims explicit and durable.

### Data Model

**`aggregate_risk_reservations` table:**
```sql
CREATE TABLE aggregate_risk_reservations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id      TEXT NOT NULL,
  wallet_id     UUID NOT NULL REFERENCES wallets(id),
  pair_id       UUID NOT NULL REFERENCES pairs(id),
  occurrence_id UUID REFERENCES schedule_occurrences(id),
  amount_usd    NUMERIC(18,2) NOT NULL,
  gas_usd       NUMERIC(18,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'RESERVED',
                  -- RESERVED | CONSUMED | RELEASED | EXPIRED | REJECTED
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at   TIMESTAMPTZ,
  released_at   TIMESTAMPTZ
);
```

**Indexes:**
- `aggregate_risk_reservations_status_expires_idx` — `(status, expires_at)` — for expiry scan on restart
- `aggregate_risk_reservations_wallet_pair_idx` — `(wallet_id, pair_id)` — for lookup

**Status lifecycle:**
```
RESERVED ──→ CONSUMED  (tx submitted, amountUsd+gasUsd deducted from pending)
       └──→ RELEASED (error/timeout before submit, capacity restored)
       └──→ EXPIRED  (TTL exceeded, capacity restored)
       └──→ REJECTED (cap check failed, no capacity consumed)
```

### API Functions (`aggregate-risk-reservations.ts`)

```typescript
interface ReserveAggregateRiskInput {
  traceId: string;
  walletId: string;
  pairId: string;
  occurrenceId?: string | null;
  amountUsd: number;
  gasUsd: number;
}

/**
 * Atomically: check cap (including all RESERVED pending reservations) → write RESERVED row.
 * Returns reservation record or throws if cap exceeded.
 */
reserveAggregateRisk(db, input): Promise<AggregateRiskReservation>

/**
 * Mark reservation CONSUMED when tx submitted.
 */
consumeRiskReservation(db, reservationId): Promise<void>

/**
 * Mark reservation RELEASED (error/timeout before submit, capacity restored).
 */
releaseRiskReservation(db, reservationId, reason?: string): Promise<void>

/**
 * Called on scheduler startup: find all RESERVED rows past expires_at → EXPIRED.
 * Returns count of expired reservations.
 */
expireStaleRiskReservations(db, staleThresholdMs?: number): Promise<number>

/**
 * Get active reservations for a wallet (used in cap check).
 */
getActiveRiskReservations(db, walletId): Promise<AggregateRiskReservation[]>
```

### Cap Check Integration

`checkAggregateRisk()` is updated to include RESERVED reservation amounts:
```typescript
// Before: pendingUsd was derived from transactions in SUBMITTED state
// After:  pendingUsd = sum of RESERVED reservation amounts + submitted tx amounts
```

---

## 3. Atomic Wallet/Nonce Locks

### Purpose

Extend `pendingWalletLocks` with a richer lifecycle, additional context fields, and atomic state transitions using DB transactions.

### Status Enum Extension

**New status values added to `pending_wallet_lock_status`:**
```sql
ALTER TYPE pending_wallet_lock_status ADD VALUE 'RESERVED';
ALTER TYPE pending_wallet_lock_status ADD VALUE 'SIGNING';
ALTER TYPE pending_wallet_lock_status ADD VALUE 'CONFIRMED_PENDING_FINALITY';
ALTER TYPE pending_wallet_lock_status ADD VALUE 'STUCK';
ALTER TYPE pending_wallet_lock_status ADD VALUE 'DROPPED';
```

**Full lifecycle:**
```
RESERVED ──→ SIGNING ──→ SUBMITTED ──→ CONFIRMED_PENDING_FINALITY ──→ FINALIZED
                                          ↕ STUCK ↙ DROPPED ↙
                                                         ↘ RELEASED
```

### New Columns

```sql
ALTER TABLE pending_wallet_locks ADD COLUMN occurrence_id UUID REFERENCES schedule_occurrences(id);
ALTER TABLE pending_wallet_locks ADD COLUMN trace_id TEXT;
ALTER TABLE pending_wallet_locks ADD COLUMN risk_reservation_id UUID REFERENCES aggregate_risk_reservations(id);
```

### API Functions (`wallet-lock-atomic.ts`)

```typescript
/**
 * Full atomic lock acquisition with state transition.
 * Uses DB transaction with SELECT FOR UPDATE to serialize concurrent lock attempts.
 * 
 * Transitions: (no lock) → RESERVED → SIGNING → SUBMITTED
 */
acquireWalletLockAtomic(db, {
  walletId,
  requestId,
  occurrenceId?,
  traceId?,
  riskReservationId?,
  nonce?,
  lockReason,
  finalityRequired,
  lockTtlMs?,
}): Promise<WalletLock>

/**
 * Generic state transition with row-locking.
 * Validates current state before transitioning.
 */
transitionWalletLock(db, {
  lockId,
  walletId,
  fromStates,
  toState,
}): Promise<WalletLock>

/**
 * Release lock after finality confirmed.
 */
releaseWalletLockAfterFinality(db, walletId, txHash): Promise<void>

/**
 * Force release with operator approval.
 */
forceReleaseWithOperatorApproval(db, walletId, lockId, reason, operatorId?, notes?): Promise<void>

/**
 * Check wallet is not quarantined before lock acquisition.
 */
checkWalletNotQuarantined(db, walletId): Promise<{ blocked: boolean; reason?: string }>
```

### Lock State Machine

| From State | Allowed Transitions |
|---|---|
| (none) | → RESERVED |
| RESERVED | → SIGNING, RELEASED, EXPIRED |
| SIGNING | → SUBMITTED, RELEASED, EXPIRED |
| SUBMITTED | → CONFIRMED_PENDING_FINALITY, STUCK, RELEASED |
| CONFIRMED_PENDING_FINALITY | → FINALIZED, STUCK, DROPPED |
| STUCK | → RELEASED (operator review) |
| DROPPED | → RELEASED (operator review) |
| FINALIZED | → (terminal) |
| RELEASED | → (terminal) |
| EXPIRED | → (terminal, auto on TTL) |

---

## 4. Pre-Sign Gate

### Purpose

Before any signing (future canary path), a structured sequence of gates must all pass. The gate module is wired in the trade worker for `LIVE_CANARY` mode. `DRY_RUN` and `LIVE` modes are unaffected.

### Module Location

`apps/api/src/scheduler/scheduler-gate.ts`

### Main Function

```typescript
interface PreSignGateResult {
  allowed: boolean;
  blockedReasons: BlockedReason[];
  blockedAt: Date;
  evaluatedAt: Date;
}

interface BlockedReason {
  gate: string;
  code: string;
  message: string;
}

export async function evaluatePreSignGates(
  occurrence: ScheduleOccurrence,
  db: DbClient,
): Promise<PreSignGateResult>
```

### Gate List (in evaluation order)

| # | Gate | Stub implementation | Notes |
|---|---|---|---|
| 1 | `readinessCheck` | Returns BLOCKED until readiness system wired | Readiness artifacts |
| 2 | `rbacReauthMfaCheck` | Returns BLOCKED until auth system wired | RBAC + re-auth + MFA proof |
| 3 | `signerPolicyCheck` | Returns BLOCKED until signer policy wired | Per-wallet signer rules |
| 4 | `verifiedRegistryCheck` | Returns BLOCKED until registry wired | Token/pair/router verification |
| 5 | `aggregateRiskReservationCheck` | Calls `reserveAggregateRisk()` | Reserve, don't consume yet |
| 6 | `nonceReservationCheck` | Calls `NonceReservationService.reserveNonceForWallet()` | Nonce lock |
| 7 | `quoteValidationCheck` | Returns BLOCKED (stub) | Quote must be fresh and valid |
| 8 | `simulationCheck` | Returns BLOCKED (stub) | Simulation must pass |
| 9 | `emergencyPauseCheck` | Calls `assertGlobalEmergencyNotPaused()` | Already exists |

Each gate returns `{ passed: true }` or `{ passed: false, code, message }`.

If any gate fails, `allowed = false` and the occurrence is marked `LIVE_BLOCKED` with the first failing gate's code/message.

### Worker Integration (`trade.worker.ts`)

For `mode === "LIVE_CANARY"`:
```typescript
// Before signing section:
const gateResult = await evaluatePreSignGates(occurrence, db);
if (!gateResult.allowed) {
  await markLiveBlocked(db, occurrence.id, gateResult.blockedReasons[0].code, 
    gateResult.blockedReasons.map(r => r.message).join("; "));
  return { status: "LIVE_BLOCKED", blockedReasons: gateResult.blockedReasons };
}
// Proceed to signing (future canary path)
```

For `mode === "LIVE"`:
- Unchanged — throws error immediately (live scheduler not implemented)

For `mode === "DRY_RUN"`:
- Unchanged — executes dry-run simulation (current behavior)

---

## 5. Restart Safety

### Reconciler Functions (called on `scheduler.start()`)

**`reconcileStaleOccurrences()`** — existing, correct behavior. Only touches `DRY_RUN` mode.

**`expireStaleRiskReservations()`** — new. Finds all `RESERVED` rows where `expires_at < now()` and transitions to `EXPIRED`. Called before any new work is scheduled.

```typescript
// Called in scheduler.start() before runSchedulerTick():
const expiredRiskCount = await expireStaleRiskReservations(this.db);
const expiredNonceCount = await expireStaleNonceReservations(this.db);
console.info(`[scheduler] expired ${expiredRiskCount} risk reservations, ${expiredNonceCount} nonce reservations`);
```

**Submitted wallet locks** — `SUBMITTED`/`CONFIRMED_PENDING_FINALITY` locks are never touched by reconciliation. They persist until:
- Finality confirmation → `FINALIZED`
- Operator review → `RELEASED` / `STUCK` / `DROPPED`

**Quarantined wallets** — Already handled via `canScheduleWallet()` which checks `wallet.status === "QUARANTINED"` and `wallet.nonceStatus === "QUARANTINED"`. Skipped at scheduler tick level.

---

## 6. DLQ Integration

### Changes

**Add to `RecordDeadLetterJobParams`:**
```typescript
riskReservationId?: string | null;
nonceReservationId?: string | null;
```

**In `deadLetterJobs` insert:** add these two fields to the values object.

### Replay Policy (existing, confirmed correct)

`replayDeadLetterJob()` in `dlq.service.ts` already enforces:
```typescript
if (job.jobType !== "DRY_RUN") {
  return { success: false, message: `Cannot replay ${job.jobType} jobs. Only DRY_RUN jobs are allowed for replay.` };
}
```

`LIVE` and `LIVE_CANARY` job types are never replayable. This is unchanged.

---

## 7. API Routes

### New Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/api/occurrences` | GET | List occurrences (filter: walletId, scheduleId, status, mode, dateRange) |
| `/api/occurrences/:id` | GET | Occurrence detail with riskReservationId, nonceReservationId |
| `/api/risk-reservations` | GET | List risk reservations (filter: status, walletId) |
| `/api/risk-reservations/:id` | GET | Risk reservation detail |
| `/api/wallet-locks` | GET | List active wallet locks with full state |

All return standard JSON envelope `{ data, meta }`. Uses existing auth middleware.

---

## 8. File Inventory

### New Files

| File | Purpose |
|------|---------|
| `apps/api/src/scheduler/scheduler-gate.ts` | Pre-sign gate evaluation |
| `apps/api/src/scheduler/aggregate-risk-reservations.ts` | Risk reservation ledger service |
| `apps/api/src/scheduler/wallet-lock-atomic.ts` | Atomic wallet lock state machine |
| `apps/api/src/risk/risk-reservation-routes.ts` | Risk reservation API routes |
| `apps/api/src/scheduler/occurrence-routes.ts` | Occurrence ledger API routes |

### Modified Files

| File | Changes |
|------|---------|
| `apps/api/src/db/schema.ts` | New table `aggregate_risk_reservations`, new columns on `schedule_occurrences` and `pending_wallet_locks`, enum extension |
| `apps/api/src/scheduler/occurrence.service.ts` | New functions, `LIVE_CANARY` status handling |
| `apps/api/src/scheduler/trade.worker.ts` | Pre-sign gate call for `LIVE_CANARY` mode |
| `apps/api/src/scheduler/scheduler-service.ts` | Startup expiry calls |
| `apps/api/src/scheduler/dlq.service.ts` | Add risk/nonce reservation IDs to DLQ record |
| `apps/api/src/risk/aggregate-risk.ts` | Updated cap check to include RESERVED reservations |

### Test Files

| File | Coverage |
|------|---------|
| `apps/api/src/scheduler/occurrence.service.test.ts` | Duplicate tick, concurrent reservation cap |
| `apps/api/src/scheduler/aggregate-risk-reservations.test.ts` | Reserve/consume/expire/release lifecycle |
| `apps/api/src/scheduler/scheduler-gate.test.ts` | All gates stub-pass, first gate blocks, LIVE blocked, LIVE_CANARY blocked |
| `apps/api/src/scheduler/wallet-lock-atomic.test.ts` | Atomic state transitions |
| `apps/api/src/scheduler/scheduler-restart.test.ts` | No duplicate occurrence on restart |
| `apps/api/src/scheduler/dlq.service.test.ts` | LIVE/LIVE_CANARY not auto-replayed |

---

## 9. Validation

```bash
pnpm typecheck    # No TypeScript errors
pnpm lint         # No ESLint errors
pnpm test         # All tests pass
```

Targeted test runs:
```bash
pnpm test -- --testPathPattern="occurrence|aggregate-risk|scheduler-gate|wallet-lock-atomic|dlq"
```

---

## 10. Rollback

- If the migration is problematic: `DROP TABLE aggregate_risk_reservations;` — no foreign key cascades, clean removal.
- Schema columns are backward-compatible with existing application code.
- Live scheduler remains blocked regardless of any errors in the new substrate.

---

## 11. Out of Scope (Future Phases)

- Actual LIVE execution (signing real transactions)
- LIVE_CANARY gate implementations (stubs only, return BLOCKED)
- UI pages (API routes only in this phase)
- Rate limiting or circuit breaker changes
- External signer integration