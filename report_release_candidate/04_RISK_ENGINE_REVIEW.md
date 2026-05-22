# 04 — Risk Engine Review

**Date:** 2026-05-21

---

## Aggregate Risk Engine — USD Normalization

### Status: ✅ CORRECTLY IMPLEMENTED

| Field | Location | Usage |
|-------|----------|-------|
| `amountInUsd` | `transactions.amount_in_usd` | Daily + pending exposure |
| `amountOutUsd` | `transactions.amount_out_usd` | Output notional when available |
| `gasUsd` | `transactions.gas_usd` | Daily gas exposure |
| `usdPriceSource` | `transactions.usd_price_source` | Audit trail |
| `riskCheckedAt` | `transactions.risk_checked_at` | Timestamp |
| `aggregateRiskSnapshotJson` | `transactions.aggregate_risk_snapshot_json` | Decision record |

**The engine reads `amountInUsd` exclusively — never raw token amounts.** Integration test confirms raw amounts are ignored (`amountInRaw: "1000000000000000000000000000000"` with `amountInUsd: "25.00"` aggregates to 45.00, not the raw value).

---

## Aggregate Risk Limits

### Status: ✅ ALL 5 IMPLEMENTED

| Limit | Code | Check Location |
|-------|------|----------------|
| Max daily trade USD | `AGGREGATE_DAILY_TRADE_LIMIT_EXCEEDED` | aggregate-risk.ts:169 |
| Max daily gas USD | `AGGREGATE_DAILY_GAS_LIMIT_EXCEEDED` | aggregate-risk.ts:180 |
| Max pending trade USD | `AGGREGATE_PENDING_TRADE_LIMIT_EXCEEDED` | aggregate-risk.ts:191 |
| Max pending wallets | `AGGREGATE_PENDING_WALLET_LIMIT_EXCEEDED` | aggregate-risk.ts:202 |
| Max failed tx/day | `AGGREGATE_FAILED_TX_LIMIT_EXCEEDED` | aggregate-risk.ts:212 |

All limits return named error codes, are serializable in the risk snapshot, and are checked before `decryptPrivateKey` is called.

---

## Per-Wallet Limits

### Status: ✅ IMPLEMENTED

| Limit | Check Location |
|-------|---------------|
| `wallet.maxTradeUsd` | limits.ts:27 |
| `wallet.maxGasUsd` | gas.ts:20 |
| `wallet.maxDailyTrades` | limits.ts:38 |
| `wallet.maxDailyLossUsd` | limits.ts:44 |
| Per-wallet-per-pair `maxTradeUsd` | limits.ts:33 |

---

## Pair-Level Limits

### Status: ✅ IMPLEMENTED

| Limit | Check Location |
|-------|---------------|
| `pairs.maxTradeUsd` | limits.ts:29 |
| `pairs.maxSlippageBps` | slippage.ts |
| `pairs.maxPriceImpactBps` | price-impact.ts |

---

## Missing: Pair Concentration Limit

### Status: ❌ NOT IMPLEMENTED

Document states "Pair concentration limits" as a category, but no cross-wallet pair tracking exists. A single pair (e.g., USDC→WETH) could absorb 100% of the global daily trade limit through one wallet, leaving nothing for other pairs.

**Impact:** Uncontrolled pair concentration risk. Would be needed if live scheduler is ever enabled.

---

## Missing: Global Daily Transaction Count

### Status: ❌ NOT IMPLEMENTED

`aggregateRiskLimits` has no `maxDailyTx` field. Wallet-level `maxDailyTrades` exists but no aggregate-level tx count cap. A malicious or buggy scenario could execute thousands of tiny-value trades that don't breach USD limits.

---

## Pre-Sign Risk Gate in Execute-Once

### Status: ✅ IMPLEMENTED

In `execute-once`, the sequence is: **quote → simulation → aggregate risk check → reject if not allowed → only then decrypt private key**.

Integration test confirms `decryptPrivateKey` is never called when aggregate risk rejects (`execute-once-aggregate-risk.integration.test.ts:286`).

---

## Pre-Sign Risk Gate in Scheduler Worker

### Status: ❌ NOT IMPLEMENTED — HARD BLOCKER

The scheduler's execution path calls `planDryRunTrade` which runs preflight simulation but does NOT call `checkAggregateRisk` before signing. The aggregate risk gate only exists in the execute-once path.

**If the live scheduler were enabled**, it would have no pre-sign risk protection. This is the most critical gap for live automation.

---

## Readiness Check 6 — Weakness

### Status: ⚠️ WEAK

`check6_aggregateRiskUsdNormalized` passes if `parseFloat(limits?.maxDailyTradeUsd ?? "0") > 0`. This only verifies the limit config exists and is non-zero — it does NOT verify that transactions actually have valid USD values.

A deployment where `amountInUsd` is null on all transactions would pass this check while the risk engine operates on garbage data.

---

## Hard Blockers in This Area

| # | Blocker | Fix Required |
|---|---------|-------------|
| H1 | Scheduler execution path has NO pre-sign aggregate risk gate | Add `checkAggregateRisk` to scheduler worker path |
| H2 | Readiness check 6 passes with garbage data | Add validation that transactions have valid `amountInUsd` |
| H3 | No pair concentration limit | Add cross-wallet pair tracking |
| H4 | No global daily tx count limit | Add `maxDailyTx` to aggregateRiskLimits |