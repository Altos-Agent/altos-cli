# Schedule Occurrence Ledger

## Overview

Every scheduled execution has exactly one durable occurrence record. The ledger ensures:
- **Idempotency**: duplicate scheduler ticks produce the same occurrence, not duplicates
- **Traceability**: every execution is linked to its schedule, wallet, pair, and mode
- **Restart safety**: stale occurrences are reconciled without duplication
- **Live safety**: LIVE and LIVE_CANARY occurrences are never touched by restart reconciliation

## Data Model

### `schedule_occurrences` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key |
| `schedule_id` | `uuid` | FK to `wallet_schedules` |
| `wallet_id` | `uuid` | FK to `wallets` |
| `pair_id` | `uuid` | FK to `pairs` |
| `strategy_profile_id` | `uuid` | Optional strategy profile |
| `mode` | `DRY_RUN \| LIVE \| LIVE_CANARY` | Execution mode |
| `scheduled_for` | `timestamp` | When execution was scheduled |
| `occurrence_key` | `text` | Unique identity key (deterministic) |
| `idempotency_key` | `text` | Per-tick idempotency key |
| `status` | See below | Current status |
| `request_id` | `uuid` | HTTP request context |
| `trace_id` | `text` | Distributed trace ID |
| `quote_hash` | `text` | Quote hash |
| `simulation_hash` | `text` | Simulation hash |
| `transaction_id` | `uuid` | FK to `transactions` (back-link) |
| `job_id` | `text` | BullMQ job ID |
| `attempt_count` | `integer` | Number of execution attempts |
| `risk_reservation_id` | `uuid` | Link to aggregate risk reservation |
| `nonce_reservation_id` | `uuid` | Link to wallet nonce lock |
| `last_error_code` | `text` | Last error code |
| `last_error_message` | `text` | Last error message |
| `created_at` | `timestamp` | Record creation |
| `updated_at` | `timestamp` | Last update |

### Indexes

- `occurrence_key` — unique — prevents duplicate occurrences
- `idempotency_key` — unique — per-tick deduplication
- `schedule_id`, `wallet_id`, `status` — lookup indexes

## Mode Semantics

| Mode | Scheduler behavior | Restart reconciled | Can sign |
|------|-------------------|---------------------|----------|
| `DRY_RUN` | Execute dry-run only | Yes (→ FAILED if stale) | Never |
| `LIVE` | BLOCKED immediately | No | Never |
| `LIVE_CANARY` | Evaluate pre-sign gates | No | Only if all gates pass |

## Status Transitions

```
PLANNED
  └── QUEUED        (scheduler enqueues job)
  └── CANCELLED     (explicit cancellation)

QUEUED
  └── RUNNING       (worker picks up job)
  └── FAILED        (reconciliation: stuck too long)

RUNNING
  ├── DRY_RUN_ACCEPTED   (dry-run succeeded)
  ├── DRY_RUN_REJECTED   (dry-run rejected by risk)
  ├── LIVE_BLOCKED       (live mode attempted — blocked)
  ├── FAILED             (non-retryable error)
  └── DLQ               (max retries exceeded)

DRY_RUN_ACCEPTED | DRY_RUN_REJECTED | LIVE_BLOCKED | FAILED | DLQ | CANCELLED
  └── (terminal states)
```

## Occurrence Key Generation

```
occurrence_key = occ_{scheduleId}_{walletId}_{pairId}_{mode}_{minute_bucket}
```

The `minute_bucket` rounds the timestamp to the nearest minute, ensuring ticks within the same minute produce the same key.

## Restart Reconciliation

`reconcileStaleOccurrences()` is called on scheduler startup:

1. Finds all `RUNNING` or `QUEUED` occurrences older than 30 minutes
2. Filters to `DRY_RUN` mode only — **LIVE and LIVE_CANARY are NEVER touched**
3. Transitions them to `FAILED` with `lastErrorCode = STALE_RECONCILE`

This ensures scheduler crashes/restarts don't leave phantom in-flight occurrences.