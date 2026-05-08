# Transaction Engine Audit
Date: 2026-05-08
Repository audit scope: Dry-run, quote, approval, execute-once, scheduled execution, confirmation watcher, nonce, gas, slippage, failure handling, idempotency, and replay risks.
Verdict/status: PARTIAL. Dry-run is usable; live transaction engine is not ready.

## Dry-run Flow

Status: IMPLEMENTED.

Flow owner files: `apps/api/src/strategy/plan-routes.ts`, `apps/api/src/strategy/planner.ts`, `apps/api/src/strategy/trade-context.ts`.

The dry-run endpoint loads wallet/pair/token/router context, requests a quote when possible, evaluates risk checks, stores `DRY_RUN` or `REJECTED` transaction rows, and can notify Telegram.

Gap: dry-run is rejected when `DRY_RUN=false`. This is defensible as a safety mode but product-wise odd; operators often need dry-runs before live tests.

## Quote Flow

| Status | Review |
|---|---|
| IMPLEMENTED | Mock provider exists and is safe for demo. |
| PARTIAL | 0x provider exists but needs stronger live validation of chain, spender, calldata, value, slippage, min output, expiry, and response schema. |

## Approval Flow

Status: PARTIAL.

Strengths:

- Approvals reject while `DEMO_MODE=true`.
- Approvals reject while `DRY_RUN=true`.
- Live confirmation is required by default.
- Unlimited approval is disabled unless explicitly enabled.
- Revocation uses `approve(spender, 0)`.

Gaps:

| Severity | Gap | Fix |
|---|---|---|
| HIGH | No nonce locking across approval and swap paths. | Add per-wallet transaction lock. |
| HIGH | No idempotency key for approval requests. | Require idempotency key and store request hash. |
| MEDIUM | Generic failure handling hides internal root causes. | Store redacted internal error codes in audit logs. |

## Execute-once Flow

Status: PARTIAL.

Owner files: `apps/api/src/trades/trade-routes.ts`, `apps/api/src/trades/live-execution.ts`.

Positive controls:

- Demo mode blocks live.
- Dry-run default blocks live.
- Explicit live confirmation is required.
- Risk checks run before submission.
- Transaction simulation runs before signing.
- Router target and allowance target are checked against enabled routers.

Major gaps:

| Severity | Gap | Required fix |
|---|---|---|
| HIGH | No idempotency and double-click protection. | Add idempotency table and web request key. |
| HIGH | No nonce manager. | Add per-wallet lock and nonce/pending tx tracking. |
| HIGH | `txValue` is hard-coded to zero. | Add native token handling and validate quote value. |
| HIGH | Quote calldata is not decoded or semantically checked. | Validate recipient, router function, sell/buy token, amount, min-out where possible. |
| HIGH | Amount storage conversion uses generic scaling in trade storage. | Use token decimals for raw unit conversion. |

## Scheduled Flow

Status: PARTIAL.

`apps/api/src/scheduler/trade.worker.ts` only creates scheduled dry-runs. Live scheduled execution throws `"Live scheduled execution is not implemented"`. This is correct for safety.

Scheduler lifecycle gaps:

- Enqueues eligible wallets on start; recurrence is limited.
- `stop()` drains queues, which can delete pending work.
- No distributed singleton lock.
- No durable run history separate from transaction rows.
- No live scheduler acceptance tests.

## Confirmation Watcher Flow

Status: PARTIAL.

`apps/api/src/transactions/confirmation.ts` fetches transaction receipts and maps success to `CONFIRMED`, revert to `FAILED`. It updates gas and daily stats and sends Telegram notifications.

Missing for live mode:

- Confirmation depth.
- Reorg handling.
- Timeout/stuck transaction policy.
- Replacement transaction tracking.
- Explorer/RPC disagreement handling.

## Nonce, Gas, Slippage, and Failure Handling

| Area | Status | Review |
|---|---|---|
| Nonce | MISSING | No wallet-level nonce lock or pending nonce tracking. |
| Gas | PARTIAL | Dry-run gas estimate and wallet gas cap exist; live EIP-1559 controls are not explicit. |
| Slippage | PARTIAL | Pair max slippage exists; quote min-out validation needs hardening. |
| Failure handling | PARTIAL | Rejected/failed rows are stored; error detail is generic. |
| Idempotency | MISSING | No idempotency key or duplicate request handling. |
| Replay/double-submit | HIGH RISK | Browser retries or repeated clicks can create more than one live transaction if live gates are open. |

## Required Fixes Before Live Mode

| Severity | Fix | Acceptance criteria |
|---|---|---|
| CRITICAL | Add auth/authorization before live endpoints. | Unauthenticated live writes are impossible. |
| HIGH | Add transaction idempotency and per-wallet locks. | Concurrent execute-once requests cannot submit duplicates. |
| HIGH | Add nonce and replacement policy. | Pending txs are visible; only one pending nonce per wallet unless explicitly replaced. |
| HIGH | Validate quote and calldata deeply. | Tests reject wrong chain/router/spender/token/value/calldata. |
| HIGH | Add confirmation-depth watcher. | Transactions become final only after configured confirmations. |

