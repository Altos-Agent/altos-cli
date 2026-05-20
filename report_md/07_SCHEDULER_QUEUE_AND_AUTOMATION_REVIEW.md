# Scheduler Queue And Automation Review

Date: 2026-05-13  
Scope: Scheduler service, BullMQ queues, dry-run scheduling, live blocking, singleton locks, purge/stop behavior, history, retry, and scaling risk.  
Verdict/status: DRY_RUN scheduler IMPLEMENTED; live automation MISSING by design.

## Scheduler Current State

`apps/api/src/scheduler/scheduler-service.ts` manages scheduler lifecycle, status, singleton lock, wallet schedules, job enqueueing, and queue purge. It uses BullMQ queues from `apps/api/src/scheduler/queues.ts`.

## Queue Architecture

| Queue / Worker | Purpose | Status |
| --- | --- | --- |
| `quoteQueue` | Quote-related scheduling path | PARTIAL |
| `tradeQueue` / `trade.worker.ts` | Scheduled dry-run job execution | IMPLEMENTED |
| `confirmationQueue` / `confirmation.worker.ts` | Receipt/finality refresh | IMPLEMENTED |
| `notificationQueue` / `notification.worker.ts` | Telegram delivery work | IMPLEMENTED |

## Dry-Run Scheduler Behavior

Enabled wallet schedules enqueue deterministic `DRY_RUN` jobs only. The worker creates scheduled dry-run transaction records and records scheduler job status. Tests cover duplicate start, disabled/emergency paused wallets, daily run limits, dry-run transaction creation, and live job rejection.

## Live Scheduler Blocking Status

`scheduler-service.ts` throws when `SCHEDULER_LIVE_EXECUTION=true`, and `trade.worker.ts` rejects `LIVE` jobs. This is correct for current safety posture. Live automation is not merely disabled; it is intentionally not implemented.

## Singleton / Lock Behavior

`scheduler_locks` stores owner, heartbeat, expiry, and update timestamps. Starting the scheduler acquires a DB singleton lock and keeps heartbeat. This is appropriate for local/single deployment dry-run use.

## Stop / Purge Behavior

`pause`, `stop`, and queue purge routes exist. Purge requires explicit confirmation and writes audit logs. Stopping does not drain pending jobs, based on tests.

## Job History

`scheduler_jobs` records wallet, schedule, job type, status, reason, due, start, finish, and queue job ID. This supports local operator review.

## Retry / Failure Behavior

BullMQ defaults show `attempts: 1`, with capped retained completed/failed jobs. Failure thresholds can emergency-pause wallet schedules. More robust retry/backoff/poison-queue handling is needed for production.

## Automation Safety

Implemented:
- Global emergency pause blocks scheduler start and scheduled jobs.
- Wallet emergency pause disables the schedule.
- Daily run/loss limits exist.
- Live scheduler is rejected.

Missing for live automation:
- reliable nonce/replacement recovery,
- operator approval workflow,
- exposure aggregation,
- durable distributed rate limits,
- complete monitoring/alerting,
- tested kill-switch drills.

## What Is Needed Before Scheduled Live Execution

1. Separate design review and threat model.
2. Hardware/KMS/MPC signing strategy.
3. Replacement and stuck transaction recovery.
4. Per-wallet and global exposure accounting.
5. Queue retry/backoff/idempotency across restarts.
6. Production monitoring and alerting.
7. Human approval gates and rollback/stop runbook.
8. Dedicated E2E/integration tests for all failure modes.

## Multi-Wallet Scaling Risks

| Severity | Risk | Status |
| --- | --- | --- |
| HIGH | Same-wallet serialization exists, but multi-wallet aggregate exposure is limited | PARTIAL |
| HIGH | RPC/quote provider rate limits can affect many wallets | UNCLEAR |
| HIGH | Live scheduler intentionally unsupported | MISSING |
| MEDIUM | Queue retry policy is minimal | PARTIAL |
| MEDIUM | Scheduler lock assumes DB/Redis health and local operator context | PARTIAL |

