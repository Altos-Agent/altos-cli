# Live Mode Readiness Checklist
Date: 2026-05-08
Repository audit scope: Hard checklist before live execution, including wallet vault, transaction, risk, approval, Telegram, database, DevOps, and manual tests.
Verdict/status: LIVE_NOT_RECOMMENDED. Do not enable live execution until all hard gates pass.

## Hard Go/No-go Criteria

Final go requires every CRITICAL and HIGH item below to be complete, tested, and documented. Current status: NO-GO.

## Wallet Vault Checklist

| Severity | Status | Item |
|---|---|---|
| CRITICAL | MISSING | Authenticated operator session required before wallet import/export/signing. |
| CRITICAL | PARTIAL | Master key not solely a hot file next to app data. |
| HIGH | MISSING | Vault lock/unlock workflow. |
| HIGH | PARTIAL | Backup/restore/key rotation drill documented and tested. |
| HIGH | MISSING | Key compromise emergency workflow. |
| MEDIUM | IMPLEMENTED | Wallet API responses omit secret fields. |

## Transaction Checklist

| Severity | Status | Item |
|---|---|---|
| HIGH | MISSING | Idempotency key required for live execute and approval writes. |
| HIGH | MISSING | Per-wallet nonce lock and pending transaction table. |
| HIGH | PARTIAL | Quote response schema and semantic validation. |
| HIGH | MISSING | Native token value handling and cap. |
| HIGH | MISSING | Confirmation depth/reorg policy. |
| MEDIUM | PARTIAL | Simulation before signing/submission. |

## Risk Checklist

| Severity | Status | Item |
|---|---|---|
| HIGH | PARTIAL | Wallet limits required before activation. |
| HIGH | PARTIAL | Token/router addresses verified and normalized. |
| HIGH | MISSING | Price impact enforcement. |
| HIGH | MISSING | Global live cap and global emergency pause. |
| MEDIUM | PARTIAL | Daily stats are idempotent and tested. |

## Approval Checklist

| Severity | Status | Item |
|---|---|---|
| HIGH | IMPLEMENTED | Unlimited approval disabled by default. |
| HIGH | PARTIAL | Exact approvals and revoke-to-zero exist. |
| HIGH | MISSING | Approval max amount by wallet/token/router. |
| HIGH | MISSING | Existing allowance exposure warning and alerting. |
| MEDIUM | PARTIAL | Allowance reads exist, but need verified Base-contract tests. |

## Telegram Checklist

| Severity | Status | Item |
|---|---|---|
| MEDIUM | IMPLEMENTED | Token encrypted at rest. |
| MEDIUM | PARTIAL | Test notification exists. |
| MEDIUM | MISSING | Notification failures are auditable/observable. |
| LOW | PARTIAL | Messages include Basescan links. |

## Database Checklist

| Severity | Status | Item |
|---|---|---|
| HIGH | MISSING | Idempotency/nonce/request tables. |
| MEDIUM | MISSING | Additional indexes for transactions/status/audit. |
| MEDIUM | MISSING | DB checks for non-negative limits and decimals range. |
| MEDIUM | PARTIAL | Audit logs include all critical mutations. |

## DevOps Checklist

| Severity | Status | Item |
|---|---|---|
| CRITICAL | MISSING | TLS/reverse proxy/firewall/auth for any server deployment. |
| CRITICAL | MISSING | Secret manager/KMS/OS keyring for production. |
| HIGH | MISSING | Backup/restore automation. |
| HIGH | MISSING | Monitoring/alerting. |
| MEDIUM | IMPLEMENTED | Local Docker Compose for Postgres/Redis. |

## Manual Test Checklist

1. Run `pnpm install`.
2. Run `pnpm typecheck`.
3. Run `pnpm lint`.
4. Run `pnpm test`.
5. Run `pnpm build`.
6. Run demo mode and confirm no private keys required.
7. Import a tiny funded test wallet only after vault/auth hardening.
8. Run dry-run for enabled pair.
9. Verify approval exact amount and revoke on verified contracts.
10. Submit one tiny live execute-once transaction only after all NO-GO items are complete.

