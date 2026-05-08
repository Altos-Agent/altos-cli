# Risk Engine Review
Date: 2026-05-08
Repository audit scope: Risk checks, limit hierarchy, wallet limits, pair limits, router whitelist, token whitelist, daily stats, gas/slippage/price impact/approval controls, and emergency pause.
Verdict/status: PARTIAL. Foundational checks exist; live-mode risk policy needs expansion and stronger enforcement.

## Existing Risk Checks

| Check | Status | Owner file |
|---|---|---|
| Wallet must be `ACTIVE` | IMPLEMENTED | `apps/api/src/strategy/walletProfiles.ts` |
| Pair must be enabled | IMPLEMENTED | `apps/api/src/strategy/planner.ts` |
| Wallet pair rule must be enabled | IMPLEMENTED | `apps/api/src/strategy/walletProfiles.ts` |
| Token whitelist/enabled check | IMPLEMENTED | `apps/api/src/risk/tokenWhitelist.ts` |
| Router resolution/whitelist | IMPLEMENTED | `apps/api/src/risk/routerWhitelist.ts` |
| Allowance target whitelist | IMPLEMENTED | `apps/api/src/risk/routerWhitelist.ts` |
| Wallet, pair, wallet-pair max trade | IMPLEMENTED | `apps/api/src/risk/limits.ts` |
| Daily tx count | PARTIAL | `apps/api/src/risk/limits.ts`, `apps/api/src/transactions/confirmation.ts` |
| Daily loss limit | PARTIAL | Schema and checks exist; loss computation is rudimentary. |
| Gas cap | PARTIAL | Dry-run gas cap exists; live gas policy needs more fields. |
| Slippage cap | PARTIAL | Slippage check exists; quote min-out enforcement needs hardening. |
| Price impact cap | MISSING | Pair field exists but not enforced in planner. |
| Emergency pause | IMPLEMENTED | `apps/api/src/scheduler/scheduler-service.ts`, UI component. |

## Limit Hierarchy

Current intended hierarchy:

1. Global environment gates: `DEMO_MODE`, `DRY_RUN`, `REQUIRE_LIVE_CONFIRMATION`.
2. Wallet status and wallet limits.
3. Token enabled/risk-level policy.
4. Pair enabled, pair limits, slippage.
5. Wallet-pair rule enabled and max trade.
6. Router whitelist and allowance target whitelist.
7. Daily stats limits.

This hierarchy is a good start. Missing: explicit global daily cap, global max live amount, operator approval workflow for changing limits, and immutable audit trail for live-mode config changes.

## Missing Risk Checks

| Severity | Status | Missing check | Fix |
|---|---|---|---|
| HIGH | MISSING | Price impact cap enforcement. | Integrate quote price impact into `evaluateTradeRisk`. |
| HIGH | MISSING | Quote expiry/staleness. | Reject old quotes and record quote timestamp. |
| HIGH | MISSING | Per-wallet pending transaction cap. | Block new live txs while pending tx exists unless replacing. |
| HIGH | MISSING | Max approval amount by token/router/wallet. | Add approval-specific limits. |
| HIGH | MISSING | Native value cap. | Validate and cap `value` for native swaps. |
| MEDIUM | MISSING | RPC health and degraded mode. | Block live execution if RPC health is poor. |
| MEDIUM | MISSING | Global emergency pause. | Add app-wide pause that blocks all live writes and scheduler jobs. |

## Wallet Limits

Wallets support `maxTradeUsd`, `maxDailyTrades`, `maxDailyLossUsd`, and `maxGasUsd`. These are useful but should be required for active live wallets. A wallet should not be set `ACTIVE` for live mode unless all required limits are present and low by default.

## Pair Limits

Pairs support `maxTradeUsd`, `maxSlippageBps`, `maxPriceImpactBps`, preferred router, and fallback router. Pair enabling policy exists, but router references are text names. Use router IDs or addresses to reduce ambiguity.

## Router Whitelist

Routers have chain ID, name, address, enabled flag, risk level, and notes. Approval service validates router address before live approvals. Management service should also enforce address validity and checksum normalization at creation/update time.

## Token Whitelist

Tokens have chain ID, symbol, name, address, decimals, risk level, max trade, and enabled flag. Missing validation: decimals range, address format, address checksum, native token sentinel rules, and verified-source metadata.

## Daily Stats

`daily_wallet_stats` tracks tx count, gas spent, and estimated loss. Current updates happen on confirmation refresh for submitted transactions. Dry-run rejected/accepted rows and pending submitted rows affect daily logic through context logic, but this should be documented and tested more deeply.

## Recommended Risk Policy

| Policy | Requirement |
|---|---|
| Live mode default | Disabled unless explicit config, auth, and vault unlock are present. |
| Wallet activation | Require max trade, max daily trades, max gas, and max loss. |
| Approval | Exact approvals only; unlimited stays disabled; approval max cannot exceed wallet/pair cap. |
| Quote | Must validate chain, router target, allowance target, sell/buy tokens, raw sell amount, min out, slippage, and timestamp. |
| Pending txs | One pending live tx per wallet unless explicit replacement policy. |
| Emergency pause | Global and wallet-level pause must block approvals, execute-once, scheduler, and auto-approval. |

