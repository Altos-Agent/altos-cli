# Nonce Reservation and Recovery

## Overview

Every live write transaction (execute-once, approve, revoke) must reserve a nonce before signing. This prevents concurrent transactions from the same wallet and enables accurate nonce tracking for stuck/dropped tx detection.

## Core Principle

> A wallet with an ACTIVE pending_wallet_locks entry cannot submit another live transaction until the lock is reviewed by an operator.

## NonceReservationService

Located at `apps/api/src/nonce/nonce-reservation.ts`.

### Key Methods

- `reserveNonceForWallet(walletId, chainId, reason, finalityRequired?)` — Atomically reserves a nonce using DB transaction with `SELECT ... FOR UPDATE` and RPC. Creates a `pending_wallet_locks` entry with status ACTIVE.
- `attachSubmittedTx(walletId, reservationId, txHash)` — Updates the lock with the submitted tx hash after signing.
- `reconcileWalletNonce(walletId, chainId)` — Polls RPC to detect nonce gaps, stuck txs, and dropped txs. Returns `{ state, latestNonce, pendingNonce, stuckTxHashes, droppedTxHashes }`.
- `releaseWalletLockAfterFinality(walletId, txHash)` — Called when the confirmation worker detects a tx is finalized. Sets lock to FINALIZED but does NOT auto-release.
- `forceReleaseWithOperatorApproval(walletId, reservationId, reason, operatorId?, notes?)` — Operator-reviewed release. Sets operatorReviewed=true.
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