# Live Automation Blockers

Date: 2026-05-20

Scope: Live scheduler, automated transaction execution, live execution gates, product-abuse controls, and no-go blockers.

Verdict/status: CRITICAL / MISSING. Live automation is intentionally blocked and must not be enabled until risk, nonce, custody, provider, observability, and CI gates are implemented and tested.

## Current State

- IMPLEMENTED: `apps/api/src/config/env.ts` defaults `SCHEDULER_LIVE_EXECUTION=false` and blocks `SCHEDULER_LIVE_EXECUTION=true` when `DRY_RUN=true` or `DEMO_MODE=true`.
- IMPLEMENTED: `apps/api/src/scheduler/scheduler-service.ts` throws `"Live scheduled execution is not implemented"` when `schedulerLiveExecution` is true.
- IMPLEMENTED: `apps/api/src/scheduler/trade.worker.ts` throws `"Live scheduled execution is not implemented"` for `job.data.mode === "LIVE"`.
- IMPLEMENTED: `README.md` states live scheduled execution is intentionally not implemented.
- PARTIAL: `architecture/06_LIVE_SCHEDULER_THREAT_MODEL.md`, `architecture/07_LIVE_SCHEDULER_DESIGN.md`, and `plan/06_LIVE_SCHEDULER_IMPLEMENTATION_GATES.md` describe direction, but source gates are not complete enough for implementation.

## Blocking Issues

- CRITICAL / MISSING: No live scheduler state machine that reserves risk, nonce, quote, approval, simulation, submission, confirmation, and rollback as one auditable workflow.
- CRITICAL / MISSING: No production custody provider. `apps/api/src/vault/providers/kms.ts` and `apps/api/src/vault/providers/external-signer.ts` are explicit stubs.
- HIGH / PARTIAL: Aggregate risk is not normalized to USD and is not enforced immediately before live signing.
- HIGH / PARTIAL: Pending exposure uses raw token units via `transactions.amountIn`.
- HIGH / PARTIAL: BullMQ retry/backoff/DLQ policy is not adequate for live jobs.
- HIGH / PARTIAL: Nonce replacement/cancel/reorg handling remains operator-guided in `apps/api/src/transactions/confirmation.ts`.
- HIGH / PARTIAL: 0x/provider behavior under wallet fan-out is unproven.
- HIGH / PARTIAL: Token/router/spender verification exists as fields and checks, but operator verification workflow is incomplete.
- MEDIUM / PARTIAL: Trace ID propagation into queues and notifications is inconsistent.
- MEDIUM / PARTIAL: CI masks E2E failures and Docker smoke failures use `|| true` in places.

## Exact Files Likely Touched In Later Phases

- `apps/api/src/scheduler/scheduler-service.ts`
- `apps/api/src/scheduler/trade.worker.ts`
- `apps/api/src/scheduler/queues.ts`
- `apps/api/src/scheduler/scheduler-policy.ts`
- `apps/api/src/scheduler/scheduler-routes.ts`
- `apps/api/src/transactions/transaction-manager.ts`
- `apps/api/src/transactions/confirmation.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/risk/aggregate-risk.ts`
- `apps/api/src/quote/quote-validation.ts`
- `apps/api/src/quote/providers/zeroX.ts`
- `apps/api/src/vault/providers/*`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/*.sql`
- `packages/shared/src/schemas/scheduler.ts`
- `packages/shared/src/schemas/trade.ts`
- `apps/web/components/scheduler-controls.tsx`
- `apps/web/components/execute-once-card.tsx`
- `.github/workflows/ci.yml`

## Acceptance Criteria Before Any Live Scheduler Work

- CRITICAL: Live scheduler remains off by default and cannot start unless all no-go gates are green.
- CRITICAL: Every automated live job has an immutable request ID, job ID, risk reservation ID, nonce reservation ID, quote hash, simulation hash, tx hash if submitted, and notification delivery audit.
- CRITICAL: Scheduler can resume safely after process crash without duplicate submission.
- CRITICAL: Per-wallet and aggregate limits are enforced in normalized USD before signing.
- CRITICAL: Queue retries never duplicate signed/submitted transactions.
- HIGH: Dead-lettered jobs are visible in API/UI and require operator disposition.
- HIGH: E2E and integration tests fail CI on unsafe scheduler behavior.

## Validation Commands After Live Scheduler Design Phase

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @base-orchestrator/api test -- apps/api/src/scheduler/scheduler-service.test.ts apps/api/src/transactions/transaction-manager.test.ts
pnpm e2e
pnpm docker:compose:prod:check
```
