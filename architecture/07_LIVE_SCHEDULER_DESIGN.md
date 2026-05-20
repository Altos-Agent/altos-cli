# Live Scheduler Architecture

> **Status:** Design-only. Live scheduler execution is not implemented and `SCHEDULER_LIVE_EXECUTION=true` is explicitly rejected. The architecture described here is the target state.

## Overview

The live scheduler extends the existing dry-run scheduler with blockchain transaction submission capabilities. The design preserves all existing safety properties: idempotency, vault lock, emergency pause, aggregate risk checks, and operator confirmation gates.

## Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      SchedulerCoordinator                     │
│  - DB-lease based singleton loop                             │
│  - Scans wallet_schedules for due schedules                  │
│  - Creates scheduler_jobs and enqueues to BullMQ             │
└──────────┬──────────────────────────────────────────────────┘
           │           ┌──────────────────────────────────────┐
           │           │     Per-Wallet Serial Queues         │
           │           │  (BullMQ named queues per wallet)     │
           │           └──────────┬───────────────────────────┘
           │                      │ one job per wallet at a time
           ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     TradeWorker (BullMQ)                     │
│  - Validates quote freshness                                 │
│  - Evaluates per-wallet + aggregate risk                     │
│  - Acquires wallet lock + nonce                              │
│  - Simulates via call()                                      │
│  - Signs + submits via viem wallet client                     │
│  - Updates transaction + scheduler_job status                │
└──────────┬──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────┐
│                    ConfirmationWorker                        │
│  - Polls receipts for SUBMITTED / CONFIRMED_PENDING_FINALITY  │
│  - Updates transaction status                                │
│  - Triggers NotificationWorker on completion                 │
│  - Moves to DLQ after max retries                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Global Risk Engine                        │
│  - checkAggregateRisk() evaluated at execution time         │
│  - Rejects if any cap would be exceeded                      │
│  - Updates stats after finalization                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    NonceManager                              │
│  - Per-wallet nonce reservation via pending_wallet_locks      │
│  - Atomically acquires nonce before signing                  │
│  - Releases on FINALIZED / FAILED / operator-clear           │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. SchedulerCoordinator

The scheduler coordinator runs as a singleton loop using a DB lease with heartbeat (existing `schedulerLocks` table).

**Responsibilities:**
- Acquire/release `scheduler-loop` DB lease
- Scan `wallet_schedules` for due schedules (`nextRunAt <= now`)
- Run eligibility checks (`canScheduleWallet` + aggregate risk)
- Create `scheduler_jobs` row and enqueue to BullMQ
- Handle scheduler pause/stop/drain gracefully

**Key properties:**
- Singleton: only one coordinator active across all API instances
- DB-backed: lease survives process restarts
- Event-driven: uses existing BullMQ worker pattern

**Changes from current `scheduler-service.ts`:**
- Add `SCHEDULER_LIVE_EXECUTION` env gate (keep `SCHEDULER_LIVE_EXECUTION=true` blocked)
- Replace dry-run-only path with job enqueue to live trade queue

### 2. Per-Wallet Serial Queue

Instead of a single `tradeQueue`, each wallet gets a named queue: `wallet-trade-{walletId}`.

**Why:** Ensures two scheduled jobs for the same wallet never execute in parallel, preventing nonce conflicts.

**Implementation:**
- Queue name: `wallet-trade-${walletId}` (BullMQ supports named queues)
- Worker concurrency: 1 per queue (only one job processed at a time per wallet)
- Jobs for different wallets run in parallel freely

**Alternative considered:** Single queue with worker-level locking per wallet. Rejected because per-wallet queues give clearer observability and natural backpressure per wallet.

### 3. TradeWorker (BullMQ)

The trade worker handles one wallet's scheduled trade from queue to submission.

**Execution pipeline:**

```
1. Dequeue job from wallet-trade-{walletId} queue
2. Load scheduler_job record — skip if status != PENDING
3. Load wallet, pair, tokens, router, daily stats
4. Acquire quote:
   a. Fetch fresh quote from provider (zeroX or mock)
   b. Validate quote freshness (< QUOTE_MAX_AGE_SECONDS)
   c. Validate quote: chainId, router, tokens, amounts, slippage, priceImpact
   d. If stale/invalid: retry with backoff (max 3 attempts), then DLQ
5. Evaluate per-wallet risk:
   a. Wallet status must be ACTIVE
   b. Amount <= maxTradeUsd, daily count <= maxDailyTrades
   c. Estimated gas <= maxGasUsd
   d. Slippage <= pair.maxSlippageBps
   e. Price impact <= pair.maxPriceImpactBps (if provided)
6. Evaluate aggregate risk:
   a. checkAggregateRisk(proposedTradeUsd, proposedGasUsd)
   b. If any cap exceeded: reject job, increment failureCount, schedule next run
7. Acquire wallet lock (nonce reservation):
   a. TransactionManager.acquireWalletLock(walletId, requestId, nonce)
   b. If lock held by another request: re-queue with delay (max 3 retries)
8. Simulate:
   a. basePublicClient.call({ ...calldata, account, chain }) via viem
   b. If simulation fails: reject job, release lock, schedule next run
9. Sign and submit:
   a. Decrypt encryptedPrivateKey via vault
   b. Sign transaction via viem wallet client
   c. Submit via basePublicClient.sendTransaction
   d. Store transaction row: status=SUBMITTED, txHash, nonce, fromAddress
10. Update scheduler_job:
    a. status=COMPLETED, finishedAt=now
    b. Update wallet schedule: lastRunAt, lastStatus, failureCount=0
    c. Compute and set nextRunAt
11. Release wallet lock (on FINALIZED/FAILED confirmation, not here)
12. Enqueue confirmation job
13. Enqueue notification job
```

**Dead Letter Queue (DLQ):**
Jobs that exhaust retries go to a `live-trade-dlq` BullMQ queue with reason:
- `QUOTE_PROVIDER_FAILURE` — 3 consecutive provider errors
- `QUOTE_STALENESS` — quote expired after max refresh attempts
- `SIMULATION_FAILURE` — on-chain simulation reverted
- `GAS_LIMIT_EXCEEDED` — gas estimate exceeds wallet maxGasUsd
- `RISK_REJECTED` — per-wallet or aggregate risk check failed
- `LOCK_TIMEOUT` — could not acquire wallet lock after max retries
- `UNEXPECTED_ERROR` — any other error

DLQ jobs trigger `alertSchedulerFailure` with the reason.

### 4. ConfirmationWorker (existing, extends for live)

The existing confirmation worker handles receipts for submitted live transactions.

**Changes from current `confirmation.worker.ts`:**
- After receipt confirmation and finality, release `pending_wallet_locks`
- After `STUCK` or `DROPPED`, do NOT release lock — requires operator review
- After finality, update `daily_wallet_stats` and aggregate risk stats
- After `FAILED`, increment `failureCount` on the wallet schedule; trigger `shouldPauseWalletAfterFailure` check

**Non-replacement policy:**
No automatic replacement, speed-up, or cancel transactions. `STUCK` and `DROPPED` require operator manual review. The system does not send transactions to replace stuck ones.

### 5. NonceManager (via TransactionManager)

The existing `TransactionManager` provides nonce management:

```typescript
// Before signing, atomically reserve the nonce:
const lock = await transactionManager.acquireWalletLock({
  walletId,
  requestId: schedulerJob.id,
  nonce: null, // RPC will provide after send
});

// After submit, update with nonce from RPC response:
await transactionManager.updateWalletLockNonce(lock.id, nonce);

// After finality/failure, release:
await transactionManager.releaseWalletLock({
  walletId,
  requestId: schedulerJob.id,
  status: "RELEASED", // or "EXPIRED" on timeout
});
```

**Idempotency:**
`createOrReplayRequest` with `idempotencyKey = scheduleId:jobId:attempt` ensures duplicate queue deliveries are safely handled.

### 6. Idempotency Key Design

Every scheduled live job has a three-part idempotency key:

```
idempotencyKey = scheduleId + ":" + jobId + ":" + attempt
```

Where `attempt` starts at 0 and increments only if the *same job* needs to be retried after a retriable error (provider 429, simulation failure, etc.).

Non-retriable errors (risk rejection, gas limit exceeded) use the same key without incrementing `attempt` — the job is DLQ'd, not retried.

This ensures:
- Crash-restart: the same job re-processed with same idempotency key is safely replayed
- Queue re-delivery: duplicate delivery returns the existing transaction
- No nonce double-use: replay detection in `createOrReplayRequest` throws, preventing re-signing

### 7. AuditLogging

Every state transition is written to `auditLogs`:

```typescript
// On scheduler start
{ action: "scheduler.start", entityType: "scheduler", metadata: { mode: "LIVE" } }

// On job enqueue
{ action: "scheduler.job.enqueue", entityType: "scheduler_job", entityId: jobId, metadata: { walletId, pairId } }

// On wallet lock acquired
{ action: "wallet.lock.acquire", entityType: "wallet", entityId: walletId, metadata: { nonce, requestId } }

// On transaction submitted
{ action: "transaction.submitted", entityType: "transaction", entityId: txId, metadata: { txHash, nonce, jobId } }

// On STUCK
{ action: "transaction.stuck", entityType: "transaction", entityId: txId, metadata: { walletId, reason } }

// On wallet lock released
{ action: "wallet.lock.release", entityType: "wallet", entityId: walletId, metadata: { requestId, status } }
```

### 8. Monitoring and Alerting

**Metrics (extend Phase 9 metrics):**
| Metric | Type | Labels |
|--------|------|--------|
| `scheduler_live_jobs_total` | counter | `wallet_id`, `status` |
| `scheduler_dlq_jobs_total` | counter | `wallet_id`, `reason` |
| `scheduler_wallet_lock_held_seconds` | histogram | `wallet_id` |
| `nonce_reservation_waits_total` | counter | `wallet_id` |
| `aggregate_risk_rejections_total` | counter | `limit_type` |

**Alert events:**
- `SCHEDULER_LIVE_EXECUTION=true` attempted → `live_mode_attempted_unsafe`
- Wallet lock held > 30 minutes → `warning` alert with wallet ID (no address)
- DLQ job enqueued → `scheduler_failure`
- Aggregate pending > 80% of cap → `notification_failure_spike` (warning)
- 3 consecutive provider 429s → `notification_failure_spike`
- `STUCK` transaction detected → `stuck_transaction`
- `DROPPED` transaction detected → `dropped_transaction` (critical)

## Kill Switches

### Operator Kill Switches (Reversible)

| Switch | Mechanism | Effect |
|--------|-----------|--------|
| `DRY_RUN=false` (global) | Env variable, requires API restart | Stops all live execution |
| `SCHEDULER_LIVE_EXECUTION=false` | Env variable, requires API restart | Stops scheduled live jobs |
| Global emergency pause | `POST /api/emergency-pause/enable` | Stops all approvals, exec-once, scheduling |
| Per-wallet pause | `POST /api/wallets/:id/emergency-pause` | Stops that wallet's scheduling |
| Per-wallet schedule disable | `PATCH /api/wallets/:id/schedule {enabled: false}` | Stops that wallet's schedule |

### Automatic Kill Switches (Self-resetting)

| Trigger | Behavior |
|---------|----------|
| Quote provider 3 consecutive 429s | Wallet schedule pauses, DLQ entry, alert |
| Gas estimate > wallet maxGasUsd | Job rejected, next run scheduled |
| Per-wallet or aggregate risk exceeded | Job rejected, next run scheduled |
| Wallet lock not acquired in 60s | Job retried once, then DLQ |
| STUCK timeout | Wallet auto-paused, alert |
| 3 consecutive failures for same wallet | Wallet emergency paused, alert |

## Drain and Resume

**Drain:** When the operator calls `POST /api/scheduler/pause` or `POST /api/scheduler/stop`:
- Scheduler loop stops immediately (no new job enqueue)
- BullMQ workers continue processing in-flight jobs until completion
- No new wallet locks are acquired
- In-flight jobs complete or timeout naturally

**Resume:** `POST /api/scheduler/start` re-acquires the DB lease and resumes scanning for due schedules.

**Per-wallet drain:** Operators can disable a specific wallet's schedule without stopping the global scheduler. The scheduler respects `wallet_schedules.enabled = false`.

## Idempotency Guarantees

1. **Job creation:** `scheduler_jobs` row is created before BullMQ enqueue. If the process crashes between these two steps, the restart scan finds the `PENDING` job and re-enqueues it.

2. **Queue delivery:** BullMQ job options include `jobId = schedulerJob.id` as the BullMQ job ID. If a job is re-delivered, the worker calls `createOrReplayRequest` which detects the existing `PENDING` request and returns `replay: true` without re-signing.

3. **Signing:** The signing path checks `transactionRequests.requestHash` before signing. Replay returns early with the existing transaction record.

4. **Wallet lock:** `acquireWalletLock` atomically checks and creates a `pending_wallet_locks` entry. If the lock is held, the job retries with exponential backoff.

## Out of Scope

- Cross-wallet atomic transactions
- Automatic nonce replacement/speed-up/cancel
- Autonomous reorg repair
- Multi-chain scheduling
- Social recovery
- Fully automated wallet rotation without operator approval

These require separate threat models and design reviews before consideration.