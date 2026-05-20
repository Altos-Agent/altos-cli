# Risk Engine Gaps

Date: 2026-05-20

Scope: Per-wallet limits, pair limits, token/router verification, aggregate risk, USD normalization, pending exposure, pre-sign enforcement, and later implementation files.

Verdict/status: HIGH / PARTIAL. Per-trade risk checks exist, but aggregate risk accounting is not product-grade because raw token units are treated as USD and manual live signing does not perform an aggregate risk check.

## Implemented Risk Controls

- IMPLEMENTED: `apps/api/src/strategy/planner.ts` checks wallet active state, pair enablement, wallet-pair rule enablement, token whitelist, router whitelist, allowance target, trade limits, gas limits, slippage, price impact, and quote freshness.
- IMPLEMENTED: `apps/api/src/risk/tokenWhitelist.ts` rejects disabled, placeholder, blocked, and unverified tokens.
- IMPLEMENTED: `apps/api/src/risk/routerWhitelist.ts` rejects disabled, blocked, placeholder, and unverified routers and allowance targets.
- IMPLEMENTED: `apps/api/src/risk/quote-freshness.ts`, `price-impact.ts`, `slippage.ts`, `gas.ts`, and `limits.ts` provide focused guardrails.
- IMPLEMENTED: `apps/api/src/risk/aggregate-risk.ts` defines aggregate limits and checks.
- IMPLEMENTED: `apps/api/src/db/schema.ts` includes `aggregateRiskLimits` and `aggregateRiskStats`.

## Critical Gaps

- HIGH / PARTIAL: `aggregate-risk.ts` uses `SUM(ABS(transactions.amountIn))` for `totalTradeUsd` and `pendingUsd`. `transactions.amountIn` stores raw token amount with token decimals, not USD notional.
- HIGH / MISSING: `apps/api/src/trades/trade-routes.ts` does not call `checkAggregateRisk()` immediately before live signing.
- HIGH / MISSING: There is no risk reservation record that prevents two concurrent accepted requests from both passing aggregate limits before either writes a submitted transaction.
- HIGH / PARTIAL: `toAmountUsdEstimate()` in `planner.ts` treats `sellAmountDisplay` as USD. That only works for USD-denominated stablecoin flows and fails for arbitrary multi-pair execution.
- HIGH / PARTIAL: `quote.providers.zeroX.ts` sets `estimatedGas.gasUsd` to `"0"` and `priceImpactBps` to `null`, weakening aggregate gas and price impact enforcement.
- MEDIUM / PARTIAL: Aggregate stats are updated after accepted dry-runs, not as a reservation ledger with lifecycle states.

## Phase 1 Implementation Map

Likely touched files:

- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/0013_normalized_risk_accounting.sql`
- `apps/api/drizzle/meta/_journal.json`
- `apps/api/src/risk/aggregate-risk.ts`
- `apps/api/src/risk/aggregate-risk.test.ts`
- `apps/api/src/strategy/planner.ts`
- `apps/api/src/strategy/planner.test.ts`
- `apps/api/src/strategy/plan-routes.ts`
- `apps/api/src/strategy/plan-routes.integration.test.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/trades/live-execution.test.ts`
- `apps/api/src/trades/idempotency-routes.integration.test.ts`
- `apps/api/src/quote/types.ts`
- `apps/api/src/quote/quoteEngine.ts`
- `apps/api/src/quote/quote-validation.ts`
- `apps/api/src/quote/quote-validation.test.ts`
- `packages/shared/src/schemas/quote.ts`
- `packages/shared/src/schemas/trade.ts`
- `packages/shared/src/amounts.ts`
- `apps/web/lib/types.ts`
- `apps/web/components/dry-run-trade-card.tsx`
- `apps/web/components/execute-once-card.tsx`

## Required Design Changes

- Add explicit normalized fields such as `notionalUsd`, `gasUsd`, `pendingExposureUsd`, and `riskReservedUsd`.
- Stop deriving USD exposure from `transactions.amountIn`.
- Create a pre-sign risk gate for manual execute-once after quote validation and before approval/signing/submission.
- Prefer a reservation model with statuses such as `RESERVED`, `CONSUMED`, `RELEASED`, and `EXPIRED`.
- Require quote/provider metadata sufficient to compute USD notional for non-stablecoin pairs.
- Treat unknown USD notional as rejection for live execution.

## Acceptance Criteria

- CRITICAL: Aggregate risk checks never use raw token units as USD.
- CRITICAL: Manual live execute-once performs aggregate risk check and reservation immediately before signing.
- CRITICAL: Concurrent requests cannot overrun aggregate limits.
- HIGH: Tests cover non-18-decimal tokens, stablecoin and non-stablecoin pairs, stale quotes, unknown USD notional, pending exposure, and concurrent reservation conflicts.
- HIGH: UI displays whether a live request passed per-wallet risk, per-pair risk, and aggregate risk separately.

## Validation Commands

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/risk/aggregate-risk.test.ts
pnpm --filter @base-orchestrator/api test -- apps/api/src/trades/live-execution.test.ts apps/api/src/trades/idempotency-routes.integration.test.ts
pnpm --filter @base-orchestrator/api test -- apps/api/src/strategy/planner.test.ts apps/api/src/strategy/plan-routes.integration.test.ts
pnpm test
```
