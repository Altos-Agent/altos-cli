# Database Schema Review
Date: 2026-05-08
Repository audit scope: Drizzle schema, migrations, sensitive data, constraints, indexes, audit logging, transaction history, daily stats, and seed quality.
Verdict/status: PARTIAL. Schema supports the local product, but live-mode integrity constraints and indexes need strengthening.

## Tables and Models Overview

| Table | Status | Purpose |
|---|---|---|
| `local_settings` | IMPLEMENTED | App defaults. |
| `wallets` | IMPLEMENTED | Wallet metadata and encrypted private key. |
| `tokens` | IMPLEMENTED | Token whitelist/config. |
| `pairs` | IMPLEMENTED | Tradable pair config. |
| `wallet_pair_rules` | IMPLEMENTED | Per-wallet pair enablement and limits. |
| `routers` | IMPLEMENTED | Router whitelist/config. |
| `transactions` | IMPLEMENTED | Dry-run, rejected, submitted, confirmed, failed transaction history. |
| `telegram_settings` | IMPLEMENTED | Telegram bot token ciphertext, chat ID, preferences. |
| `audit_logs` | PARTIAL | Basic audit trail for selected mutations. |
| `daily_wallet_stats` | PARTIAL | Daily tx count, gas, estimated loss. |
| `wallet_schedules` | PARTIAL | Per-wallet scheduler settings. |

## Missing Indexes

| Severity | Status | Missing index | Why it matters |
|---|---|---|---|
| MEDIUM | MISSING | `transactions(wallet_id, created_at)` | Wallet history and daily stats queries will grow. |
| MEDIUM | MISSING | `transactions(status, created_at)` | Confirmation watcher scans submitted rows. |
| MEDIUM | MISSING | `audit_logs(entity_type, entity_id, created_at)` | Audit review needs efficient filtering. |
| MEDIUM | MISSING | `wallet_schedules(enabled, emergency_paused, last_scheduled_at)` | Scheduler eligibility scans need help at scale. |
| LOW | MISSING | `tokens(chain_id, enabled)` and `routers(chain_id, enabled)` | UI and risk lookups filter by chain/enabled. |

## Missing Constraints

| Severity | Status | Constraint | Fix |
|---|---|---|---|
| HIGH | MISSING | EVM address format/checksum constraints for wallet/token/router. | Enforce in service and optionally DB check/domain. |
| HIGH | MISSING | Token decimals range. | Add `decimals between 0 and 36` service/schema validation. |
| MEDIUM | MISSING | Non-negative numeric limits. | Add DB checks for max trade/gas/loss/amount fields. |
| MEDIUM | PARTIAL | `tx_hash` unique index includes nullable hash. | Acceptable in Postgres, but add explicit partial unique index for non-null hash for clarity. |
| MEDIUM | MISSING | Pair token in != token out. | Add check or service validation. |

## Sensitive Data Fields

| Field | Status | Review |
|---|---|---|
| `wallets.encrypted_private_key` | SENSITIVE | Encrypted but high impact; do not export/store with master key. |
| `telegram_settings.encrypted_bot_token` | SENSITIVE | Encrypted with same vault key. |
| `telegram_settings.chat_id` | MEDIUM | Plaintext identifier; should be treated as operational sensitive data. |
| `transactions.error_message` | LOW/MEDIUM | Could leak provider or route details; keep redacted. |

## Enum Quality

Enums are clear for wallet status, risk level, transaction status/action, and strategy profile. Missing states for live transaction lifecycle include `PENDING_APPROVAL`, `NEEDS_APPROVAL`, `SIMULATED`, `BROADCASTING`, `DROPPED`, `REPLACED`, and `FINALIZED`.

## Audit Logging

Status: PARTIAL. Mutations write audit logs in wallet and management paths, and scheduler pause/update paths. Audit logs lack request ID, operator identity, source IP/origin, before/after diffs, and tamper-evident chaining.

## Transaction History Model

Status: PARTIAL. Transaction rows capture action/status/hash/router/token/amount/gas/errors/Basescan URL. Missing live-mode fields:

- idempotency key.
- nonce.
- from/to address.
- calldata hash.
- quote ID/raw quote hash.
- simulation result hash.
- confirmation count/finalized block.
- replacement/cancel relationship.

## Daily Stats Model

Status: PARTIAL. Tracks tx count/gas/loss but loss calculation is not robust. The stats update path is tied to confirmation refresh and should be redesigned for idempotent aggregation.

## Migration Quality

Status: IMPLEMENTED. Drizzle migrations `0000` through `0004` exist with metadata snapshots. Need future migrations for indexes/checks listed above.

## Seed Quality

| Seed | Status | Review |
|---|---|---|
| `apps/api/src/db/seed.ts` | PARTIAL | Contains TODOs to verify Base token/router addresses before live. Good warning, not live-ready. |
| `apps/api/src/db/demo-data.ts` | IMPLEMENTED | Provides demo wallets, balances, pairs, router, transactions, and fake demo Basescan links. |

## Data Integrity Risks

| Severity | Risk | Fix |
|---|---|---|
| HIGH | Live transaction rows do not store nonce/idempotency/call hash. | Add transaction request table and immutable submission record. |
| HIGH | Router references in pairs are text names. | Replace with router ID or validated address references. |
| MEDIUM | Wallet hard delete can conflict with historical transactions or remove context. | Prefer soft delete/disable for wallets with history. |
| MEDIUM | Demo placeholder key satisfies non-null encrypted key field. | Make wallet secret nullable with mode/type field, or separate demo wallets from vault wallets. |

