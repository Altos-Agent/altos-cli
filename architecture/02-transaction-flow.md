# Transaction Flow

## Dry-Run Flow

Owner files:

- `apps/api/src/strategy/plan-routes.ts`
- `apps/api/src/strategy/planner.ts`
- `apps/api/src/strategy/trade-context.ts`
- `apps/api/src/scheduler/scheduled-dry-run.ts`

Flow:

1. Client sends `POST /api/plans/dry-run` with `walletId`, `pairId`, `sellAmountDisplay`, and `mode=DRY_RUN_ONLY`.
2. API loads wallet, pair, wallet-pair rule, tokens, routers, daily stats, and quote.
3. Planner validates quote freshness and never decrypts keys, signs, or submits transactions.
4. Risk checks run.
5. Accepted result creates a `DRY_RUN` transaction row.
6. Rejected result creates a `REJECTED` transaction row with reasons.
7. No private key is decrypted. No transaction is signed or submitted.

## Quote Flow

Owner files:

- `apps/api/src/quote/quoteEngine.ts`
- `apps/api/src/quote/types.ts`
- `apps/api/src/quote/quote-validation.ts`
- `apps/api/src/quote/providers/mock.ts`
- `apps/api/src/quote/providers/zeroX.ts`

Flow:

1. Quote provider is selected by `QUOTE_PROVIDER`.
2. `mock` is default, offline, and returns no calldata.
3. Provider output must parse through the normalized quote schema before downstream use.
4. Normalized quotes include Base `chainId`, provider, router name/address, spender or allowance target, sell/buy token addresses, raw sell/buy amounts, optional min-buy amount, gas estimate, price impact, slippage, transaction target/calldata/value, timestamp, and expiry.
5. `zeroX` calls a configured 0x endpoint and normalizes `buyAmountRaw`, `sellAmountRaw`, gas, allowance target, transaction target, calldata, value, warnings, timestamp/expiry, and bounded raw response.
6. Quote data feeds dry-run planning, live safety checks, allowance checks, request hashes, calldata hashes, and transaction record metadata.

0x quotes require verified token contract addresses and network access. The quote provider is not a trust boundary; returned chain, targets, token addresses, amounts, slippage, value, and allowance targets must still pass live quote validation.

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
5. Approval amount is converted with token decimals using bigint-safe parsing.
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
2. Client submits `POST /api/trades/execute-once` with `sellAmountDisplay` and `confirmLiveExecution=true`.
3. Early gates reject unless `DRY_RUN=false` and live confirmation is present.
4. API loads trade context and quote.
5. `evaluateTradeRisk` runs wallet, pair, token, router, limit, gas, slippage, price-impact, and quote freshness checks.
6. `evaluateLiveExecutionSafety` runs strict quote validation: Base chain only, enabled router/spender, sell/buy token address match, raw sell amount match, positive buy amount, unexpired quote, pair slippage and price-impact caps, router target match, and native value policy.
7. Live calldata must include hex transaction data and an enabled-router `txTo`. Calldata hash is stored. Function selector allowlists are enforced when configured for a router; deeper calldata semantic safety is still limited unless a router-specific decoder exists.
8. ERC20 allowance is checked if quote includes `allowanceTarget`.
9. If allowance is insufficient, the response status is `NEEDS_APPROVAL` unless auto-approval is explicitly requested and enabled.
10. Transaction simulation runs with `basePublicClient.call`.
11. The encrypted private key is decrypted in memory.
12. The transaction is signed and sent with viem wallet client.
13. A transaction row is stored as `SUBMITTED`; signing/send failure stores `FAILED`; rejected gates store `REJECTED`.

Native value swaps are explicitly disabled by default with `NATIVE_VALUE_SWAPS_ENABLED=false` and `MAX_NATIVE_VALUE_WEI=0`. Any quote with `txValue > 0` is rejected unless future work enables native value swaps with a reviewed cap.

## Scheduled Flow

Owner files:

- `apps/api/src/scheduler/scheduler-service.ts`
- `apps/api/src/scheduler/scheduler-policy.ts`
- `apps/api/src/scheduler/trade.worker.ts`
- `apps/api/src/scheduler/scheduled-dry-run.ts`

Flow:

1. `POST /api/scheduler/start` acquires the `scheduler-loop` DB lease, creates a scheduler run record, starts BullMQ workers, and starts a heartbeat-backed scheduling loop.
2. The loop scans `wallet_schedules` for due dry-run schedules. `SCHEDULER_LIVE_EXECUTION=true` is rejected because live scheduled execution is not implemented.
3. Eligibility checks schedule enabled, wallet-level emergency pause, wallet active state, daily run count, daily loss, strategy profile, `nextRunAt`, and existing pending scheduler jobs.
4. First enabled allowed pair rule is selected.
5. A `scheduler_jobs` row is created before `tradeQueue` receives a `scheduled-trade` job. Existing `PENDING` or `STARTED` jobs suppress duplicate enqueue.
6. Trade worker rejects live scheduled jobs before planning or signing.
7. Dry-run scheduled jobs call `createScheduledDryRun`, creating a `DRY_RUN` or `REJECTED` transaction row only.
8. After completion, the worker marks the scheduler job finished, updates `lastRunAt`, `lastStatus`, `failureCount`, and deterministic `nextRunAt`, then enqueues confirmation and notification jobs.
9. `POST /api/scheduler/pause` and `POST /api/scheduler/stop` do not drain queues. Queue purge is only available through the explicit `POST /api/scheduler/purge` maintenance route with typed confirmation.

## Confirmation Watcher Flow

Owner files:

- `apps/api/src/transactions/confirmation.ts`
- `apps/api/src/scheduler/confirmation.worker.ts`

Flow:

1. Manual refresh calls `POST /api/transactions/:id/refresh`, or scheduler start enqueues submitted transactions.
2. Refresh requires an existing transaction with `txHash` and `status=SUBMITTED` or `CONFIRMED_PENDING_FINALITY`.
3. Base receipt is requested by transaction hash.
4. If receipt is unavailable, submitted age is evaluated against `TX_STUCK_AFTER_MINUTES` and `TX_DROPPED_AFTER_MINUTES`.
5. Success receipt below `CONFIRMATIONS_REQUIRED` updates status to `CONFIRMED_PENDING_FINALITY` and stores `confirmation_count`.
6. Success receipt at or above `CONFIRMATIONS_REQUIRED` updates status to `FINALIZED` and stores `finalized_block`.
7. Reverted receipt updates status to `FAILED`.
8. Gas used and Basescan URL are updated from the receipt.
9. Daily wallet stats, wallet-lock release, and Telegram confirmation/failure notification happen only after final `FINALIZED`/legacy `CONFIRMED` or `FAILED`.
10. Confirmation worker requeues unavailable receipts after 60 seconds.
11. Confirmation worker can pause a wallet and schedule after daily failed transaction threshold is reached.
12. If a submitted transaction exceeds `TX_STUCK_AFTER_MINUTES` without a receipt, status becomes `STUCK` with operator guidance in `dropped_reason`.
13. If a missing receipt exceeds `TX_DROPPED_AFTER_MINUTES`, status becomes `DROPPED`; this is an operator-review state because replacement detection is not automatic.
14. Finalized transactions inside `TX_REORG_LOOKBACK_BLOCKS` return an operator-guided reorg audit placeholder on refresh. Automatic reorg repair and replacement transaction submission are intentionally not implemented.

## Nonce And Pending Wallet Policy

Owner files:

- `apps/api/src/transactions/transaction-manager.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/approvals/approval-routes.ts`
- `apps/api/src/db/schema.ts`

Policy:

- Live-impacting wallet writes create idempotency-scoped request records and `pending_wallet_locks`.
- Live execute-once, approve, and revoke reject by default when the same wallet has a `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, or `STUCK` transaction.
- Submitted transaction rows store `nonce` and `from_address` when available from the signing path.
- `pending_wallet_locks.nonce` reserves a nonce when the submission path can provide one.
- `STUCK` and `DROPPED` states require operator review. The system does not send speed-up, cancel, or replacement transactions.

## Failure Cases

- Missing wallet or pair: API returns not found and no signing occurs.
- Global dry-run enabled during live request: transaction stored as `REJECTED`.
- Missing request confirmation: transaction stored as `REJECTED`.
- Quote provider failure: transaction stored as `REJECTED`.
- Stale quote: transaction stored as `REJECTED`.
- Price impact over pair limit: transaction stored as `REJECTED`.
- Mock quote in live mode: rejected because no `txTo`/`txData`.
- Unknown transaction target or allowance target: rejected by router whitelist.
- Quote chain/router/spender/token/amount/value mismatch: rejected before simulation.
- Quote `txValue > 0`: rejected by default because native value swaps are disabled.
- Risk check failure: rejected with explicit reasons.
- Insufficient allowance: rejected with `NEEDS_APPROVAL` and required approval metadata.
- Approval simulation/signing/submission failure: approval transaction stored as `FAILED`.
- Swap simulation failure: transaction stored as `REJECTED`.
- Swap signing/submission failure: transaction stored as `FAILED`.
- Receipt not available before stuck timeout: transaction remains `SUBMITTED`.
- Receipt missing past stuck timeout: transaction becomes `STUCK` and blocks later live writes for the wallet.
- Receipt missing past dropped timeout: transaction becomes `DROPPED` with operator-review guidance.
- Receipt successful but not deep enough: transaction becomes `CONFIRMED_PENDING_FINALITY`.
- Receipt successful with required confirmations: transaction becomes `FINALIZED`.
- Finalized transaction inside reorg lookback: refresh reports operator-guided reorg review; no automatic rollback occurs.
- Receipt reverted: transaction becomes `FAILED`.
- Telegram send failure: logged or swallowed by caller; operation result is not rolled back.
- Redis down: scheduler status/start/jobs can fail; manual API flows still operate if Postgres and API dependencies are healthy.
