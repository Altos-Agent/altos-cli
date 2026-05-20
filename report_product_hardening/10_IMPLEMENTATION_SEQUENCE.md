# Implementation Sequence

Date: 2026-05-20

Scope: Phase-by-phase implementation map, exact files likely changed, acceptance criteria, validation commands, and live scheduler sequencing.

Verdict/status: ACTION_PLAN. Implement in strict order. Do not start live scheduler work until Phase 1 through Phase 5 gates are green.

## Phase 0: Freeze Safety And Clean Baseline

Goal: Preserve dry-run default and prevent accidental live scheduler enablement while hardening begins.

Likely files:

- `README.md`
- `.env.example`
- `apps/api/src/config/env.ts`
- `apps/api/src/scheduler/scheduler-service.ts`
- `apps/api/src/scheduler/trade.worker.ts`
- `.github/workflows/ci.yml`

Acceptance criteria:

- `DRY_RUN=true` and `SCHEDULER_LIVE_EXECUTION=false` remain defaults.
- Live scheduler block has explicit tests.
- CI no longer masks critical smoke failures.

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm e2e
```

## Phase 1: Normalize Risk And Gate Manual Live Signing

Goal: Fix aggregate risk accounting and enforce aggregate risk immediately before any live signing.

Likely files:

- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/0013_normalized_risk_accounting.sql`
- `apps/api/src/risk/aggregate-risk.ts`
- `apps/api/src/risk/aggregate-risk.test.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/trades/live-execution.test.ts`
- `apps/api/src/strategy/planner.ts`
- `apps/api/src/strategy/plan-routes.ts`
- `apps/api/src/quote/types.ts`
- `apps/api/src/quote/quote-validation.ts`
- `packages/shared/src/schemas/quote.ts`
- `packages/shared/src/schemas/trade.ts`
- `apps/web/components/execute-once-card.tsx`
- `apps/web/components/dry-run-trade-card.tsx`

Acceptance criteria:

- Aggregate limits use normalized USD, never raw token units.
- Manual execute-once checks and reserves aggregate risk after quote validation and before approval/signing.
- Unknown USD notional blocks live execution.
- Concurrent requests cannot exceed aggregate caps.

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/risk/aggregate-risk.test.ts apps/api/src/trades/live-execution.test.ts
pnpm test
```

## Phase 2: Token/Router/Provider Verification

Goal: Make live quote inputs independently verifiable and auditable.

Likely files:

- `apps/api/src/risk/verification.ts`
- `apps/api/src/risk/verification-ui.ts`
- `apps/api/src/management/management-service.ts`
- `apps/api/src/management/management-routes.ts`
- `apps/api/src/quote/providers/zeroX.ts`
- `apps/api/src/quote/quote-validation.ts`
- `apps/web/components/tokens-management.tsx`
- `apps/web/components/router-management.tsx`
- `apps/web/components/pairs-management.tsx`
- `docs/PROVIDER_LOAD_TEST.md`

Acceptance criteria:

- Live flow requires VERIFIED tokens, router, tx target, and allowance target.
- Operator verification stores source, timestamp, reviewer, and notes.
- 0x failures are typed and observable.

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/quote/quote-validation.test.ts apps/api/src/management/risk-policy.test.ts
pnpm test
```

## Phase 3: Queue, Nonce, DLQ, And Trace Hardening

Goal: Make asynchronous jobs safe, observable, and restart-resilient.

Likely files:

- `apps/api/src/scheduler/queues.ts`
- `apps/api/src/scheduler/scheduler-service.ts`
- `apps/api/src/scheduler/trade.worker.ts`
- `apps/api/src/transactions/transaction-manager.ts`
- `apps/api/src/transactions/confirmation.ts`
- `apps/api/src/http/request-context.ts`
- `apps/api/src/ops/metrics.ts`
- `apps/api/src/notifications/telegram.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/0014_nonce_queue_trace.sql`

Acceptance criteria:

- Retries are typed and cannot duplicate post-sign submission.
- DLQ exists with operator-visible disposition.
- Nonce reservation and transaction lifecycle are persisted.
- Trace IDs survive HTTP-to-queue-to-notification boundaries.

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/scheduler/scheduler-service.test.ts apps/api/src/transactions/transaction-manager.test.ts
pnpm test
pnpm e2e
```

## Phase 4: Custody Upgrade

Goal: Block meaningful funds on local-file custody and integrate a production candidate signer.

Likely files:

- `apps/api/src/vault/providers/*`
- `apps/api/src/vault/wallet-vault.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/approvals/approval-service.ts`
- `apps/api/src/runtime/runtime-status.ts`
- `apps/web/components/vault-controls.tsx`
- `docs/CUSTODY_HARDENING_ROADMAP.md`

Acceptance criteria:

- Production live mode cannot use local-file provider.
- Signing path goes through provider abstraction.
- Vault/custody status blocks unsafe live flows in API and UI.

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/vault/wallet-vault.test.ts apps/api/src/vault/vault-lock.integration.test.ts
pnpm test
```

## Phase 5: CI, Drills, And Server Hardening

Goal: Make safety failures visible and deployment repeatable.

Likely files:

- `.github/workflows/ci.yml`
- `docker-compose.prod.example.yml`
- `infra/nginx/nginx.conf`
- `scripts/drills/*`
- `docs/SERVER_DEPLOYMENT_CHECKLIST.md`
- `docs/BACKUP_RESTORE_DRILL.md`
- `docs/EMERGENCY_PAUSE_DRILL.md`

Acceptance criteria:

- E2E and Docker smoke failures fail CI.
- Backup/restore, emergency pause, and alert drills are documented and executed.
- Deployment checklist blocks public/live exposure until secrets, TLS, firewall, Redis, Postgres backups, and custody are ready.

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm e2e
pnpm docker:compose:prod:check
pnpm docker:build:api
pnpm docker:build:web
```

## Phase 6: Live Scheduler Design Gate Only

Goal: Design live automation after safety foundations pass. Do not implement submission yet.

Acceptance criteria:

- All no-go conditions are resolved.
- Architecture review signs off on scheduler state machine.
- Threat model has tests mapped to each risk.

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm e2e
```
