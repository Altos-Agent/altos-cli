# Aggregate Risk And Provider Load Review

Date: 2026-05-20

Scope: Per-wallet limits, aggregate exposure, daily/global limits, pending exposure, RPC/provider rate limit testing, quote load tests, 5+/10+ wallet readiness, and remaining risk gaps.

Verdict/status: PARTIAL. Aggregate risk tables and dry-run checks exist, but live enforcement and provider load proof are insufficient.

## Per-Wallet Limits

- IMPLEMENTED: Wallets have max trade USD, max daily trades, max daily loss USD, and max gas USD.
- IMPLEMENTED: Wallet-pair rules have per-pair max trade and daily trade caps.
- IMPLEMENTED: Planner checks wallet, pair, and wallet-pair limits.
- PARTIAL: Daily loss is not real PnL; it is a placeholder accounting field.

## Cross-Wallet Aggregate Exposure Tracking

- IMPLEMENTED: `aggregate_risk_limits` and `aggregate_risk_stats` tables exist.
- IMPLEMENTED: `/api/risk/aggregate` and related stats/limits routes exist.
- IMPLEMENTED: Dry-run planning calls `checkAggregateRisk`.
- HIGH / PARTIAL: Manual live execute-once does not clearly call `checkAggregateRisk` immediately before signing.

## Daily/Global Limits

- IMPLEMENTED: Limits include max daily trade USD, max daily gas USD, max pending trade USD, max pending wallets, max failed tx per day.
- PARTIAL: Current default limits are generic and not operator-calibrated for tiny live testing.
- PARTIAL: Aggregate stats update based on transaction rows but are not authoritative financial accounting.

## Pending Exposure

- IMPLEMENTED: Pending statuses considered include `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, and `STUCK`.
- HIGH / PARTIAL: Pending USD calculation sums `transactions.amountIn`, which is raw token units in many paths, not normalized USD.
- HIGH: This can materially misstate aggregate exposure for tokens with different decimals.

## Provider/RPC Rate Limit Testing

- PARTIAL: `apps/api/src/cli/dry-run-load-test.ts` exists and docs mention provider load tests.
- NOT_TESTED: Provider load test was not run in this audit.
- NOT_TESTED: 0x provider was not called against live network.
- NOT_TESTED: Base RPC finality/load behavior was not measured.

## Quote Provider Load Test

- PARTIAL: CLI supports dry-run load testing and is designed to refuse unsafe live mode.
- MISSING: No validation artifact from a recent 5+ or 10+ wallet run was found in this audit.

## 5+ / 10+ Wallet Test Readiness

- Dry-run 5+ wallets: PARTIAL. Infrastructure exists; test not run.
- Dry-run 10+ wallets: PARTIAL. CLI exists; provider behavior not proven.
- Live 5+ wallets: FAIL. Live automation missing and provider/custody/risk not ready.
- Live 10+ wallets: FAIL. Hard no-go.

## Remaining Risk Gaps

- HIGH / PARTIAL: Aggregate risk not enforced in manual live route.
- HIGH / PARTIAL: Pending USD uses raw token units.
- HIGH / NOT_TESTED: 0x provider concurrency and rate limit behavior unknown.
- HIGH / NOT_TESTED: RPC simulation/send/receipt latency unknown under load.
- MEDIUM / PARTIAL: No alert on aggregate pending approaching limit was verified.
- MEDIUM / PARTIAL: Failed provider responses are not richly classified for operator triage.

## Actionable Fixes

- Normalize aggregate trade and pending exposure into USD at transaction-write time.
- Store quote-derived USD amount separately from raw token amount.
- Enforce aggregate risk for execute-once, approvals where relevant, and future live workers.
- Add provider error classes: timeout, 429, schema mismatch, stale quote, target mismatch.
- Run documented load tests for mock and 0x providers.

## Acceptance Criteria

- `checkAggregateRisk` executes after quote validation and immediately before live signing.
- Aggregate pending exposure is accurate across token decimals.
- 10-wallet dry-run load test with target provider meets p95/p99 and error thresholds.
- Alerts fire when aggregate pending exceeds 80 percent of configured cap.
