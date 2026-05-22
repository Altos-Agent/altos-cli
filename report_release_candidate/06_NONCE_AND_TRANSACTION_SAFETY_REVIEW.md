# 06 — Nonce and Transaction Safety Review

**Date:** 2026-05-21

---

## Nonce Reservation

### Status: ✅ IMPLEMENTED for On-Demand Trades

Reserve → use → release flow exists in `nonce-reservation.ts`:
1. `reserveNonceForWallet(walletId)` — gets next nonce, creates `pendingWalletLocks` entry
2. `useWalletLock(lockId)` — marks lock FINALIZED
3. `releaseWalletLockAfterFinality(lockId, txHash)` — releases lock, updates wallet nonce

### Gaps for Scheduled Trades

- **Scheduled dry-runs do NOT use nonce reservation** — they rely on the scheduler's serial processing
- Two concurrent dry-runs for same wallet could theoretically collide if workers pick up jobs before completion
- Nonce status check in `canScheduleWallet` reads from `wallets.nonceStatus` but doesn't call `reserveNonce`

---

## Nonce Status States

### Status: ✅ IMPLEMENTED

| State | Behavior |
|-------|----------|
| `CLEAN` | Normal operation |
| `UNCERTAIN` | Soft block — requires operator review |
| `QUARANTINED` | Hard block — no scheduling or signing |

---

## Transaction State Machine

### Status: ✅ COMPLETE — 11 States

| State | Description |
|-------|-------------|
| `PLANNED` | Initial |
| `SUBMITTED` | On-chain, pending confirmation |
| `CONFIRMED_PENDING_FINALITY` | Received, awaiting finality |
| `CONFIRMED` | Finalized |
| `FAILED` | Execution failed (retryable) |
| `DROPPED` | Evicted from mempool |
| `STUCK` | Submitted but not confirming |
| `REJECTED` | Simulation or risk rejected |
| `CANCELLED` | Operator cancelled |
| `DLQ` | Dead letter queue |
| `EXPIRED` | Quote timeout |

---

## DB Schema Fields for Nonce/Transaction Safety

### Status: ✅ PRESENT

| Field | Table | Purpose |
|-------|-------|---------|
| `nonce` | `wallets` | Current confirmed nonce |
| `nonceStatus` | `wallets` | CLEAN/UNCERTAIN/QUARANTINED |
| `nonce` | `pendingWalletLocks` | Reserved nonce per lock |
| `status` | `pendingWalletLocks` | ACTIVE/FINALIZED/EXPIRED/RELEASED/REPLACED |

### Gap: Nonce Update Not Atomic with Lock Release

`releaseWalletLockAfterFinality` updates wallet nonce, then lock status — two separate operations. If the second fails after the first succeeds, nonce state could desynchronize. Should use a single DB transaction.

---

## Missing: Atomic Nonce Release Transaction

### Status: ❌ NOT IMPLEMENTED

No transaction wrapping the two-step update. This is a potential source of nonce inconsistency after failures.

---

## Trace ID on Transactions

### Status: ✅ IMPLEMENTED

`transactions.traceId` column with dedicated index `transactions_trace_id_idx`. Trace ID stored on all transaction records for correlation.

---

## Hard Blockers in This Area

| # | Blocker | Fix Required |
|---|---------|-------------|
| H1 | Nonce reservation not integrated into scheduler | Add `reserveNonce` call in scheduler worker path |
| H2 | Nonce update + lock release not atomic | Wrap in single DB transaction |