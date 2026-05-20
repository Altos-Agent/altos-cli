# Database Schema And State Model Review

Date: 2026-05-13  
Scope: Drizzle schema, migrations, state tables, constraints, indexes, seed/demo data, and integrity risks.  
Verdict/status: IMPLEMENTED for local demo/dry-run; PARTIAL for migration hygiene and live operations.

## Current DB Schema Overview

Schema owner: `apps/api/src/db/schema.ts`. Migrations are under `apps/api/drizzle/0000-0010*.sql`.

Major enums include wallet status, risk level, transaction status, transaction request status, pending wallet lock status, and strategy profile.

## Wallet Tables

| Table | Purpose | Status |
| --- | --- | --- |
| `wallets` | Wallet metadata, address, encrypted private key, status, risk limits, notes | IMPLEMENTED |
| `wallet_pair_rules` | Per-wallet pair enablement and limits | IMPLEMENTED |
| `daily_wallet_stats` | Daily count/gas/loss tracking | IMPLEMENTED |
| `pending_wallet_locks` | Per-wallet live-impacting serialization | IMPLEMENTED |

## Transaction / Request / Lock Tables

| Table | Purpose | Status |
| --- | --- | --- |
| `transactions` | Planned/dry-run/live/approval/revoke transaction records | IMPLEMENTED |
| `transaction_requests` | Idempotency key, request hash, quote/simulation hashes | IMPLEMENTED |
| `pending_wallet_locks` | Active/released/expired locks and nonce metadata | IMPLEMENTED |

Transaction statuses cover `PLANNED`, `DRY_RUN`, `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, `CONFIRMED`, `FINALIZED`, `FAILED`, `REJECTED`, `STUCK`, `DROPPED`, and `REPLACED`.

## Token / Pair / Router Tables

| Table | Purpose | Status |
| --- | --- | --- |
| `tokens` | Chain token metadata, decimals, risk, enablement | IMPLEMENTED |
| `pairs` | Chain token pairs, router preference/fallback, slippage/impact limits | IMPLEMENTED |
| `routers` | Router addresses, risk, enablement | IMPLEMENTED |

## Telegram / Notification Audit Tables

| Table | Purpose | Status |
| --- | --- | --- |
| `telegram_settings` | Encrypted bot token, chat ID, event toggles | IMPLEMENTED |
| `notification_deliveries` | Channel/event/status/request/job/wallet/transaction audit | IMPLEMENTED |

## Scheduler Tables

| Table | Purpose | Status |
| --- | --- | --- |
| `scheduler_locks` | Singleton lock owner/heartbeat/expiry | IMPLEMENTED |
| `scheduler_runs` | Scheduler run lifecycle | IMPLEMENTED |
| `wallet_schedules` | Per-wallet schedule config and pause/failure thresholds | IMPLEMENTED |
| `scheduler_jobs` | Job history and status | IMPLEMENTED |

## Audit Log Coverage

`audit_logs` stores actor, action, entity type/id, metadata JSON, and timestamp. Emergency pause and management actions write audit logs in several services. Full audit coverage for every sensitive read/write was not exhaustively proven.

## Indexes And Constraints

Implemented constraints include unique wallet address, token chain/symbol and chain/address, pair chain/token direction, wallet-pair unique, idempotency key unique, pending wallet lock primary key, scheduler lock primary key, wallet schedule unique, daily wallet date unique, and transaction hash uniqueness by chain where not null.

## Migration Quality

Migrations exist through `0010_phase_i_transaction_status.sql`, but Drizzle metadata snapshots are present only through `0004_snapshot.json`, and `_journal.json` is modified. This is a release hygiene risk: generated migration metadata should be reconciled and committed consistently.

## Seed / Demo Data Quality

Demo seed files exist under `apps/api/src/db/demo-data.ts`, `demo-seed.ts`, and `demo-reset.ts`. Tests assert demo wallets, balances, transaction history, enabled pairs, and disabled Telegram. `README.md` warns seeded token/router addresses are placeholders/disabled for live use.

## Data Integrity Risks

| Severity | Risk | Status |
| --- | --- | --- |
| HIGH | Migration metadata dirty/incomplete | PARTIAL |
| MEDIUM | Nullable unique fields can permit multiple nulls depending DB semantics | PARTIAL |
| MEDIUM | Replacement/reorg state exists but automated data repair is limited | PARTIAL |
| MEDIUM | Audit log coverage is broad but not proven complete | UNCLEAR |
| LOW | Generated `packages/shared/dist` appears in tree | INFO |

## Missing Fields / Constraints / Indexes

Recommended before live operations: explicit verified-at/verified-by fields for token/router addresses, stronger audit actor model, per-router function selector constraints, durable notification retry metadata, richer replacement transaction linkage, and migration metadata reconciliation.

