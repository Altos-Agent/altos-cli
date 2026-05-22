# Atomic Wallet/Nonce Locks

## Purpose

Serialized wallet access with a durable, full-lifecycle lock. Prevents race conditions where two concurrent requests try to use the same wallet nonce.

## Data Model

### `pending_wallet_locks` Table

Extended status enum: `ACTIVE`, `RESERVED`, `SIGNING`, `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, `FINALIZED`, `STUCK`, `DROPPED`, `EXPIRED`, `RELEASED`, `REPLACED`

New columns:
- `occurrence_id` — links lock to schedule occurrence
- `trace_id` — distributed trace ID
- `risk_reservation_id` — links lock to aggregate risk reservation

## State Machine

```
RESERVED ──→ SIGNING ──→ SUBMITTED ──→ CONFIRMED_PENDING_FINALITY ──→ FINALIZED
                                          ↕ STUCK ↙ DROPPED ↙
                                                         ↘ RELEASED
```

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

## Atomic Acquisition

`acquireWalletLockAtomic()` uses a DB transaction with `SELECT FOR UPDATE`:

1. **Quarantine check**: Wallet must not be `QUARANTINED`
2. **Existing lock check**: If ACTIVE lock exists and not expired → throw
3. **Insert or update**: Create new RESERVED lock or reuse expired one
4. **TTL**: Default 30 minutes

## Safety Properties

- **No nonce races**: `SELECT FOR UPDATE` serializes concurrent lock attempts
- **Quarantine gate**: Quarantined wallets cannot acquire locks
- **TTL recovery**: Expired locks are overwritten on next attempt
- **Operator release**: `STUCK`/`DROPPED` locks require operator review to release

## API Functions

- `acquireWalletLockAtomic(db, input)` — acquire a wallet lock atomically
- `transitionWalletLock(db, input)` — validated state transition
- `checkWalletNotQuarantined(db, walletId)` — safety check before lock