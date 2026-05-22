# Aggregate Risk Reservations

## Purpose

The risk reservation ledger prevents two concurrent requests from both passing aggregate risk caps before either writes a submitted transaction. Before this ledger, `checkAggregateRisk()` only read stats — two concurrent requests could both pass the cap check before either submitted.

The reserve-at-check pattern makes capacity claims explicit and durable.

## Data Model

### `aggregate_risk_reservations` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key |
| `trace_id` | `text` | Trace ID for correlation |
| `wallet_id` | `uuid` | FK to wallets |
| `pair_id` | `uuid` | FK to pairs |
| `occurrence_id` | `uuid` | FK to schedule_occurrences (optional) |
| `amount_usd` | `numeric(18,2)` | Reserved trade amount in USD |
| `gas_usd` | `numeric(18,2)` | Reserved gas amount in USD |
| `status` | `RESERVED \| CONSUMED \| RELEASED \| EXPIRED \| REJECTED` | Current status |
| `expires_at` | `timestamp` | When reservation expires (TTL = 5 min) |
| `created_at` | `timestamp` | Record creation |
| `consumed_at` | `timestamp` | When tx was submitted |
| `released_at` | `timestamp` | When reservation was released |

### Status Lifecycle

```
RESERVED ──→ CONSUMED  (tx submitted, capacity consumed)
       └──→ RELEASED (error/timeout before submit, capacity restored)
       └──→ EXPIRED  (TTL exceeded, capacity restored)
       └──→ REJECTED (cap check failed at reservation time)
```

## Reserve-at-Check Pattern

`reserveAggregateRisk()` is called during pre-sign gate evaluation:

1. **Read current reservations**: Query all `RESERVED` rows (not yet submitted)
2. **Check cap**: `pendingAmountUsd + proposedAmountUsd <= maxPendingTradeUsd`
3. **Write reservation**: If cap allows, insert a `RESERVED` row
4. **On tx submit**: Reservation transitions `RESERVED → CONSUMED`
5. **On error/timeout**: Reservation transitions `RESERVED → RELEASED`
6. **On TTL expiry**: Background scan on startup transitions `RESERVED → EXPIRED`

## Cap Check

The aggregate risk cap check now includes `RESERVED` reservation amounts:

```
pendingUsd = sum(RESERVED.amountUsd) + sum(SUBMITTED tx amountUsd)
```

This prevents double-capacitation: a reservation holds capacity until it's consumed or released.

## Restart Expiry

`expireStaleRiskReservations()` is called on scheduler startup:

1. Finds all `RESERVED` rows where `expires_at < now()`
2. Transitions them to `EXPIRED`
3. Logs count of expired reservations

This recovers capacity from crashed/stalled requests.

## API Functions

- `reserveAggregateRisk(db, input)` — atomically reserve capacity; throws if cap exceeded
- `releaseRiskReservation(db, id)` — release reservation (capacity restored)
- `consumeRiskReservation(db, id)` — mark reservation consumed (tx submitted)
- `expireStaleRiskReservations(db, thresholdMs)` — expire stale reservations on startup
- `getActiveRiskReservations(db, walletId?)` — list active reservations