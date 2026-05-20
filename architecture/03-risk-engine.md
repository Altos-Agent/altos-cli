# Risk Engine

## Risk Checks

Risk checks are split between management-time policy and trade-time evaluation.

Management-time policy owner files:

- `apps/api/src/management/risk-policy.ts`
- `apps/api/src/management/management-service.ts`
- `apps/api/src/management/management-routes.ts`

Trade-time policy owner files:

- `apps/api/src/strategy/planner.ts`
- `apps/api/src/risk/limits.ts`
- `apps/api/src/risk/gas.ts`
- `apps/api/src/risk/slippage.ts`
- `apps/api/src/risk/price-impact.ts`
- `apps/api/src/risk/quote-freshness.ts`
- `apps/api/src/risk/routerWhitelist.ts`
- `apps/api/src/risk/tokenWhitelist.ts`
- `apps/api/src/quote/quote-validation.ts`
- `apps/api/src/strategy/walletProfiles.ts`

Checks currently enforced:

- Wallet must be `ACTIVE`.
- Pair must be enabled.
- Wallet-pair rule must exist and be enabled.
- Input and output tokens must be enabled.
- Requested, preferred, fallback, quote router, transaction target, and allowance target must resolve to enabled router records.
- Amount must fit wallet, pair, and wallet-pair-rule limits.
- Daily transaction count must be below wallet daily trade limit.
- Daily estimated loss must be below wallet loss limit.
- Estimated gas must fit wallet gas limit.
- Estimated slippage must fit pair slippage limit.
- Quote price impact must fit pair price-impact limit when the quote provider supplies it.
- Quote timestamp must be present and unexpired.
- Normalized quote schema must validate before live execution.
- Live quotes must be for Base `chainId=8453`.
- Live quote router, spender, and transaction target must resolve to enabled router records.
- Live quote sell/buy token addresses must match the selected pair.
- Live quote raw sell amount must match the operator request.
- Live quote buy amount must be greater than zero.
- Live quote `txValue` must be zero while native value swaps are disabled.
- Dry-run planning never signs or submits transactions and remains available as a dry-run endpoint even if live mode is otherwise configured.
- Live execution requires `DRY_RUN=false`, live confirmation, calldata, target whitelist, allowance target whitelist, and simulation.
- Live-impacting wallet writes require no same-wallet `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, or `STUCK` transaction unless a future explicit replacement flow is implemented.

## Limit Hierarchy

For a trade amount to pass, it must satisfy every applicable limit:

1. Wallet limit: `wallets.max_trade_usd`.
2. Pair limit: `pairs.max_trade_usd`.
3. Wallet-pair-rule limit: `wallet_pair_rules.max_trade_usd`.
4. Wallet daily trade limit: `wallets.max_daily_trades`.
5. Wallet daily loss limit: `wallets.max_daily_loss_usd`.
6. Wallet gas limit: `wallets.max_gas_usd`.
7. Pair slippage limit: `pairs.max_slippage_bps`.
8. Pair price-impact limit: `pairs.max_price_impact_bps`, when quote data includes price impact.
9. Native value limit: `NATIVE_VALUE_SWAPS_ENABLED=false` rejects all positive quote value; `MAX_NATIVE_VALUE_WEI` is reserved for future enabled native-value swaps.

The effective limit is the most restrictive non-null limit. Null means the specific limit is not configured; it does not override other limits.

## Wallet Limits

Wallet owner table: `wallets`.

Wallet-level risk fields:

- `status`: `ACTIVE`, `PAUSED`, or `DISABLED`.
- `maxTradeUsd`: maximum single trade amount.
- `maxDailyTrades`: maximum transaction count for the day.
- `maxDailyLossUsd`: daily loss threshold used by planner/scheduler policy.
- `maxGasUsd`: maximum estimated gas in USD.

Wallets imported through the vault default to `PAUSED`; an operator must explicitly resume them.

## Pair Limits

Pair owner table: `pairs`.

Pair-level risk fields:

- `enabled`.
- `maxTradeUsd`.
- `maxSlippageBps`, defaulted conservatively by management code.
- `maxPriceImpactBps`, enforced when quote data includes `priceImpactBps`.
- `preferredRouter`.
- `fallbackRouter`.

Management-time pair enabling requires enabled tokens and enabled routers. Pairs containing high-risk tokens require a positive pair max trade size.

## Router Whitelist

Router owner table: `routers`.

Router checks:

- Router records are scoped by chain ID.
- Router must be enabled to be used by enabled pairs.
- Quote `routerAddress`, when provided, must match an enabled router.
- Quote `txTo` must match an enabled router address before live sending.
- Quote `allowanceTarget` must match an enabled router address before live sending or allowance checks.
- Quote calldata function selectors are checked only when an allowlist is configured for the router. Current validation does not fully decode arbitrary router calldata; router-specific decoding remains a live-readiness blocker.
- Approval and revoke writes require a verified router address and enabled router.

Seeded router rows intentionally have `address=null` and `enabled=false`. Do not enable router rows until addresses are independently verified for Base Mainnet.

## Token Whitelist

Token owner table: `tokens`.

Token checks:

- Tokens are scoped by chain ID.
- Trades require enabled input and output tokens.
- High-risk tokens require a positive token max trade size before enabling.
- Pairs containing high-risk tokens require a positive pair max trade size.
- Approval reads/writes require verified token contract addresses.
- Token decimals must be integer metadata in the range `0..36`; raw token amount storage and approvals use token-specific decimals.

Seeded token rows intentionally have `address=null` and `enabled=false`. Do not enable token rows until addresses and decimals are independently verified for Base Mainnet.

## Daily Stats

Daily stats owner table: `daily_wallet_stats`.

Current usage:

- `trade-context.ts` derives today's transaction count from transaction rows and combines it with daily stats.
- `confirmation.ts` increments `txCount` and `gasSpentUsd` after submitted transactions reach final `CONFIRMED` or `FAILED` from a receipt.
- Scheduler policy reads daily count and estimated loss before enqueuing wallet schedules.

Limitations:

- `estimatedLossUsd` is not yet updated by a mark-to-market or realized PnL engine.
- Gas USD estimates rely on quote/planner inputs and are not a complete cost accounting system.
- Native ETH value swaps are explicitly blocked by default. Quotes with `txValue > 0` are rejected unless future work enables `NATIVE_VALUE_SWAPS_ENABLED` with a reviewed `MAX_NATIVE_VALUE_WEI` cap.

## Aggregate Risk Engine

Global cross-wallet risk tracking prevents correlated exposure from exceeding safe thresholds across all wallets.

Owner table: `aggregate_risk_limits`.

Aggregate risk stats are computed from transaction rows daily and tracked via `aggregate_risk_stats`.

### Aggregate Limits

| Limit | Field | Default | Description |
|-------|-------|---------|-------------|
| Daily trade cap | `maxDailyTradeUsd` | `10000` | Total USD volume of all trades per day |
| Daily gas cap | `maxDailyGasUsd` | `500` | Total gas spend in USD per day |
| Pending trade cap | `maxPendingTradeUsd` | `2000` | Total USD of all pending/submitted trades |
| Max pending wallets | `maxPendingWallets` | `10` | Number of wallets with pending transactions |
| Failed tx threshold | `maxFailedTxPerDay` | `5` | Max failed transactions before blocking |
| Enabled | `enabled` | `true` | Master toggle for aggregate checks |

### Aggregate Checks

Every dry-run plan call evaluates aggregate risk before recording a transaction:

1. **Daily trade cap**: `stats.totalTradeUsd + proposedTradeUsd <= limits.maxDailyTradeUsd`
2. **Daily gas cap**: `stats.totalGasUsd + proposedGasUsd <= limits.maxDailyGasUsd`
3. **Pending trade cap**: `pending.totalPendingUsd + proposedTradeUsd <= limits.maxPendingTradeUsd`
4. **Pending wallet count**: `pending.pendingWalletCount + 1 <= limits.maxPendingWallets`
5. **Failed tx threshold**: `stats.failedTxCount < limits.maxFailedTxPerDay`

If any check fails, the plan is rejected with a reason array that includes the aggregate limit exceeded.

Rejections are recorded in `transactions.errorMessage` and trigger a Telegram `dry-run rejected` notification.

### Stats Computation

Stats are updated via `upsertAggregateStats(db)` after every accepted dry-run:

- `totalTradeUsd` = sum of `ABS(amountIn)` for today's confirmed/failed transactions
- `totalGasUsd` = sum of `ABS(gasUsd)` for today's transactions
- `activeWalletCount` = count of wallets with status `ACTIVE`
- `failedTxCount` = count of today's transactions with status `FAILED`

Pending stats are computed live from transaction rows with status `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, or `STUCK`.

### API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/risk/aggregate` | Full status: limits + stats + enabled |
| GET | `/api/risk/aggregate/stats` | Today's stats only |
| GET | `/api/risk/aggregate/limits` | Current limits |
| PATCH | `/api/risk/aggregate/limits` | Update limits (partial) |
| POST | `/api/risk/aggregate/refresh-stats` | Force recompute stats |

### Dashboard UI

Aggregate risk card appears on the dashboard when `aggregateRisk.enabled = true`:

- Daily trade cap usage: used / limit
- Daily gas cap usage: used / limit
- Pending exposure: used / limit
- Pending wallets: count / limit
- Failed tx today: count / limit, highlighted red when at threshold

## Route Schemas

API route params, query, bodies, and required headers are validated before service code through shared Zod schemas in `packages/shared/src/schemas` and route helpers in `apps/api/src/http/validation.ts`. The schemas enforce Base-only `chainId=8453`, EVM address shape, token decimals range, non-negative numeric limits, slippage/price-impact basis points in `0..10000`, decimal-string trade amounts, private-key shape, encrypted backup shape, auth login shape, vault unlock shape, no-body mutation contracts, and pair token direction integrity. Invalid route params and unexpected JSON bodies on no-body mutating routes return `400`.
