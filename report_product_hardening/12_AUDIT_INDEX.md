# Audit Index

Date: 2026-05-20

Scope: Index of product hardening reports, recommended reading order, current verdict, top blockers, Phase 1 file map, and validation plan.

Verdict/status: COMPLETE. Twelve Markdown reports were generated under `report_product_hardening/`.

## Generated Reports

1. `01_CURRENT_PRODUCT_VERDICT.md`
2. `02_LIVE_AUTOMATION_BLOCKERS.md`
3. `03_RISK_ENGINE_GAPS.md`
4. `04_SCHEDULER_QUEUE_NONCE_GAPS.md`
5. `05_PROVIDER_AND_0X_GAPS.md`
6. `06_CUSTODY_SECURITY_GAPS.md`
7. `07_AUTH_RATE_LIMIT_AND_RBAC_GAPS.md`
8. `08_OBSERVABILITY_TRACE_GAPS.md`
9. `09_TEST_CI_DEPLOYMENT_GAPS.md`
10. `10_IMPLEMENTATION_SEQUENCE.md`
11. `11_NO_GO_CONDITIONS.md`
12. `12_AUDIT_INDEX.md`

## Recommended Reading Order

1. `01_CURRENT_PRODUCT_VERDICT.md`
2. `11_NO_GO_CONDITIONS.md`
3. `10_IMPLEMENTATION_SEQUENCE.md`
4. `03_RISK_ENGINE_GAPS.md`
5. `04_SCHEDULER_QUEUE_NONCE_GAPS.md`
6. `06_CUSTODY_SECURITY_GAPS.md`
7. `05_PROVIDER_AND_0X_GAPS.md`
8. `08_OBSERVABILITY_TRACE_GAPS.md`
9. `07_AUTH_RATE_LIMIT_AND_RBAC_GAPS.md`
10. `09_TEST_CI_DEPLOYMENT_GAPS.md`

## Top Blockers

- CRITICAL / MISSING: Live scheduler must remain blocked.
- HIGH / PARTIAL: Aggregate risk uses raw token units as USD in current paths.
- HIGH / MISSING: Manual live execute-once does not enforce aggregate risk immediately before signing.
- HIGH / MISSING: Production custody is not implemented.
- HIGH / PARTIAL: Token/router/spender verification needs operator-proof workflow before live use.
- HIGH / PARTIAL: BullMQ retry/backoff/DLQ is insufficient for live jobs.
- HIGH / PARTIAL: Nonce replacement/cancel/reorg handling is incomplete and operator-guided.
- MEDIUM / PARTIAL: Provider load behavior is unproven for 5+/10+ wallets.
- MEDIUM / PARTIAL: E2E CI failures are masked.
- MEDIUM / PARTIAL: Trace propagation from UI request to queue job to tx hash to notification is incomplete.

## Phase 1 Files Likely To Be Touched

- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/0013_normalized_risk_accounting.sql`
- `apps/api/drizzle/meta/_journal.json`
- `apps/api/src/risk/aggregate-risk.ts`
- `apps/api/src/risk/aggregate-risk.test.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/trades/live-execution.test.ts`
- `apps/api/src/trades/idempotency-routes.integration.test.ts`
- `apps/api/src/strategy/planner.ts`
- `apps/api/src/strategy/planner.test.ts`
- `apps/api/src/strategy/plan-routes.ts`
- `apps/api/src/strategy/plan-routes.integration.test.ts`
- `apps/api/src/quote/types.ts`
- `apps/api/src/quote/quote-validation.ts`
- `apps/api/src/quote/quote-validation.test.ts`
- `packages/shared/src/amounts.ts`
- `packages/shared/src/schemas/quote.ts`
- `packages/shared/src/schemas/trade.ts`
- `apps/web/lib/types.ts`
- `apps/web/components/dry-run-trade-card.tsx`
- `apps/web/components/execute-once-card.tsx`

## Validation Commands Recommended After Phase 1

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/risk/aggregate-risk.test.ts
pnpm --filter @base-orchestrator/api test -- apps/api/src/trades/live-execution.test.ts apps/api/src/trades/idempotency-routes.integration.test.ts
pnpm --filter @base-orchestrator/api test -- apps/api/src/strategy/planner.test.ts apps/api/src/strategy/plan-routes.integration.test.ts
pnpm test
pnpm e2e
```

## Overall Verdict

Local demo and dry-run are viable. Tiny manual live is not ready until Phase 1 risk fixes and operator verification are complete. Live automation is a hard no-go. Server deployment is only acceptable for private dry-run until custody, secrets, CI, drills, and observability gates are hardened.

## Suggested Next Prompt

`Implement Phase 1: normalized aggregate risk accounting and pre-sign manual live risk gate, with tests only; keep live scheduler disabled.`
