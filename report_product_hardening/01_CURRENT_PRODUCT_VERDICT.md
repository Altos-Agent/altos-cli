# Current Product Verdict

Date: 2026-05-20

Scope: Read-only product hardening audit of the current Base Orchestrator repository, including API, web, shared schemas, migrations, scheduler, transaction engine, risk engine, vault/custody, notifications, CI, Docker, docs, and tests.

Verdict/status: PARTIAL. The product is credible for local demo and dry-run orchestration. It is not ready for live automation, and tiny manual live execution still needs hard gates and operator verification before use.

## Overall Verdict

- INFO / IMPLEMENTED: Local-first Fastify API, Next.js web app, Postgres schema, Redis/BullMQ dry-run scheduler, auth/session/CSRF, encrypted local wallet vault, token/pair/router management, quote abstraction, dry-run planner, manual execute-once guardrails, approval/revoke flows, transaction status tracking, Telegram notifications, metrics, Docker examples, and CI are present.
- HIGH / PARTIAL: Manual live execute-once has meaningful per-request safeguards, but it does not enforce aggregate USD risk immediately before signing and uses local-file custody for signing.
- CRITICAL / MISSING: Live scheduler execution is intentionally not implemented and must remain disabled.
- HIGH / PARTIAL: Production deployment posture exists as examples and docs, but server hardening, secret management, alerting drills, backup/restore drills, and provider load proof are incomplete.

## Readiness

- Local demo readiness: GO. `README.md`, `package.json`, demo seed, mock quotes, and UI routes support local demo mode.
- Dry-run readiness: GO with limitations. `apps/api/src/strategy/plan-routes.ts`, `apps/api/src/strategy/planner.ts`, and `apps/api/src/scheduler/scheduled-dry-run.ts` support dry-run planning/scheduling, but aggregate USD accounting is flawed.
- Tiny manual live readiness: NO-GO until Phase 1 gates pass. Main blockers are aggregate risk normalization/enforcement, token/router verification workflow, provider verification, and custody constraints.
- Live automation readiness: HARD NO-GO. `apps/api/src/scheduler/scheduler-service.ts` rejects `SCHEDULER_LIVE_EXECUTION=true`, and `apps/api/src/scheduler/trade.worker.ts` throws for `mode === "LIVE"`.
- Server deployment readiness: PARTIAL for private dry-run only. `docker-compose.prod.example.yml`, `infra/nginx/nginx.conf`, and docs exist, but production live-funds hardening is incomplete.

## Verified Prior Findings

- CRITICAL / IMPLEMENTED AS BLOCK: Live scheduler remains blocked by `SchedulerService.start()` and `processTradeJob()`.
- HIGH / STILL_ACCURATE: `apps/api/src/risk/aggregate-risk.ts` computes `totalPendingUsd` and `totalTradeUsd` from `transactions.amountIn`, which is raw token units, not normalized USD.
- HIGH / STILL_ACCURATE: `apps/api/src/trades/trade-routes.ts` does not call `checkAggregateRisk()` before signing/submission.
- HIGH / STILL_ACCURATE: `apps/api/src/vault/providers/kms.ts` and `external-signer.ts` are stubs; real production custody is missing.
- HIGH / STILL_ACCURATE: `apps/api/src/scheduler/queues.ts` uses `attempts: 1`, with no real DLQ/backoff policy.
- MEDIUM / STILL_ACCURATE: Provider load behavior is only scaffolded through `apps/api/src/cli/dry-run-load-test.ts` and docs; no audited local 5+/10+ wallet run was performed in this phase.
- MEDIUM / STILL_ACCURATE: `.github/workflows/ci.yml` runs `pnpm e2e || true` with `continue-on-error: true`, so E2E failures are masked.
- MEDIUM / STILL_ACCURATE: Sensitive route rate limiting is partial. Login and vault unlock have limits; execute-once, approvals/revokes, emergency pause, scheduler controls, and management mutations do not have explicit route-level throttles.
- MEDIUM / STILL_ACCURATE: Trace continuity is partial. Request IDs exist, but async queue jobs often receive `getCurrentRequestId()` from non-request contexts, so UI request to queue job to tx hash to notification is not consistently preserved.

## Product Posture

- The system should remain dry-run by default.
- Live execution should remain explicit, manual, low-value, and gated.
- Live automation should remain disabled until all no-go conditions in `11_NO_GO_CONDITIONS.md` are resolved.
- The product should be described as controlled execution orchestration, not wash trading, volume manipulation, sybil activity, or evasive behavior.

## Suggested Validation After Phase 1

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @base-orchestrator/api test -- apps/api/src/risk/aggregate-risk.test.ts apps/api/src/trades/live-execution.test.ts apps/api/src/trades/idempotency-routes.integration.test.ts
pnpm e2e
pnpm docker:compose:prod:check
```
