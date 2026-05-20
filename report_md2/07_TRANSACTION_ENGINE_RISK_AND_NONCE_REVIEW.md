# Transaction Engine Risk And Nonce Review

Date: 2026-05-20

Scope: Dry-run planner, quote abstraction, strict quote validation, slippage/gas/price impact, amount/decimal correctness, approval/revoke, manual execute-once, idempotency, locks, nonce policy, pending blocking, replacement, reorg, stuck/dropped, and live blockers.

Verdict/status: PARTIAL. Manual guarded execution exists, but tiny live use remains operator-gated and automation is not ready.

## Dry-Run Planner

- IMPLEMENTED: `planDryRunTrade` in `apps/api/src/strategy/planner.ts`.
- IMPLEMENTED: Creates `DRY_RUN` or `REJECTED` transaction rows in `apps/api/src/strategy/plan-routes.ts`.
- IMPLEMENTED: No key decrypt, no signing, no chain mutation.
- IMPLEMENTED: Aggregate risk is checked for dry-run planning.

## Quote Provider Abstraction

- IMPLEMENTED: `MockQuoteProvider` and `ZeroXQuoteProvider`.
- IMPLEMENTED: `getQuote` parses provider output with `normalizedQuoteSchema`.
- PARTIAL: 0x live behavior and current API response semantics were not externally verified in this audit.

## Strict Quote Validation

- IMPLEMENTED: `validateQuoteForExecution` checks Base chain id, router/spender enabled, token address match, sell amount match, live calldata, live target, native value policy, expiry, slippage, price impact, buy amount, and optional selector allowlist.
- PARTIAL: Router-specific calldata semantic decoding is not implemented.
- PARTIAL: Function selector allowlist is optional and not populated by seed data.

## Slippage, Gas, Price Impact

- IMPLEMENTED: Pair slippage and price-impact caps exist.
- IMPLEMENTED: Wallet gas USD cap exists.
- PARTIAL: Mock quote gas and dry-run slippage are placeholder values.
- PARTIAL: 0x provider sets price impact to `null`; therefore price-impact cap is only useful if provider supplies it.
- PARTIAL: Gas USD accounting is not authoritative PnL.

## Token Amount And Decimal Correctness

- IMPLEMENTED: `parseTokenAmount` and `formatTokenAmount` use bigint-safe decimal conversion.
- IMPLEMENTED: Decimals are restricted to 0 through 36.
- IMPLEMENTED: Tests cover 6/18 decimals and excess precision.
- HIGH / OPERATOR_REQUIRED: Correct live decimals still require independent verification before enabling tokens.

## Approval/Revoke Safety

- IMPLEMENTED: Exact approval and revoke-to-zero flows exist.
- IMPLEMENTED: Unlimited approval disabled by default.
- IMPLEMENTED: Router and token addresses must be valid before approval service proceeds.
- PARTIAL: Approval service checks address validity and router enabled, but does not explicitly require `verificationStatus=VERIFIED` in `loadApprovalContext`; verification is indirectly enforced elsewhere and should be made explicit.

## Manual Execute-Once Safety

- IMPLEMENTED: Early reject in demo/dry-run/missing confirmation.
- IMPLEMENTED: Emergency pause and vault lock gates.
- IMPLEMENTED: Idempotency and per-wallet lock.
- IMPLEMENTED: Quote and calldata hashing.
- IMPLEMENTED: Allowance check and simulation before signing.
- PARTIAL: Aggregate risk is not a clear pre-signing gate.
- NOT_TESTED: No live transaction was submitted during this audit.

## Idempotency

- IMPLEMENTED: `transaction_requests.idempotency_key` unique index.
- IMPLEMENTED: Same key and same request replays result if transaction exists.
- IMPLEMENTED: Same key with different request returns 409.
- PARTIAL: Idempotency keys are caller-generated and entropy is not enforced.

## Per-Wallet Lock And Nonce Policy

- IMPLEMENTED: `pending_wallet_locks` table stores active lock per wallet.
- IMPLEMENTED: Live paths call `assertNoPendingLiveTransaction` for `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, and `STUCK`.
- PARTIAL: Locks store `nonce`, but execute-once currently does not set nonce in transaction record or lock after send.
- PARTIAL: Wallet lock TTL can expire before finality if confirmation worker/manual refresh is delayed.

## Pending Transaction Blocking

- IMPLEMENTED: Same wallet cannot submit another live write while submitted/pending-finality/stuck rows exist.
- PARTIAL: `DROPPED` and `REPLACED` require operator review before resuming, but policy enforcement depends on status and operator behavior.

## Replacement Handling

- PARTIAL: Missing receipt policy flags replacement detection as `OPERATOR_REVIEW_REQUIRED` when nonce/from address exist.
- MISSING: No automatic replacement transaction lookup.
- MISSING: No cancel/replace sender.
- MISSING: No nonce reconciliation UI beyond transaction status and docs.

## Reorg/Stuck/Dropped Policy

- IMPLEMENTED: Pending-finality requires configured confirmations.
- IMPLEMENTED: Missing receipts can become `STUCK` or `DROPPED`.
- PARTIAL: Finalized transaction reorg detection is operator-guided within lookback.
- MISSING: Automatic reorg repair.

## Tiny Live Blockers

- HIGH / OPERATOR_REQUIRED: Verify token addresses, decimals, router, spender, and 0x target on Base.
- HIGH / OPERATOR_REQUIRED: Use a dedicated low-value wallet only.
- HIGH / OPERATOR_REQUIRED: Run emergency pause, backup/restore, Telegram, quote validation, exact approval, revoke, and finality checks.
- HIGH / NOT_TESTED: No live 0x quote or transaction was tested here.

## Live Automation Blockers

- CRITICAL / MISSING: Live scheduler is not implemented.
- HIGH / PARTIAL: Aggregate risk not uniformly enforced before live signing.
- HIGH / MISSING: Provider load/rate-limit handling for 10+ wallets is not proven.
- HIGH / MISSING: Nonce replacement/cancel/reorg automation is absent.
- HIGH / PARTIAL: Custody is local-file.

## Acceptance Criteria

- A tiny manual live test reaches `FINALIZED` and records no duplicate transaction.
- Transaction record includes nonce/from/to/calldata/quote/simulation hashes for every submitted live tx.
- Wallet lock survives until finality or explicit operator-reviewed terminal state.
- Aggregate risk is enforced immediately before signing.
- Replacement/reorg runbook is tested with simulated stuck/dropped states.
