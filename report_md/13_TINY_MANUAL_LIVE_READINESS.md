# Tiny Manual Live Readiness

Date: 2026-05-13  
Scope: Readiness gates for one dedicated low-value manual live execute-once test.  
Verdict/status: READY_FOR_OPERATOR_REVIEW, not ready to send.

## Dedicated Low-Value Wallet Requirement

Status: OPERATOR_REQUIRED. Use a fresh wallet dedicated to this tool. Never import a seed phrase or primary wallet. Fund only the minimum amount required for a tiny test and gas.

## Token / Router Address Verification Status

Status: OPERATOR_REQUIRED. Seeded token/router addresses are not sufficient for live use. Verify token contract, decimals, router/spender/allowance target, and pair direction against independent sources.

## Quote Provider Readiness

Status: NOT_TESTED. Mock provider is demo-safe. Live 0x/provider behavior was not tested in this audit.

## Allowance Readiness

Status: OPERATOR_REQUIRED. Exact ERC20 approval policy exists, unlimited approval is disabled by default, and revoke-to-zero exists. Operator must verify allowance target and approve only an exact small amount.

## Exact Approval Policy

Status: IMPLEMENTED. `ALLOW_UNLIMITED_APPROVAL=false` by default. Approval amount must be exact and positive. Revoke sets allowance to zero.

## Vault Unlock Window

Status: IMPLEMENTED. Vault auto-lock is controlled by `VAULT_AUTO_LOCK_MS`; live signing requires unlocked vault. Operator must keep the unlock window short.

## Emergency Pause Drill

Status: NOT_TESTED. Global and wallet pause controls exist and are tested in integration/E2E specs, but a live-test drill was not performed in this audit.

## Backup / Restore Requirement

Status: NOT_TESTED. Before live use, test DB plus master-key restore with demo wallets, and store encrypted backups separately from the master key.

## Telegram Notification Requirement

Status: OPERATOR_REQUIRED. Telegram is optional but recommended for live test observability. Token encryption and delivery audit exist; operator must configure/test it or explicitly accept no Telegram.

## Basescan / Manual Verification

Status: OPERATOR_REQUIRED. Basescan link generation exists. Operator must manually verify submitted hash, receipt status, finality, token balances, and allowance state.

## Finality Observation

Status: PARTIAL. Confirmation/finality states exist and are tested, but no live finality observation was performed.

## Revoke Step

Status: OPERATOR_REQUIRED. Revoke flow exists. Operator must revoke remaining allowance after the test unless intentionally retaining it.

## Stop Conditions

Stop immediately if any of these occur:
- quote provider returns unexpected router/target/calldata,
- allowance target differs from verified spender,
- simulation fails,
- transaction remains stuck past configured threshold,
- wallet balance or allowance differs from expected,
- emergency pause or vault state is unclear,
- Telegram/ops visibility fails and operator requires notification coverage.

## PASS / FAIL Readiness Gates

| Gate | Status |
| --- | --- |
| Dedicated low-value wallet | OPERATOR_REQUIRED |
| Seed phrase absent | PASS |
| Dry-run defaults | PASS |
| Live scheduler disabled | PASS |
| Exact approval default | PASS |
| Unlimited approval disabled | PASS |
| Emergency pause implemented | PASS |
| Vault encryption implemented | PASS |
| Vault restore drill | NOT_TESTED |
| Token/router verification | OPERATOR_REQUIRED |
| Live quote provider | NOT_TESTED |
| Manual Basescan plan | OPERATOR_REQUIRED |
| Revoke plan | OPERATOR_REQUIRED |
| Production/public server use | FAIL |

## Final Verdict

READY_FOR_OPERATOR_REVIEW. Do not send a live transaction yet. After operator-required gates, backup/restore drill, emergency drill, and provider/address verification pass, this may become READY_FOR_TINY_MANUAL_LIVE_TEST_WITH_LIMITATIONS for a tiny dedicated-wallet test only.

