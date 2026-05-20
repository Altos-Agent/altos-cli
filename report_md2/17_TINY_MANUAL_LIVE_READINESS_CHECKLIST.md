# Tiny Manual Live Readiness Checklist

Date: 2026-05-20

Scope: Readiness gates for a single tiny manual live execute-once test on Base using a dedicated wallet.

Verdict/status: NOT_READY_FOR_TINY_MANUAL_LIVE_TEST.

## Gate Summary

| Gate | Result | Status | Evidence / Required action |
|---|---:|---:|---|
| Dedicated low-value wallet | BLOCKED | OPERATOR_REQUIRED | Must import only a disposable wallet with tiny funds. |
| Demo mode off | BLOCKED | OPERATOR_REQUIRED | Requires `DEMO_MODE=false` for test window. |
| Dry-run off | BLOCKED | OPERATOR_REQUIRED | Requires `DRY_RUN=false` only during test window. |
| Live confirmation required | PASS | IMPLEMENTED | `REQUIRE_LIVE_CONFIRMATION=true` default and route checks exist. |
| Vault unlock window | BLOCKED | OPERATOR_REQUIRED | Vault unlock route exists; must unlock only for test window. |
| Token verification | FAIL | OPERATOR_REQUIRED | No verified live token set produced by audit. |
| Router/spender verification | FAIL | OPERATOR_REQUIRED | No verified live router/allowance target produced by audit. |
| Quote provider verification | FAIL | NOT_TESTED | 0x quote not live-tested. |
| Exact approval | BLOCKED | OPERATOR_REQUIRED | Approval flow exists; must use exact small amount. |
| Auto approval disabled | PASS | IMPLEMENTED | `AUTO_APPROVE=false` default. |
| Unlimited approval disabled | PASS | IMPLEMENTED | `ALLOW_UNLIMITED_APPROVAL=false` default. |
| Emergency pause drill | FAIL | NOT_TESTED | Script/docs exist; not run. |
| Backup/restore requirement | FAIL | NOT_TESTED | Script/docs exist; not run. |
| Telegram notification | FAIL | NOT_TESTED | Real send not tested. |
| Basescan manual verification | BLOCKED | OPERATOR_REQUIRED | Required after tx submission. |
| Finality observation | BLOCKED | OPERATOR_REQUIRED | Must wait for configured confirmations and status `FINALIZED`. |
| Revoke step | BLOCKED | OPERATOR_REQUIRED | Must revoke allowance after test. |
| Rollback plan | FAIL | PARTIAL | Docs exist, but no test-specific rollback artifact. |
| Stop conditions | FAIL | PARTIAL | Need written stop conditions before funding wallet. |

## Dedicated Low-Value Wallet Requirement

- Use a wallet created only for this test.
- Fund only enough for one tiny swap, approval/revoke gas, and buffer.
- Do not use primary custody wallets.
- Do not import seed phrases.

## Token/Router Verification

Required before live:

- Token contract address and decimals verified on Base.
- Router and allowance target verified from official/primary sources and Basescan.
- Token and router records marked `VERIFIED`, enabled, and scoped to the exact pair.
- Wallet-pair rule enabled only for the test pair.

## Quote Provider Verification

Required before live:

- `QUOTE_PROVIDER=zeroX` configured with API key if required.
- Dry-run quote returns Base chain id, expected sell/buy token addresses, expected raw sell amount, positive buy amount, verified `txTo`, verified allowance target, zero native value unless explicitly enabled.
- Quote expiry window understood.

## Exact Approval

- Approve only exact small amount.
- Confirm allowance before execute-once.
- Revoke to zero after finality or abort.

## Vault Unlock Window

- Unlock only immediately before approval/execute-once/revoke.
- Confirm auto-lock duration.
- Lock vault after test.

## Emergency Pause Drill

- Must prove global emergency pause blocks approve, revoke, execute-once, scheduler start.
- Must prove unpause only after typed/operator-confirmed action.

## Backup/Restore Requirement

- Must create a backup before test.
- Must verify restore in a disposable environment with same master-key handling.
- Must keep master key separate from encrypted backup.

## Telegram Notification

- Send test notification.
- Confirm submitted/finalized/rejected preferences.
- Confirm notification delivery audit row.

## Basescan And Finality

- Manually inspect submitted tx hash on Basescan.
- Confirm from/to/contract/amount match quote.
- Wait until app records `FINALIZED`.
- If `STUCK` or `DROPPED`, stop and perform nonce review outside app.

## Rollback Plan

- Revoke allowance.
- Lock vault.
- Set `DRY_RUN=true`.
- Pause wallet.
- Enable global emergency pause if any uncertainty exists.

## Stop Conditions

Stop immediately if:

- Quote target or allowance target differs from verified records.
- Simulation fails.
- Allowance is larger than planned.
- Transaction remains pending beyond stuck threshold.
- RPC/quote provider returns inconsistent data.
- Telegram/ops visibility is unavailable.

## Final Verdict

NOT_READY_FOR_TINY_MANUAL_LIVE_TEST.

Move to `READY_FOR_OPERATOR_REVIEW` only after verification artifacts, drills, and 0x read-only quote validation are complete.
