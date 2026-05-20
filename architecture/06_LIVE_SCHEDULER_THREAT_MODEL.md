# Live Scheduler Threat Model

> **Status:** Design-only. Live scheduler execution is not implemented and `SCHEDULER_LIVE_EXECUTION=true` is explicitly rejected. This document defines the threat model to guide future implementation.

## Threat Categories

### 1. Transaction-Ordering Threats

#### Duplicate Transactions
**Risk:** A scheduled job runs twice due to scheduler restart, clock skew, or queue re-delivery, causing a double trade.

**Impact:** Double execution at twice the intended size; fund drain.

**Mitigations (required):**
- Every scheduled trade job must carry a stable, unique idempotency key derived from `scheduleId + executionTimestamp + nonce`.
- The `transaction_requests.idempotency_key` table row must be created *before* the job enters the BullMQ trade queue.
- The job enqueue step must be idempotent — a `createOrReplayRequest` call handles replay detection.
- The BullMQ job itself must check `transaction_requests` for an already-processed `PENDING→SUBMITTED` request before signing.

**Current state:** `schedulerJobs` table has `scheduleId + jobId`, but `SCHEDULER_LIVE_EXECUTION=true` is blocked. When live execution is implemented, this idempotency key design must be applied to the trade worker.

#### Nonce Conflicts
**Risk:** Two jobs for the same wallet race on nonce assignment, or a live execute-once and a scheduled job both try to use the same nonce.

**Impact:** One transaction fails with `nonce too low`, or worse, a replaced transaction.

**Mitigations (required):**
- `TransactionManager.acquireWalletLock` must be called before signing, reserving the nonce atomically in `pending_wallet_locks`.
- The lock entry must store `nonce` when the RPC returns it during submission.
- `STUCK` and `DROPPED` wallets must be excluded from scheduling until explicitly cleared by an operator.
- The per-wallet queue must be a *serial* FIFO — no parallel jobs for the same wallet.
- Scheduler must hold the `pending_wallet_locks` entry until the transaction reaches `FINALIZED` or a configured finality timeout.

**Current state:** `acquireWalletLock` exists but live job submission is blocked by `SCHEDULER_LIVE_EXECUTION=true` guard. Per-wallet serial queuing is not yet implemented in BullMQ.

### 2. Blockchain State Threats

#### Provider Rate Limits (429)
**Risk:** Quote provider returns 429 during a scheduled run, causing the job to fail silently or retry unthrottled.

**Impact:** Missed trade windows; failed jobs accumulating in retry loops.

**Mitigations (required):**
- Quote engine must implement exponential backoff with jitter (see `quote.worker.ts` and `load-test` for reference).
- Provider 429 events must increment `quote_provider_failures_total{provider="zeroX",error_type="PROVIDER_429"}` metric.
- After `MAX_PROVIDER_RETRIES` (recommended: 3), the job moves to the dead-letter queue (DLQ) with `QUOTE_PROVIDER_FAILURE`.
- Alert webhook fires after 2 consecutive 429s within a 5-minute window.

**Current state:** `quote.worker.ts` does not currently implement retry with backoff for 429s.

#### Stuck Transactions
**Risk:** A scheduled transaction is submitted but the receipt never arrives, leaving the wallet locked with `STUCK` status.

**Impact:** Wallet blocked from further trades until operator clears the `STUCK` state.

**Mitigations (required):**
- `TX_STUCK_AFTER_MINUTES` (default: 15) triggers `STUCK` status.
- `STUCK` state blocks all subsequent live writes to the same wallet via `assertNoPendingLiveTransaction`.
- Confirmation worker must re-check every 60 seconds until receipt or `DROPPED`.
- Alert webhook must fire on `STUCK` with wallet ID and transaction ID (no address in payload).

**Current state:** `STUCK` detection and alert webhook exist in `confirmation.ts`. Alert fires correctly.

#### Dropped Transactions
**Risk:** A transaction is dropped from the mempool and replaced by another wallet's transaction with the same nonce.

**Impact:** Scheduled trade never executes; operator may not notice for hours.

**Mitigations (required):**
- After `TX_DROPPED_AFTER_MINUTES` (default: 60), transaction status becomes `DROPPED`.
- `DROPPED` triggers an urgent alert webhook (`severity: critical`).
- Operator must manually verify nonce state on Basescan before the wallet resumes.
- No automatic replacement transaction is sent. Future work may add explicit operator-approved replacement.

**Current state:** `DROPPED` detection exists. Alert fires but UI shows the state prominently.

#### Reorgs
**Risk:** A confirmed transaction is reorged out after `FINALIZED` status is set.

**Impact:** Apparent trade completion but funds do not settle; duplicate execution if re-submitted.

**Mitigations (required):**
- `TX_REORG_LOOKBACK_BLOCKS` (default: 12) governs how far back `FINALIZED` transactions can be re-checked.
- Refresh of a `FINALIZED` transaction within the lookback window returns an operator-guided reorg audit message.
- `FINALIZED` transactions are not auto-repaired. Manual operator review is required.
- No replacement transaction is automatically submitted.

**Current state:** Reorg detection is operator-guided. The lookback mechanism exists but reorg repair is not automated.

### 3. Financial Threats

#### Quote Staleness
**Risk:** A quote from `zeroX` expires before the scheduled job picks it up, leading to unfavorable execution price.

**Impact:** Slippage exceeds configured pair limits; trade executes at bad price.

**Mitigations (required):**
- Quote must be validated immediately before signing, not at enqueue time.
- `QUOTE_MAX_AGE_SECONDS` (default: 30) defines the validity window.
- If quote is stale, the job fetches a fresh quote with backoff, up to `MAX_QUOTE_REFRESH_ATTEMPTS`.
- Stale quote rejection increments `quote_provider_failures_total{error_type="QUOTE_EXPIRED"}`.

**Current state:** Quote freshness check exists in `planner.ts` for dry-run. Live quote validation before signing must be applied in the live trade worker.

#### Gas Spikes
**Risk:** Base gas price spikes during a scheduled window, making the trade economically invalid or exceeding the wallet's `maxGasUsd`.

**Impact:** Transaction fails with out-of-gas or executes with excessive gas cost.

**Mitigations (required):**
- Pre-trade gas estimation must be compared against `wallets.maxGasUsd`.
- If gas exceeds the limit, the scheduled job is rejected with `GAS_LIMIT_EXCEEDED`.
- A `maxPriorityFeePerGas` cap or `maxFeePerGas` upper bound should be configurable per wallet.
- Gas estimation must be refreshed immediately before submission, not at quote time.

**Current state:** `maxGasUsd` check exists in `planner.ts` and `trade-routes.ts`. Live execution must repeat this check immediately before signing.

#### Aggregate Exposure
**Risk:** Multiple wallets all schedule trades simultaneously, exceeding the aggregate daily trade cap (`maxDailyTradeUsd`) or pending cap (`maxPendingTradeUsd`).

**Impact:** Uncontrolled total exposure across the wallet set.

**Mitigations (required):**
- The aggregate risk engine (`aggregate-risk.ts`) must be evaluated immediately before signing, not at schedule creation time.
- `checkAggregateRisk` must include the *proposed* trade amount in pending calculation and reject if caps are exceeded.
- The global scheduler queue must throttle new live jobs when aggregate pending is within 20% of `maxPendingTradeUsd`.
- Alert fires when aggregate pending reaches 80% of `maxPendingTradeUsd`.

**Current state:** Aggregate risk engine exists and is checked at dry-run time. For live scheduled jobs, it must be re-checked at execution time (not scheduling time).

### 4. Security Threats

#### Compromised Wallet
**Risk:** A wallet's encrypted private key is exfiltrated and decrypted.

**Impact:** Full fund drain from that wallet.

**Mitigations (required):**
- Vault decrypts private keys only in memory, never to disk.
- The vault lock (`vault-lock.ts`) auto-locks after `vaultAutoLockMs` (default: 15 minutes).
- Emergency pause (`emergency-pause.ts`) can pause individual wallets or globally without vault access.
- Live signing requires vault to be unlocked (`isVaultUnlocked()`).
- Operator must manually verify wallet key integrity after any suspected compromise.
- Audit logs capture all vault unlock events with request ID correlation.

**Current state:** Vault lock and emergency pause exist. Alert on vault unlock fires.

#### Compromised Operator Session
**Risk:** An attacker hijacks an operator's authenticated session.

**Impact:** Unauthorized trade execution, scheduler manipulation, or vault unlock.

**Mitigations (required):**
- Sessions expire after 12 hours (`SESSION_SECRET`-backed cookie).
- CSRF token required on all mutating requests.
- Rate limiting on login (5 per IP per 5 min, 5 per username per 10 min).
- Failed login tracking increments `auth_login_failures_total`.
- Alert fires after 5 consecutive login failures within 10 minutes.
- Session revocation on logout.

**Current state:** Session auth, CSRF, and rate limiting exist.

#### Compromised Redis
**Risk:** Redis is accessed by an unauthorized party or data is corrupted.

**Impact:** Queue jobs lost or manipulated; scheduler lock stolen.

**Mitigations (required):**
- BullMQ connection uses `REDIS_URL` with no auth by default in dev. In prod, Redis AUTH must be required.
- Redis must not be exposed outside the `backend` network in `docker-compose.prod.example.yml`.
- The scheduler DB lease (`schedulerLocks` table) is the authoritative lock; Redis is only a job queue.
- Queue purge requires explicit typed confirmation (`PURGE SCHEDULER QUEUES`).
- On Redis disconnect, the scheduler enters a degraded state but does not auto-restart or auto-recover without operator action.

**Current state:** Redis is unauthenticated in dev. Prod config requires TLS and password.

#### Compromised Postgres
**Risk:** Postgres is accessed by an unauthorized party.

**Impact:** Transaction history manipulated; scheduler state corrupted; aggregate risk stats forged.

**Mitigations (required):**
- Postgres credentials must not be in code or repo.
- `SCHEDULER_LIVE_EXECUTION` and `DRY_RUN` toggles must be env-only, not DB-overridable.
- Audit logs (`auditLogs` table) capture scheduler start/stop/pause, vault unlock, emergency pause.
- Aggregate risk stats are computed from transaction rows, not user-supplied input.
- DB schema has no UPDATE or DELETE on transaction rows from the API layer — only status transitions.

**Current state:** Creds via env. Audit logs exist. Transaction rows are append-only for status.

### 5. Operational Threats

#### Scheduler Restart During Pending Jobs
**Risk:** Scheduler process crashes with active jobs in the queue or partially-completed wallet schedules.

**Impact:** Jobs in BullMQ are retried by the worker; jobs not yet picked up are handled normally. Wallet schedules with `nextRunAt` in the past resume immediately when the scheduler restarts.

**Mitigations (required):**
- The DB lease (not Redis) is the authoritative scheduler lock. On restart, the scheduler re-acquires the lease and re-scans `wallet_schedules` for missed `nextRunAt`.
- `scheduler_jobs` with `PENDING` or `STARTED` status that are older than 2× `lockTtlMs` must be marked `STALE` and skipped.
- Worker startup must not pick up jobs that were already processed by the dead worker before the crash.
- BullMQ job options must include `removeOnComplete` and `removeOnFail` with appropriate limits to prevent unbounded queue growth.

**Current state:** DB lease exists. Stale job detection is not yet implemented.

## Threat Summary Table

| Threat | Severity | Likelihood | Mitigation Owner |
|--------|----------|------------|-----------------|
| Duplicate transactions | Critical | Medium | Idempotency key + transaction_requests |
| Nonce conflicts | Critical | Medium | Per-wallet serial queue + wallet lock |
| Provider rate limits | High | High | Backoff + DLQ + alert |
| Stuck transactions | High | Medium | STUCK detection + alert + operator gate |
| Dropped transactions | High | Low | DROPPED detection + urgent alert |
| Reorg after finality | Medium | Low | Lookback + manual repair |
| Quote staleness | High | Medium | Expiry check + refresh + rejection |
| Gas spikes | Medium | Medium | Gas limit check immediately before signing |
| Aggregate exposure | Critical | Medium | Aggregate risk engine at execution time |
| Compromised wallet | Critical | Low | Vault lock + emergency pause |
| Compromised session | Critical | Low | Session expiry + CSRF + rate limit |
| Compromised Redis | High | Low | Redis AUTH + network isolation |
| Compromised Postgres | Critical | Low | Env creds + append-only txns + audit |
| Scheduler restart | Medium | Medium | DB lease + stale job detection |

## Out of Scope

The following are explicitly NOT implemented and have no current path:
- Automatic nonce replacement or speed-up transactions
- Automatic reorg repair
- Cross-chain scheduling
- Social recovery of compromised wallets
- Automatic wallet replacement after compromise