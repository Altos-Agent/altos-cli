# Scheduler Restart Safety

## Overview

On scheduler startup, several reconciliation steps run before any new work is scheduled. These ensure:
- No duplicate occurrences from previous crashes
- Stale capacity claims are recovered
- Submitted transactions remain untouched

## Startup Sequence

On `scheduler.start()`:

1. **Acquire scheduler lock** — ensures single-owner loop
2. **Reconcile stale occurrences** — mark stuck DRY_RUN occurrences as FAILED
3. **Expire stale risk reservations** — recover capacity from crashed requests
4. **Enqueue due wallet schedules** — begin normal scheduling loop

## Reconcilers

### `reconcileStaleOccurrences()`

- Finds `RUNNING`/`QUEUED` DRY_RUN occurrences older than 30 minutes
- Marks them `FAILED` with `lastErrorCode = STALE_RECONCILE`
- **Does NOT touch LIVE or LIVE_CANARY** (safety invariant)

### `expireStaleRiskReservations()`

- Finds `RESERVED` rows past `expires_at`
- Transitions them to `EXPIRED`
- Capacity is restored to the aggregate cap pool

## Submitted Locks Preservation

`SUBMITTED` and `CONFIRMED_PENDING_FINALITY` wallet locks are **never touched** by any reconciliation. They persist until:
- Finality confirmation → `FINALIZED`
- Operator review → `RELEASED`, `STUCK`, or `DROPPED`

This ensures in-flight transactions are not accidentally orphaned.

## Quarantined Wallets

Quarantined wallets (`wallet.status = QUARANTINED` or `wallet.nonceStatus = QUARANTINED`) are skipped at the scheduler tick level via `canScheduleWallet()`. The scheduler never attempts to schedule work for a quarantined wallet.

## No Duplicates Invariant

The combination of:
- Unique `occurrence_key` index on `schedule_occurrences`
- `ON CONFLICT DO NOTHING` on insert
- Restart reconciliation marking stale DRY_RUN occurrences as FAILED

Ensures that **every execution slot has exactly one occurrence record**, regardless of how many times the scheduler restarts or how many concurrent ticks fire.