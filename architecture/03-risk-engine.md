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
- `apps/api/src/risk/routerWhitelist.ts`
- `apps/api/src/risk/tokenWhitelist.ts`
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
- Dry-run planning requires global `DRY_RUN=true`.
- Live execution requires `DRY_RUN=false`, live confirmation, calldata, target whitelist, allowance target whitelist, and simulation.

## Limit Hierarchy

For a trade amount to pass, it must satisfy every applicable limit:

1. Wallet limit: `wallets.max_trade_usd`.
2. Pair limit: `pairs.max_trade_usd`.
3. Wallet-pair-rule limit: `wallet_pair_rules.max_trade_usd`.
4. Wallet daily trade limit: `wallets.max_daily_trades`.
5. Wallet daily loss limit: `wallets.max_daily_loss_usd`.
6. Wallet gas limit: `wallets.max_gas_usd`.
7. Pair slippage limit: `pairs.max_slippage_bps`.

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
- `maxPriceImpactBps`, stored for future use.
- `preferredRouter`.
- `fallbackRouter`.

Management-time pair enabling requires enabled tokens and enabled routers. Pairs containing high-risk tokens require a positive pair max trade size.

## Router Whitelist

Router owner table: `routers`.

Router checks:

- Router records are scoped by chain ID.
- Router must be enabled to be used by enabled pairs.
- Quote `txTo` must match an enabled router address before live sending.
- Quote `allowanceTarget` must match an enabled router address before live sending or allowance checks.
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

Seeded token rows intentionally have `address=null` and `enabled=false`. Do not enable token rows until addresses and decimals are independently verified for Base Mainnet.

## Daily Stats

Daily stats owner table: `daily_wallet_stats`.

Current usage:

- `trade-context.ts` derives today's transaction count from transaction rows and combines it with daily stats.
- `confirmation.ts` increments `txCount` and `gasSpentUsd` after submitted transactions confirm or fail from a receipt.
- Scheduler policy reads daily count and estimated loss before enqueuing wallet schedules.

Limitations:

- `estimatedLossUsd` is not yet updated by a mark-to-market or realized PnL engine.
- Gas USD estimates rely on quote/planner inputs and are not a complete cost accounting system.
- Native ETH value is not modeled for live swaps yet; current execute-once sends `value=0`.
