# Scheduler Queue Nonce Gaps

Date: 2026-05-20

Scope: BullMQ scheduler, dry-run worker, live scheduler blocking, retry/backoff/DLQ, wallet locks, nonce policy, replacement/cancel/reorg handling, and multi-wallet scaling.

Verdict/status: HIGH / PARTIAL. Dry-run scheduling is implemented. Live scheduling, live-safe queue semantics, and robust nonce lifecycle are missing.

## Current Scheduler State

- IMPLEMENTED: `apps/api/src/scheduler/scheduler-service.ts` manages scheduler start/pause/stop, singleton lock, heartbeat, schedule records, due-wallet enqueueing, and submitted transaction confirmation enqueueing.
- IMPLEMENTED: `apps/api/src/scheduler/trade.worker.ts` processes scheduled dry-runs and rejects `LIVE`.
- IMPLEMENTED: `apps/api/src/scheduler/queues.ts` creates quote, trade, confirmation, and notification queues.
- IMPLEMENTED: `apps/api/src/db/schema.ts` contains `schedulerLocks`, `schedulerRuns`, `walletSchedules`, and `schedulerJobs`.
- IMPLEMENTED: `apps/api/src/transactions/transaction-manager.ts` has idempotency records and per-wallet pending locks.
- PARTIAL: `confirmation.worker.ts` re-enqueues receipt refresh jobs, but full stuck/replaced/cancel handling remains operator-guided.

## Queue Gaps

- HIGH / PARTIAL: `defaultJobOptions` uses `attempts: 1`; no backoff policy exists for transient provider/RPC failures.
- HIGH / MISSING: No dedicated dead-letter queue with operator-visible disposition.
- HIGH / MISSING: No retry classification by error type. A quote 429, RPC timeout, stale quote, simulation failure, and signed submission ambiguity need different policies.
- HIGH / MISSING: No queue-level idempotency model for live jobs beyond the current request/lock mechanisms.
- MEDIUM / PARTIAL: Queue status is surfaced, but metrics are not fully instrumented from worker events.

## Nonce And Transaction Lifecycle Gaps

- HIGH / PARTIAL: `pendingWalletLocks` can store nonce, but `trade-routes.ts` does not explicitly reserve or persist nonce before submission.
- HIGH / PARTIAL: `assertNoPendingLiveTransaction()` blocks wallet when submitted/pending/stuck transactions exist, but replacement and cancel handling are not automated.
- HIGH / PARTIAL: `confirmation.ts` marks missing receipts as `STUCK` or `DROPPED` and says replacement detection requires operator review.
- HIGH / MISSING: No nonce table with lifecycle states such as `RESERVED`, `SIGNED`, `SUBMITTED`, `CONFIRMED`, `REPLACED`, `CANCELLED`, `DROPPED`.
- HIGH / MISSING: No crash-safe rule for "signed but unknown submitted" ambiguity.

## Exact Files Likely Touched

- `apps/api/src/scheduler/queues.ts`
- `apps/api/src/scheduler/scheduler-service.ts`
- `apps/api/src/scheduler/trade.worker.ts`
- `apps/api/src/scheduler/confirmation.worker.ts`
- `apps/api/src/scheduler/notification.worker.ts`
- `apps/api/src/scheduler/scheduler-routes.ts`
- `apps/api/src/scheduler/scheduler-service.test.ts`
- `apps/api/src/transactions/transaction-manager.ts`
- `apps/api/src/transactions/transaction-manager.test.ts`
- `apps/api/src/transactions/confirmation.ts`
- `apps/api/src/transactions/confirmation.test.ts`
- `apps/api/src/transactions/confirmation-finality.integration.test.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/0014_nonce_and_queue_dlq.sql`
- `packages/shared/src/schemas/scheduler.ts`
- `apps/web/components/scheduler-controls.tsx`
- `apps/web/components/transactions-table.tsx`

## Acceptance Criteria

- CRITICAL: Live scheduler cannot submit unless nonce reservation, aggregate risk reservation, quote hash, simulation hash, and idempotency key are all persisted before signing.
- CRITICAL: Retrying a job cannot send a duplicate transaction.
- HIGH: Queue retries use typed retry policies and exponential backoff only for safe, pre-sign operations.
- HIGH: Post-sign failures enter an operator review state instead of blind retry.
- HIGH: Dead-letter jobs appear in API and UI with reason, request ID, job ID, wallet ID, and safe next action.
- HIGH: Restart tests prove no duplicate live submission across API/worker crashes.

## Validation Commands

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/scheduler/scheduler-service.test.ts
pnpm --filter @base-orchestrator/api test -- apps/api/src/transactions/transaction-manager.test.ts apps/api/src/transactions/confirmation.test.ts
pnpm test
pnpm e2e
```
