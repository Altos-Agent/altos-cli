# Schedule Occurrence Idempotency

## Overview

The schedule occurrence model ensures that every scheduled execution has a unique, traceable record that is safe under restarts, retries, and concurrent scheduler ticks. This is critical for multi-wallet automation where the same schedule can trigger multiple times due to timing jitter, scheduler restarts, or network issues.

## Key Guarantees

1. **Every scheduled execution has exactly one occurrence record** — no duplicates under concurrent/restart scenarios.
2. **Occurrence identity is deterministic** — derived from schedule + wallet + pair + mode + time bucket.
3. **Live scheduler remains disabled** — all occurrences are created in `DRY_RUN` mode; `LIVE` mode occurrences are immediately blocked.
4. **Restart-safe** — stale occurrences are reconciled on scheduler startup without creating duplicates.

## Data Model

### `schedule_occurrences` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key |
| `schedule_id` | `uuid` | FK to `wallet_schedules` |
| `wallet_id` | `uuid` | FK to `wallets` |
| `pair_id` | `uuid` | FK to `pairs` |
| `strategy_profile_id` | `uuid` | Optional strategy profile |
| `mode` | `DRY_RUN \| LIVE` | Execution mode |
| `scheduled_for` | `timestamp` | When execution was scheduled |
| `occurrence_key` | `text` | Unique identity key (deterministic) |
| `idempotency_key` | `text` | Per-tick idempotency key |
| `status` | `PLANNED \| QUEUED \| RUNNING \| DRY_RUN_ACCEPTED \| DRY_RUN_REJECTED \| LIVE_BLOCKED \| FAILED \| CANCELLED \| DLQ` | Current status |
| `request_id` | `uuid` | HTTP request context |
| `trace_id` | `text` | Distributed trace ID |
| `quote_hash` | `text` | Quote hash for dry-run |
| `simulation_hash` | `text` | Simulation hash |
| `transaction_id` | `uuid` | FK to `transactions` (back-link) |
| `job_id` | `text` | BullMQ job ID |
| `attempt_count` | `integer` | Number of execution attempts |
| `last_error_code` | `text` | Last error code |
| `last_error_message` | `text` | Last error message |
| `created_at` | `timestamp` | Record creation |
| `updated_at` | `timestamp` | Last update |

### Indexes

- `occurrence_key` — unique — prevents duplicate occurrences
- `idempotency_key` — unique — per-tick deduplication
- `schedule_id` — lookup by schedule
- `wallet_id` — lookup by wallet
- `status` — filter by status

## Occurrence Key Generation

```
occurrence_key = occ_{scheduleId}_{walletId}_{pairId}_{mode}_{minute_bucket}
```

The `minute_bucket` rounds the timestamp to the nearest minute, ensuring that ticks within the same minute produce the same key. This means:
- If the scheduler fires at 12:30:15 and 12:30:45, both produce the same `occurrence_key`
- A tick at 12:31:00 produces a different key

## Idempotency Flow

### Scheduler Tick (Enqueue)

```
1. Scheduler evaluates schedule → pair → wallet
2. createOrGetOccurrence(scheduleId, walletId, pairId, mode, scheduledFor)
   └── Creates occurrence with status=PLANNED if not exists
   └── Returns existing occurrence if already exists
3. If occurrence.status not in (PLANNED, QUEUED, RUNNING) → skip (already processed)
4. Create BullMQ job with jobId = "occ-{occurrenceId}"
5. Mark occurrence status = QUEUED, jobId = "occ-{occurrenceId}"
6. Enqueue job
```

### Worker Execution

```
1. Receive job with { occurrenceId, traceId, idempotencyKey }
2. Mark occurrence status = RUNNING (increment attemptCount)
3. Execute dry-run simulation
4. Create transaction (linked via occurrenceId FK)
5. Update occurrence: status = DRY_RUN_ACCEPTED | DRY_RUN_REJECTED, transactionId
6. On error: markFailed or markDlq
```

## Status Transitions

```
PLANNED
  └── QUEUED        (scheduler enqueues job)
  └── CANCELLED     (explicit cancellation)

QUEUED
  └── RUNNING       (worker picks up job)
  └── FAILED        (reconciliation: stuck too long)
  └── CANCELLED     (explicit cancellation)

RUNNING
  ├── DRY_RUN_ACCEPTED   (dry-run succeeded)
  ├── DRY_RUN_REJECTED   (dry-run rejected by risk)
  ├── LIVE_BLOCKED       (live mode attempted — blocked)
  ├── FAILED             (non-retryable error)
  └── DLQ               (max retries exceeded)

DRY_RUN_ACCEPTED | DRY_RUN_REJECTED | LIVE_BLOCKED | FAILED | DLQ | CANCELLED
  └── (terminal states — no further transitions)
```

## Restart Reconciliation

On `scheduler.start()`, `reconcileStaleOccurrences()` is called:

1. Finds all `RUNNING` or `QUEUED` occurrences older than 30 minutes
2. Filters to `DRY_RUN` mode only (does NOT touch `LIVE`)
3. Transitions them to `FAILED` with `lastErrorCode = STALE_RECONCILE`

This ensures that:
- Scheduler crashes/restarts don't leave phantom in-flight occurrences
- Jobs that were running when the scheduler died are marked as failed
- Live mode occurrences are NEVER touched (safety invariant)

## Live Scheduler Safety

The live scheduler is disabled in this phase. When enabled in the future:

1. `LIVE` occurrences will be created but never transitioned to terminal states by the reconciliation logic
2. All live mode transitions must be explicitly gated behind a `LIVE_EXECUTION_ENABLED` flag
3. The occurrence model provides the audit trail for live executions

## Concurrency Safety

The occurrence service uses:

1. **Database unique constraints** on `occurrence_key` — guarantees uniqueness at DB level
2. **ON CONFLICT DO NOTHING** — handles race conditions where two scheduler ticks race to create the same occurrence
3. **Status-based guards** — transitions are only allowed from specific states, preventing stale transitions

## Transaction ↔ Occurrence Link

- `transactions.occurrence_id` — FK back to `schedule_occurrences` (nullable)
- `schedule_occurrences.transaction_id` — FK to `transactions` (nullable)

Both directions are maintained:
- When a scheduled dry-run creates a transaction, `occurrenceId` is set on the transaction
- When the transaction is created, `transactionId` is updated on the occurrence

This allows:
- `GET /api/transactions/:id` → returns transaction + linked occurrence
- `GET /api/wallets/:id/occurrences` → returns all occurrences for a wallet
- `GET /api/schedules/:id/occurrences` → returns all occurrences for a schedule

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/wallets/:id/occurrences` | Recent occurrences for a wallet |
| `GET /api/schedules/:id/occurrences` | Recent occurrences for a schedule |
| `GET /api/transactions/:id` | Transaction detail with linked occurrence |

## Idempotency Key vs Occurrence Key

- **Occurrence key** — identifies the *execution slot* (schedule+wallet+pair+mode+time). Two ticks in the same minute = same occurrence.
- **Idempotency key** — identifies the *tick attempt*. Used for debugging and correlation.

## Testing Strategy

Key scenarios tested:
- Duplicate scheduler tick does not create duplicate occurrence
- Same wallet/pair/scheduledFor creates one occurrence
- Concurrent `createOrGetOccurrence` is safe (one wins, other gets existing)
- Restart reconciles stale RUNNING/QUEUED dry-run occurrences
- Restart does NOT touch LIVE mode occurrences
- Occurrence links to dry-run transaction (bidirectional)
- Live mode occurrence is blocked and not signed
