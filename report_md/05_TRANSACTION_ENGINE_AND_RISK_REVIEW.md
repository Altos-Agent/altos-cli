# Transaction Engine And Risk Review

Date: 2026-05-13  
Scope: Dry-run, quote validation, approvals, execute-once, idempotency, wallet locking, nonce/finality states, and live-readiness blockers.  
Verdict/status: DRY_RUN_READY; manual live path PARTIAL; automation not ready.

## Dry-Run Flow

Dry-runs are implemented in `apps/api/src/strategy/planner.ts` and `plan-routes.ts`. They validate wallet/pair/rule state, amount parsing, risk limits, quote provider output, router/token/allowance-target checks, stale quote rules, price impact, and slippage. Dry-runs do not decrypt private keys, sign, or submit transactions.

## Quote Flow

`apps/api/src/quote/quoteEngine.ts` supports a mock provider and 0x scaffold. Mock is safe/offline for demo. 0x requires configured endpoint/API key and operator verification before live use.

## Strict Quote Validation

`apps/api/src/quote/quote-validation.ts` validates Base chain, enabled router/spender, token address matches, exact raw sell amount, positive buy amount, transaction target/data for live, router target match, native value policy, quote age, price impact, slippage, and optional function selector allowlist.

## Approval / Revoke Flow

`apps/api/src/approvals/approval-service.ts` reads ERC20 allowances, requires verified token/router addresses, rejects disabled routers, parses exact approval amount, rejects zero/negative/unlimited approvals by default, and records approval/revoke transactions. Live approval/revoke shares demo/dry-run/confirmation gates and signs only after gates pass.

## Execute-Once Flow

`apps/api/src/trades/trade-routes.ts` requires `Idempotency-Key`, checks emergency pause, vault unlock for live signing, same-wallet pending prevention, request replay/conflict handling, quote retrieval, risk policy, strict quote validation, allowance checks, optional auto-approval only when both env and request enable it, simulation, private-key address assertion, signing, transaction storage, notification, and wallet-lock release policy.

## Idempotency

Implemented in `apps/api/src/transactions/transaction-manager.ts`. Same idempotency key and same request hash replays; same key with different request is rejected. Live-impacting approval/revoke idempotency is covered by integration tests.

## Per-Wallet Lock / Nonce Policy

`pending_wallet_locks` serializes live-impacting requests per wallet. Submitted, pending-finality, and stuck transactions block new live writes for the same wallet. Nonce/from metadata is stored when available. Replacement sending is intentionally not implemented.

## Same-Wallet Pending Prevention

Implemented for non-demo/non-dry-run live execution through both active wallet locks and submitted/pending-finality/stuck transaction checks.

## Confirmation / Finality / Stuck / Dropped / Replaced

`apps/api/src/transactions/confirmation.ts` maps receipts to confirmed-pending-finality or finalized based on `CONFIRMATIONS_REQUIRED`; failed receipts become failed. Missing receipts become stuck then dropped based on configured timeouts. `REPLACED` is present in the state model, but reliable replacement detection remains future/operator-guided.

## Reorg Limitations

Finalized transaction refresh returns an operator reorg audit placeholder. There is no deep reorg monitoring or automatic rollback of downstream state.

## Slippage / Gas / Price Impact Checks

Slippage and price impact are enforced through quote/risk validation. Gas/daily loss limits exist in risk and scheduler policy. A comprehensive live gas-price cap and MEV/slippage execution analysis was not live-tested.

## Token Amount / Decimal Correctness

`apps/api/src/blockchain/amounts.test.ts` covers decimal parsing/formatting for 6 and 18 decimals, small decimal amounts, invalid decimals, excess precision, and invalid metadata. Scientific notation is rejected.

## Remaining Blockers Before Tiny Manual Live Test

| Gate | Status |
| --- | --- |
| Dedicated low-value wallet imported and backed up | OPERATOR_REQUIRED |
| Real token/router/allowance target verified | OPERATOR_REQUIRED |
| Live quote provider configured and tested safely | NOT_TESTED |
| Backup/restore drill with vault master key | NOT_TESTED |
| Emergency pause drill | NOT_TESTED |
| Manual Basescan/finality observation process | OPERATOR_REQUIRED |
| Revoke step rehearsed | NOT_TESTED |

## Remaining Blockers Before Any Automation

Live scheduler is intentionally rejected. Before live automation: implement and test replacement/nonce recovery, distributed locks, wallet-level exposure aggregation, monitoring/alerts, production custody, operator approvals, replay protection across workers, and incident runbooks.

