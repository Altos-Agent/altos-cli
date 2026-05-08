# Next Phase Implementation Plan
Date: 2026-05-08
Repository audit scope: Phased plan to fix critical issues and advance from local demo to safer dry-run/live execution.
Verdict/status: ACTIONABLE_PLAN.

## Phase A: Critical Security Fixes

Goal: Prevent unauthorized or accidental live-impacting actions.

Tasks:

- Add local auth/session and CSRF protection.
- Add route-level authorization for all mutating routes.
- Add central env/config validation.
- Add vault locked/unlocked status and reject signing while locked.
- Add global emergency pause.

Files likely touched: `apps/api/src/server.ts`, new `apps/api/src/auth/*`, new `apps/api/src/config/*`, `apps/api/src/vault/*`, route modules, `apps/web/components/app-shell.tsx`, settings/security UI.

Acceptance criteria:

- All write routes reject unauthenticated requests.
- Live signing rejects while vault is locked.
- Emergency pause blocks approvals, execute-once, and scheduler.

Validation commands: `pnpm typecheck`, `pnpm lint`, `pnpm test`, auth integration tests.

## Phase B: Dry-run Completeness

Goal: Make dry-run reliable and representative.

Tasks:

- Add shared route schemas.
- Fix token amount/decimal conversions.
- Add price impact check once quote provider returns it.
- Improve API error states in web.
- Regenerate `VALIDATION_REPORT.md`.

Files likely touched: `packages/shared/src`, `apps/api/src/strategy/*`, `apps/api/src/risk/*`, `apps/web/lib/api.ts`.

Acceptance criteria:

- Dry-run tests cover disabled wallet/token/pair/router, daily limits, gas, slippage, price impact, quote failure, and decimals.

Validation commands: `pnpm test:unit`, `pnpm test:integration`, `pnpm validate`.

## Phase C: UI Completion

Goal: Make operator workflows clear and difficult to misuse.

Tasks:

- Use API runtime status for mode badges.
- Add demo/fake Basescan badge.
- Add global emergency pause button.
- Add explicit API error states.
- Add pending transaction/approval exposure panels.

Files likely touched: `apps/web/components/*`, `apps/web/app/(app)/*`, `apps/web/lib/api.ts`.

Acceptance criteria:

- Playwright demo happy path passes.
- Live mode warning cannot be hidden.

Validation commands: `pnpm build`, Playwright E2E.

## Phase D: Telegram and Observability

Goal: Make notifications and failures auditable.

Tasks:

- Add notification delivery audit records.
- Add request/job IDs.
- Add queue and Telegram failure metrics.
- Add rate limiting to test sends.

Files likely touched: `apps/api/src/notifications/*`, `apps/api/src/scheduler/*`, `apps/api/src/db/schema.ts`.

Acceptance criteria:

- Failed Telegram send is visible in logs/audit without exposing token.

Validation commands: `pnpm test`, mocked Telegram failure integration.

## Phase E: Live Execute-once Hardening

Goal: Make one manual live swap safer.

Tasks:

- Add idempotency key and per-wallet nonce lock.
- Add pending transaction table/state.
- Validate quote chain/router/spender/tokens/raw amount/min-out/value.
- Add native value support.
- Add confirmation depth and replacement/stuck policies.

Files likely touched: `apps/api/src/trades/*`, `apps/api/src/transactions/*`, `apps/api/src/quote/*`, `apps/api/src/db/schema.ts`.

Acceptance criteria:

- Concurrent duplicate live requests cannot submit duplicate txs.
- Wrong quote target/spender/value is rejected in tests.

Validation commands: `pnpm test`, mocked RPC live guardrail suite.

## Phase F: Scheduler Hardening

Goal: Keep scheduler dry-run reliable; defer live scheduler.

Tasks:

- Redesign recurrence and non-draining stop.
- Add distributed singleton/lock.
- Add job history and retry policy.
- Keep live scheduled execution blocked until Phase E is complete.

Files likely touched: `apps/api/src/scheduler/*`, `apps/api/src/db/schema.ts`, scheduler UI.

Acceptance criteria:

- Scheduler restart does not lose pending jobs.
- Dry-run recurrence is deterministic and tested with Redis.

Validation commands: Redis/BullMQ integration tests.

## Phase G: Server Deployment Readiness

Goal: Prepare for remote/server deployment only after live local hardening.

Tasks:

- Add production Dockerfile/compose or deployment manifests.
- Add reverse proxy/TLS docs.
- Add secret manager/KMS configuration.
- Add backup/restore scripts.
- Add monitoring and alerting.

Files likely touched: new `infra/`, docs, config, health checks.

Acceptance criteria:

- Server deployment checklist passes without exposing API unauthenticated.

Validation commands: deployment smoke test, restore drill, security checklist.

