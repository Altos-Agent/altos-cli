# Next Phase Implementation Plan

Date: 2026-05-20

Scope: Phase-based roadmap from current state, critical fixes, tiny manual live preparation, post-test hardening, multi-wallet dry-run scaling, live automation gates, server deployment hardening, touched files, acceptance criteria, validation commands, and no-go conditions.

Verdict/status: ACTION_PLAN. Do not proceed to live funds until Phase 1 and Phase 2 gates pass.

## Phase 1 - Critical Safety Fixes

Goal: Close high-risk gaps before any live test.

Tasks:

- Enforce aggregate risk in `apps/api/src/trades/trade-routes.ts` immediately before simulation/signing.
- Normalize aggregate exposure using USD fields, not raw token units.
- Require `verificationStatus=VERIFIED` explicitly in approval service for token/router.
- Add rate limits for vault unlock, execute-once, approve, revoke, backup export/import, scheduler start, emergency pause.
- Require metrics token in production.
- Remove or gate legacy SHA-256 password hashes.

Files likely touched:

- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/risk/aggregate-risk.ts`
- `apps/api/src/approvals/approval-service.ts`
- `apps/api/src/http/rate-limit-provider.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/auth/password.ts`
- tests under matching modules

Acceptance criteria:

- Tests prove live execute-once rejects aggregate cap breach before signing.
- Approval/revoke fail if token/router is not `VERIFIED`.
- Production boot fails without metrics token.

Validation commands:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`

No-go conditions:

- Any live path can sign without aggregate check, verified records, vault unlock, idempotency key, and confirmation.

## Phase 2 - Tiny Manual Live Preparation

Goal: Produce operator-ready evidence for one tiny live test.

Tasks:

- Add a live-readiness verification artifact for token/router/spender/0x quote.
- Run backup/restore drill on disposable DB.
- Run emergency pause drill.
- Run Telegram test delivery.
- Run read-only 0x quote validation with verified Base addresses.
- Create stop/rollback checklist.

Files likely touched:

- `docs/`
- `plan/`
- maybe `report_md2/` or future report folder

Acceptance criteria:

- `17_TINY_MANUAL_LIVE_READINESS_CHECKLIST.md` can move from FAIL/BLOCKED to `READY_FOR_OPERATOR_REVIEW`.
- No private keys or real secrets are documented.

Validation commands:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- Drill scripts on disposable environment only.

No-go conditions:

- Any unverified address or unknown quote target.

## Phase 3 - Tiny Manual Live Test

Goal: Execute one low-value operator-reviewed transaction safely.

Tasks:

- Import dedicated low-value wallet.
- Set `DEMO_MODE=false`, `DRY_RUN=false`, `SCHEDULER_LIVE_EXECUTION=false`.
- Unlock vault for test window.
- Exact approve, execute once, observe finality, revoke, lock vault, restore dry-run.
- Record tx hash, Basescan verification, finality, Telegram delivery, and ops summary.

Files likely touched:

- No source required.
- New report artifact only.

Acceptance criteria:

- Transaction reaches `FINALIZED`.
- No duplicate transaction.
- Revoke succeeds.
- Wallet returns paused or dry-run-safe posture.

Validation commands:

- Manual API/UI flow.
- `pnpm test` after config restored.

No-go conditions:

- Simulation fails, quote target mismatch, stuck/dropped tx, provider inconsistency, or alerting unavailable.

## Phase 4 - Post-Test Hardening

Goal: Convert tiny live learnings into stronger controls.

Tasks:

- Improve error messages and transaction detail for live flow.
- Add nonce and from/to/calldata metadata completeness.
- Add stuck/dropped recovery UI.
- Add audit review for live actions.

Files likely touched:

- `apps/api/src/transactions/*`
- `apps/api/src/trades/*`
- `apps/web/app/(app)/transactions/*`
- `apps/web/components/*`

Acceptance criteria:

- Operator can diagnose pending/stuck/dropped tx without reading DB.

Validation commands:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm e2e` in normal dev workflow

No-go conditions:

- UI implies automation readiness.

## Phase 5 - Multi-Wallet Dry-Run Scaling

Goal: Prove 5+/10+ wallet dry-run reliability without live signing.

Tasks:

- Run provider load test with mock and 0x.
- Add queue dashboards and failure triage.
- Tune provider timeouts/backoff.

Files likely touched:

- `apps/api/src/cli/dry-run-load-test.ts`
- `apps/api/src/scheduler/*`
- `apps/api/src/ops/*`
- docs for load test results

Acceptance criteria:

- 10 wallets x configured iterations meet latency/error-rate targets.

Validation commands:

- `pnpm --filter @base-orchestrator/api load-test -- --readOnly ...`
- `pnpm test`

No-go conditions:

- Provider 429, stale quotes, or queue failures without alerts.

## Phase 6 - Live Automation Design Gates

Goal: Decide if live scheduler should ever be implemented.

Tasks:

- Implement external signer/KMS.
- Build nonce reservation/reconciliation.
- Build schedule occurrence idempotency.
- Build DLQ/backoff/circuit breaker.
- Add threat-model tests.

Files likely touched:

- `apps/api/src/vault/providers/*`
- `apps/api/src/scheduler/*`
- `apps/api/src/transactions/*`
- `apps/api/src/risk/*`

Acceptance criteria:

- All gates in `plan/06_LIVE_SCHEDULER_IMPLEMENTATION_GATES.md` pass.

Validation commands:

- Full CI, E2E, provider load, docker smoke, chaos/restart tests.

No-go conditions:

- Local-file custody, hidden E2E failures, untested provider load, or missing aggregate enforcement.

## Phase 7 - Server Deployment Hardening

Goal: Safe private/server dry-run deployment.

Tasks:

- Replace placeholders.
- Harden auth boundary.
- Require metrics token and alert webhook.
- Run container runtime smoke.
- Run backup/restore and emergency pause drills.

Files likely touched:

- `docker-compose.prod.example.yml`
- `infra/nginx/nginx.conf`
- `.github/workflows/ci.yml`
- docs

Acceptance criteria:

- Compose config, image builds, runtime health, drills, and monitoring pass.

Validation commands:

- `pnpm docker:compose:prod:check`
- `docker build ...api...`
- `docker build ...web...`
- compose health smoke in disposable environment

No-go conditions:

- Placeholder secrets, public metrics, local-file custody for funds.
