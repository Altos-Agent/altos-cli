# Nonce Reservation and Recovery — Design

## Status

Draft — pending user review before implementation.

---

## 1. Problem Statement

The current system can send live transactions but has no protection against:
1. **Concurrent unsafe writes** — two simultaneous live executions for the same wallet
2. **Nonce collisions** — nonce not tracked, so replacement/cancel txs are impossible
3. **Stuck/dropped detection** — no RPC-based reconciliation to detect failed txs
4. **Quarantine** — no mechanism to pause a wallet from scheduler when tx is in bad state

---

## 2. Schema Changes

### 2.1 `wallets` table

Add:
- `nonce` (integer, nullable) — last known on-chain nonce
- `nonceStatus` (walletNonceStatusEnum: "CLEAN" | "UNCERTAIN" | "QUARANTINED") — default "CLEAN"
- `quarantineReason` (text, nullable) — why wallet was quarantined
- `quarantinedAt` (timestamp, nullable) — when quarantine began

### 2.2 `pending_wallet_locks` table

Drop primary key on `walletId` alone; add `id` as primary key. Add:
- `id` (uuid) — primary key
- `nonce` (integer, not null) — reserved nonce
- `txHash` (text, nullable) — submitted transaction hash
- `lockReason` (text, not null) — "LIVE_EXECUTE_ONCE" | "LIVE_APPROVE" | "LIVE_REVOKE" | "SCHEDULER_TRADE"
- `finalityRequired` (boolean, not null, default false) — if true, wait for RPC finality before releasing
- `replacedByTxHash` (text, nullable) — if this tx was replaced
- `operatorReviewed` (boolean, not null, default false) — has an operator explicitly reviewed this lock
- `operatorReviewedAt` (timestamp, nullable)
- `operatorReviewedBy` (text, nullable)
- `recoveryNotes` (text, nullable) — operator notes on recovery action
- `status` becomes: "ACTIVE" | "FINALIZED" | "EXPIRED" | "RELEASED" | "REPLACED"

### 2.3 `transactions` table

Add:
- `replacementTxHash` (text, nullable) — if this tx was replaced by another
- `recoveryStatus` (transactionRecoveryStatusEnum: nullable) — "STUCK" | "DROPPED" | "RECOVERED" | "CANCELLED"
- `recoveryNotes` (text, nullable) — human notes on recovery
- `nonce` (integer, nullable) — already exists but ensure it's populated
- `fromAddress` (text, nullable) — already exists but ensure it's populated
- `toAddress` (text, nullable) — already exists but ensure it's populated
- `calldataHash` (text, nullable) — already exists but ensure it's populated

---

## 3. NonceReservationService

A singleton class that manages all nonce state for wallets.

### 3.1 Core Methods

```
reserveNonceForWallet(walletId, chainId, reason, finalityRequired?)
  → { reservationId, nonce }
  Uses DB transaction with FOR UPDATE lock on wallet row
  Prevents concurrent reservation for same wallet
  Creates pending_wallet_locks row

attachSubmittedTx(walletId, reservationId, txHash)
  → void
  Updates pending_wallet_locks.txHash
  Updates transactions table with nonce, fromAddress, toAddress, calldataHash

reconcileWalletNonce(walletId, chainId)
  → { latestNonce, pendingCount, state: "CLEAN" | "UNCERTAIN" | "QUARANTINED" }
  Calls RPC getTransactionCount (pending + sent)
  Compares with stored nonce and pending lock nonces
  If uncertain → marks wallet as UNCERTAIN
  If stuck/dropped detected → marks wallet as QUARANTINED, emits alert

releaseWalletLockAfterFinality(walletId, txHash)
  → void
  Called when RPC confirms finality
  Updates pending_wallet_locks status to FINALIZED
  Updates wallet nonce to tx nonce
  Does NOT auto-unlock — operator reviews first

forceReleaseWithOperatorApproval(walletId, reservationId, reason, operatorNotes?)
  → void
  Only callable via API with operator auth
  Validates reservationId matches wallet
  Sets pending_wallet_locks.status = RELEASED
  Sets operatorReviewed = true, operatorReviewedAt, operatorReviewedBy, recoveryNotes
  Does NOT reset wallet nonce — operator decides next nonce
  Emits alert

forcePauseWallet(walletId, reason)
  → void
  Sets wallet status to QUARANTINED (new status)
  Sets quarantineReason, quarantinedAt

canWalletSubmit(walletId)
  → { canSubmit: boolean, reason?: string }
  Checks: no ACTIVE pending_wallet_locks, wallet not quarantined, wallet not paused

getWalletLockState(walletId)
  → { hasActiveLock, lockReason?, nonce?, txHash?, age?, finalityRequired? }
```

### 3.2 Concurrency Safety

- All reserveNonce operations use `SELECT ... FOR UPDATE` on the wallet row
- DB-level serialization prevents two processes from getting the same nonce
- `pg_advisory_xact_lock` on wallet ID as fallback lock mechanism

### 3.3 RPC Reconciliation (runs periodically or on-demand)

1. Call `eth_getTransactionCount(walletAddress, "pending")` → pendingNonce
2. Call `eth_getTransactionCount(walletAddress, "latest")` → latestNonce
3. Get all `pending_wallet_locks` for wallet with status ACTIVE
4. Get all submitted transactions not yet finalized
5. If pendingNonce > latestNonce + pending locks → **potential dropped tx**
6. If latestNonce > stored nonce + submitted txs → **nonce gap (possible dropped)**
7. If any tx hash not found on RPC for 5+ blocks → **stuck**
8. If any tx status = 0 (failed) → **failed tx**

### 3.4 State Machine for Wallet Nonce

```
CLEAN → (reconcile finds discrepancy) → UNCERTAIN
UNCERTAIN → (operator reviews or timeout) → QUARANTINED or CLEAN
QUARANTINED → (operator force release) → CLEAN (with new nonce)
QUARANTINED → (operator keeps paused) → PAUSED
```

---

## 4. Live Execution Integration

### 4.1 Execute-Once Flow (modified)

```
1. canWalletSubmit(walletId) → error if locked
2. reserveNonceForWallet(walletId, chainId, "LIVE_EXECUTE_ONCE", finalityRequired=true)
   → returns nonce reservationId and nonce
3. Build tx with nonce
4. Sign tx
5. Send tx → get txHash
6. attachSubmittedTx(walletId, reservationId, txHash)
   → updates DB with nonce, from, to, calldataHash
7. storeTransaction() → stores tx with nonce, fromAddress, toAddress, calldataHash
8. Monitor for finality via confirmation worker
9. releaseWalletLockAfterFinality(walletId, txHash) when RPC confirms finality
   → sets lock to FINALIZED, but lock stays visible until operator reviews
10. Operator reviews → forceReleaseWithOperatorApproval() clears the lock
```

**Critical: Lock is NOT automatically released after finality. Operator reviews first.**

### 4.2 Approval/Revoke Flow (same pattern)

- Same reserveNonce → attachSubmittedTx → releaseAfterFinality flow
- lockReason = "LIVE_APPROVE" or "LIVE_REVOKE"

---

## 5. Reconciliation Worker

A background job that runs on interval (configurable, default 60s):

```
For each wallet with ACTIVE pending lock:
  reconcileWalletNonce(walletId, chainId)

  Cases:
  - pendingNonce == stored nonce + 1 → CLEAN, no action
  - pendingNonce > stored nonce + 1 → possible dropped, emit alert, mark UNCERTAIN
  - pendingNonce == 0 and no recent tx → wallet might be out of sync, mark UNCERTAIN
  - tx hash not found after 12+ blocks → STUCK, pause wallet
  - tx status = 0 (reverted) → FAILED, pause wallet

  If wallet status changes to QUARANTINED:
    emit alert (Telegram/webhook): wallet quarantined due to stuck/dropped tx
    mark all active locks as EXPIRED
```

---

## 6. Alerts

Events that trigger alerts (Telegram/webhook):
1. `WALLET_QUARANTINED` — wallet paused due to stuck/dropped tx
2. `DROPPED_TX_DETECTED` — nonce gap suggests dropped transaction
3. `NONCE_MISMATCH` — RPC nonce doesn't match stored nonce
4. `OPERATOR_FORCE_RELEASE` — operator manually released a lock
5. `STUCK_TX_DETECTED` — tx not found on RPC after 12+ blocks

---

## 7. Recovery UI

Added to the web dashboard under a new `/admin/recovery` section:

### 7.1 Wallet Nonce State Panel

Shows for each wallet:
- Current wallet status (ACTIVE / PAUSED / QUARANTINED)
- Stored nonce vs RPC latest nonce vs RPC pending nonce
- Active lock info (nonce, txHash, age, finalityRequired)
- If quarantined: quarantine reason and timestamp

### 7.2 Stuck/Dropped Transaction Detail

Shows:
- Transaction txHash (linked to Basescan)
- Nonce, from, to, calldata hash
- Submitted timestamp, age, confirmation count
- RPC status (found/not found/confirmed/failed)
- Recovery status (STUCK / DROPPED / RECOVERED)

### 7.3 Actions

- **Mark Reviewed** — clears the lock status to OPERATOR_REVIEWED, wallet stays paused
- **Keep Paused** — confirm wallet stays quarantined, add notes
- **Force Release Lock** — button opens confirmation modal requiring typed wallet address
- **Prepare Cancel Tx Draft** — generates a cancel-by-replacement tx (nonce same, value=0, data=0x) for operator review before sending

**No auto-send of cancel/replacement in this phase.**

---

## 8. Testing Requirements

| Test | Description |
|------|-------------|
| `execute-once stores nonce` | Execute-once flow captures nonce, from, to, calldataHash |
| `approve/revoke stores nonce` | Approval flow captures nonce |
| `same wallet blocks concurrent live tx` | Second reserveNonce call fails while first is ACTIVE |
| `lock not released before finality` | Force release requires operator approval, not auto |
| `stuck tx pauses wallet` | Reconciliation marks wallet QUARANTINED when tx stuck |
| `dropped tx pauses wallet` | Reconciliation pauses wallet when nonce gap detected |
| `force release requires typed confirmation` | API rejects force release without matching wallet address |
| `scheduler skips quarantined wallet` | Scheduler policy checks wallet nonceStatus before scheduling |

---

## 9. Files to Change

| File | Change |
|------|--------|
| `apps/api/src/db/schema.ts` | Add QUARANTINE status, new fields on wallets/pending_wallet_locks/transactions |
| `apps/api/src/db/client.ts` | Ensure migration tooling available |
| `apps/api/src/nonce/nonce-reservation.ts` | **New file** — NonceReservationService |
| `apps/api/src/trades/trade-routes.ts` | Integrate reserveNonce before signing, attachSubmittedTx after send |
| `apps/api/src/approvals/approval-service.ts` | Integrate reserveNonce for approve/revoke live paths |
| `apps/api/src/scheduler/scheduler-policy.ts` | Skip wallets with QUARANTINED nonce status |
| `apps/api/src/scheduler/confirmation.worker.ts` | Call releaseWalletLockAfterFinality when tx finalized |
| `apps/api/src/reconciliation/reconciliation-worker.ts` | **New file** — periodic nonce reconciliation |
| `apps/api/src/recovery/recovery-routes.ts` | **New file** — recovery UI API endpoints |
| `apps/web/app/admin/recovery/page.tsx` | **New file** — recovery UI page |
| `apps/api/src/ops/alert-webhook.ts` | Add new alert types |
| `docs/NONCE_RESERVATION_AND_RECOVERY.md` | **New file** — architecture doc |
| `docs/STUCK_DROPPED_TX_RUNBOOK.md` | **New file** — operator runbook |

---

## 10. Done Criteria

- [ ] Every live write (execute-once, approve, revoke) captures nonce and tx metadata
- [ ] Wallet cannot sign concurrent unsafe live writes (DB-level enforcement)
- [ ] Stuck/dropped tx detection pauses wallet into QUARANTINED state
- [ ] Recovery is operator-guided with typed confirmation, not automatic signing
- [ ] Live scheduler remains disabled (SCHEDULER_LIVE_EXECUTION=false)
- [ ] All new tests pass
- [ ] TypeScript compiles clean
- [ ] Lint passes