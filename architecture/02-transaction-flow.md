# Transaction Flow

## Dry-Run Flow

Owner files:

- `apps/api/src/strategy/plan-routes.ts`
- `apps/api/src/strategy/planner.ts`
- `apps/api/src/strategy/trade-context.ts`
- `apps/api/src/scheduler/scheduled-dry-run.ts`

Flow:

1. Client sends `POST /api/plans/dry-run` with `walletId`, `pairId`, `amountIn`, and `mode=DRY_RUN_ONLY`.
2. API loads wallet, pair, wallet-pair rule, tokens, routers, daily stats, and quote.
3. Planner requires global `DRY_RUN=true`.
4. Risk checks run.
5. Accepted result creates a `DRY_RUN` transaction row.
6. Rejected result creates a `REJECTED` transaction row with reasons.
7. No private key is decrypted. No transaction is signed or submitted.

## Quote Flow

Owner files:

- `apps/api/src/quote/quoteEngine.ts`
- `apps/api/src/quote/types.ts`
- `apps/api/src/quote/providers/mock.ts`
- `apps/api/src/quote/providers/zeroX.ts`

Flow:

1. Quote provider is selected by `QUOTE_PROVIDER`.
2. `mock` is default, offline, and returns no calldata.
3. `zeroX` calls a configured 0x endpoint and normalizes `buyAmount`, `sellAmount`, gas, allowance target, transaction target, calldata, warnings, and bounded raw response.
4. Quote data feeds dry-run planning, live safety checks, allowance checks, and transaction record metadata.

0x quotes require verified token contract addresses and network access. The quote provider is not a trust boundary; returned targets and allowance targets must still pass router whitelist checks.

## Approval Flow

Owner files:

- `apps/api/src/approvals/approval-routes.ts`
- `apps/api/src/approvals/approval-service.ts`
- `apps/api/src/approvals/approval-policy.ts`

Flow:

1. Client reads allowance through `GET /api/wallets/:id/allowances`.
2. Client submits exact approval through `POST /api/wallets/:id/approve` or revoke through `POST /api/wallets/:id/revoke`.
3. Server rejects live writes unless `DRY_RUN=false` and live confirmation is present.
4. Token and router records must have verified addresses; router must be enabled.
5. Approval amount is converted with token decimals.
6. Unlimited approval is rejected unless `ALLOW_UNLIMITED_APPROVAL=true`.
7. The wallet key is decrypted in memory.
8. ERC20 `approve` is simulated through viem and then submitted.
9. A transaction row is stored as `APPROVE` or `REVOKE` with `SUBMITTED`, `REJECTED`, or `FAILED`.

## Execute Once Flow

Owner files:

- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/trades/live-execution.ts`

Flow:

1. Client checks `GET /api/trades/live-status`.
2. Client submits `POST /api/trades/execute-once` with `confirmLiveExecution=true`.
3. Early gates reject unless `DRY_RUN=false` and live confirmation is present.
4. API loads trade context and quote.
5. `evaluateTradeRisk` runs wallet, pair, token, router, limit, gas, and slippage checks.
6. `evaluateLiveExecutionSafety` requires quote target, hex calldata, router whitelist match, allowance target whitelist match, and simulation intent.
7. ERC20 allowance is checked if quote includes `allowanceTarget`.
8. If allowance is insufficient, the response status is `NEEDS_APPROVAL` unless auto-approval is explicitly requested and enabled.
9. Transaction simulation runs with `basePublicClient.call`.
10. The encrypted private key is decrypted in memory.
11. The transaction is signed and sent with viem wallet client.
12. A transaction row is stored as `SUBMITTED`; signing/send failure stores `FAILED`; rejected gates store `REJECTED`.

Current limitation: live native value is hardcoded to zero. Do not use live native-value swaps until quote normalization and execution support explicit transaction value.

## Scheduled Flow

Owner files:

- `apps/api/src/scheduler/scheduler-service.ts`
- `apps/api/src/scheduler/scheduler-policy.ts`
- `apps/api/src/scheduler/trade.worker.ts`
- `apps/api/src/scheduler/scheduled-dry-run.ts`

Flow:

1. `POST /api/scheduler/start` creates BullMQ workers.
2. Service enqueues eligible wallet schedules.
3. Eligibility checks schedule enabled, emergency pause, wallet active state, daily trade count, daily loss, profile, and minimum interval.
4. First enabled allowed pair rule is selected.
5. `tradeQueue` receives a `scheduled-trade` job.
6. Trade worker rejects live scheduled jobs because live scheduled execution is not implemented.
7. Dry-run scheduled jobs call `createScheduledDryRun`.
8. Confirmation and notification jobs are enqueued after scheduled dry-run completion.

## Confirmation Watcher Flow

Owner files:

- `apps/api/src/transactions/confirmation.ts`
- `apps/api/src/scheduler/confirmation.worker.ts`

Flow:

1. Manual refresh calls `POST /api/transactions/:id/refresh`, or scheduler start enqueues submitted transactions.
2. Refresh requires an existing transaction with `txHash` and `status=SUBMITTED`.
3. Base receipt is requested by transaction hash.
4. If receipt is unavailable, status remains `SUBMITTED`.
5. Success receipt updates status to `CONFIRMED`.
6. Reverted receipt updates status to `FAILED`.
7. Gas used, Basescan URL, and daily wallet stats are updated.
8. Telegram confirmation/failure notification is attempted.
9. Confirmation worker requeues unavailable receipts after 60 seconds.
10. Confirmation worker can pause a wallet and schedule after daily failed transaction threshold is reached.

## Failure Cases

- Missing wallet or pair: API returns not found and no signing occurs.
- Global dry-run enabled during live request: transaction stored as `REJECTED`.
- Missing request confirmation: transaction stored as `REJECTED`.
- Quote provider failure: transaction stored as `REJECTED`.
- Mock quote in live mode: rejected because no `txTo`/`txData`.
- Unknown transaction target or allowance target: rejected by router whitelist.
- Risk check failure: rejected with explicit reasons.
- Insufficient allowance: rejected with `NEEDS_APPROVAL` and required approval metadata.
- Approval simulation/signing/submission failure: approval transaction stored as `FAILED`.
- Swap simulation failure: transaction stored as `REJECTED`.
- Swap signing/submission failure: transaction stored as `FAILED`.
- Receipt not available: transaction remains `SUBMITTED`.
- Receipt reverted: transaction becomes `FAILED`.
- Telegram send failure: logged or swallowed by caller; operation result is not rolled back.
- Redis down: scheduler status/start/jobs can fail; manual API flows still operate if Postgres and API dependencies are healthy.
