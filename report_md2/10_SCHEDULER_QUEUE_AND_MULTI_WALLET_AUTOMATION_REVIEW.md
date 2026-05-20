# Scheduler Queue And Multi Wallet Automation Review

Date: 2026-05-20

Scope: Scheduler implementation, dry-run scheduler, live scheduler blocked status, BullMQ architecture, singleton lock, stop/purge behavior, retry/backoff, multi-wallet scaling, and prerequisites for live scheduler.

Verdict/status: PARTIAL. Dry-run scheduling is implemented. Live scheduling is intentionally missing and must remain blocked.

## Scheduler Current Implementation

- IMPLEMENTED: `SchedulerService` owns start/pause/stop/status/purge and wallet schedule methods.
- IMPLEMENTED: Routes in `apps/api/src/scheduler/scheduler-routes.ts`.
- IMPLEMENTED: BullMQ queues in `apps/api/src/scheduler/queues.ts`.
- IMPLEMENTED: Workers for trade, confirmation, quote, notification.
- IMPLEMENTED: Scheduler status exposes queue counts, lock owner, heartbeat, next runs, failed jobs, paused wallets, dry-run/live flags.

## Dry-Run Scheduler

- IMPLEMENTED: Scheduler selects eligible wallet schedules and enqueues `mode: "DRY_RUN"` jobs.
- IMPLEMENTED: Trade worker creates scheduled dry-run transaction rows through `createScheduledDryRun`.
- IMPLEMENTED: Notification and confirmation jobs are enqueued after scheduled dry-run.
- IMPLEMENTED: Tests cover duplicate suppression, disabled/emergency paused wallets, dry-run transaction records, and live job rejection.

## Live Scheduler Blocked Status

- IMPLEMENTED: `SCHEDULER_LIVE_EXECUTION=true` is rejected by config when dry-run/demo settings conflict.
- IMPLEMENTED: `SchedulerService.start()` throws `Live scheduled execution is not implemented`.
- IMPLEMENTED: `processTradeJob` throws for `mode === "LIVE"`.
- MISSING: No live scheduler implementation exists.

## Queue Architecture

- IMPLEMENTED: Queues: `quoteQueue`, `tradeQueue`, `confirmationQueue`, `notificationQueue`.
- IMPLEMENTED: Redis connection derived from `REDIS_URL`.
- PARTIAL: Default job options use `attempts: 1`, `removeOnComplete: 100`, `removeOnFail: 100`.
- MISSING: No robust retry/backoff/dead-letter design for production automation.

## Singleton Lock

- IMPLEMENTED: `scheduler_locks` table coordinates owner, heartbeat, and expiry.
- IMPLEMENTED: Start refuses if another active owner has non-expired lock.
- PARTIAL: Lock is DB-backed, but worker processes are in API process memory and require explicit scheduler start after restart.

## Stop/Purge Behavior

- IMPLEMENTED: Stop closes workers and queues, releases lock.
- IMPLEMENTED: Pause releases lock and finishes run as paused.
- IMPLEMENTED: Purge requires exact confirmation phrase `PURGE SCHEDULER QUEUES`.
- IMPLEMENTED: Tests confirm stopping does not drain pending queue jobs.
- PARTIAL: Purge is powerful and should be rate-limited/audited in public deployment.

## Dead-Letter/Retry/Backoff

- MISSING: No DLQ table or operator UI for failed queue jobs beyond failed job list/counts.
- PARTIAL: BullMQ failed jobs are retained, but `attempts: 1` means transient provider/RPC failures can become immediate failures.
- PARTIAL: Alert webhook can fire on scheduler failure, but operational response is manual.

## Multi-Wallet Scaling Risks

- HIGH: Quote provider 429/rate-limit behavior is not proven for 10+ wallets.
- HIGH: Aggregate risk is incomplete for live pre-signing.
- HIGH: Nonce and pending lock policy is conservative but not replacement-aware.
- MEDIUM: Scheduler picks first eligible enabled wallet-pair rule, which may concentrate routes.
- MEDIUM: No concurrency controls per provider/router beyond BullMQ defaults.

## 10+ Wallet Dry-Run Readiness

- PARTIAL: Dry-run queue infrastructure exists.
- PARTIAL: Provider load test CLI exists in `apps/api/src/cli/dry-run-load-test.ts`.
- NOT_TESTED: The 5+/10+ wallet provider load test was not run in this audit.

## 10+ Wallet Live Readiness

- FAIL / MISSING: Live scheduler is not implemented.
- FAIL / PARTIAL: Custody, aggregate risk, provider load, nonce replacement, alerting, and operator gates are insufficient.

## What Must Exist Before Live Scheduler

- Manual tiny live execute-once passes and reaches finality.
- Aggregate risk enforced immediately before every live signing operation.
- Provider load test passes at expected wallet concurrency.
- Reliable queue retry/backoff/DLQ semantics.
- Signer/custody provider does not expose private keys to API memory.
- Nonce replacement/cancel/reorg strategy is designed and tested.
- Emergency stop halts scheduler and blocks signing.
- Alerts fire for stuck, dropped, failed, provider 429, queue failures, and emergency pause.

## Acceptance Criteria

- `SCHEDULER_LIVE_EXECUTION=true` remains rejected until all gates are implemented.
- Dry-run scheduler can handle 10 wallets without duplicate jobs and with acceptable provider latency.
- Live scheduler design has tests for restart during pending jobs, duplicate tx prevention, and aggregate risk rejection.
