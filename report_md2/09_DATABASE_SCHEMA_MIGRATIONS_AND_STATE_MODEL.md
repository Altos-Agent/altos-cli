# Database Schema Migrations And State Model

Date: 2026-05-20

Scope: Tables, wallet schema, transaction/request/lock schema, token/pair/router schema, notification/audit schema, scheduler schema, aggregate risk schema, indexes, migrations, seed/demo quality, and data integrity risks.

Verdict/status: PARTIAL. Schema coverage is broad and migration metadata exists through `0012`, but fresh migration was not run in this audit and the worktree has migration metadata changes.

## Current Tables

Defined in `apps/api/src/db/schema.ts`:

- `local_settings`
- `wallets`
- `tokens`
- `pairs`
- `wallet_pair_rules`
- `routers`
- `transactions`
- `transaction_requests`
- `pending_wallet_locks`
- `telegram_settings`
- `notification_deliveries`
- `audit_logs`
- `daily_wallet_stats`
- `scheduler_locks`
- `scheduler_runs`
- `wallet_schedules`
- `scheduler_jobs`
- `aggregate_risk_limits`
- `aggregate_risk_stats`

## Wallet Schema

- IMPLEMENTED: Wallet has name, address, encrypted private key, encryption version, status, max trade, daily trade/loss/gas limits, notes, timestamps.
- IMPLEMENTED: Unique wallet address index.
- PARTIAL: Address normalization depends on service logic; DB does not enforce checksum/lowercase format.

## Transaction, Request, Lock Schema

- IMPLEMENTED: Transaction statuses include `PLANNED`, `DRY_RUN`, `SUBMITTED`, `CONFIRMED_PENDING_FINALITY`, `CONFIRMED`, `FINALIZED`, `FAILED`, `REJECTED`, `STUCK`, `DROPPED`, `REPLACED`.
- IMPLEMENTED: Transaction rows store action, tx hash, router, token in/out, raw amounts, gas, fee, errors, Basescan URL, nonce, from/to, calldata/quote/simulation hashes, confirmation count, finalized block, replacement hash, dropped reason.
- IMPLEMENTED: `transaction_requests` stores idempotency key, request hash, action, status, wallet, pair/router, token labels, sell amount, quote/simulation hashes.
- IMPLEMENTED: Unique idempotency key index.
- IMPLEMENTED: `pending_wallet_locks` primary key on wallet id.
- PARTIAL: Execute-once does not currently populate nonce on submitted swap rows.

## Token, Pair, Router Schema

- IMPLEMENTED: Tokens and routers include verification metadata.
- IMPLEMENTED: Pairs link token in/out with enablement, trade cap, slippage cap, price impact cap, preferred/fallback router.
- IMPLEMENTED: Wallet-pair rules provide per-wallet pair enablement and limits.
- IMPLEMENTED: Unique indexes on token symbol/address and pair direction.

## Notification/Audit Schema

- IMPLEMENTED: Telegram settings store encrypted bot token and notification preferences.
- IMPLEMENTED: Notification deliveries store channel, event type, status, request/job/wallet/transaction ids, destination preview, error code/message.
- IMPLEMENTED: Audit logs store actor, action, entity, metadata JSON.
- PARTIAL: Audit logs are mutable DB rows with no retention, export, or review UI.

## Scheduler Schema

- IMPLEMENTED: Scheduler lock has name, owner id, heartbeat, expires.
- IMPLEMENTED: Scheduler runs record owner/status/heartbeat/stopped.
- IMPLEMENTED: Wallet schedules include interval, daily limits, strategy profile, emergency pause, failure threshold, run timestamps/status/failure count.
- IMPLEMENTED: Scheduler jobs record wallet, schedule, job type, status, reason, timestamps.
- PARTIAL: Scheduler job status is text, not enum-constrained.

## Aggregate Risk Schema

- IMPLEMENTED: Aggregate risk limits table has daily trade, gas, pending trade, pending wallets, failed tx/day, enabled.
- IMPLEMENTED: Aggregate stats table has date, chain id, daily trade/gas, pending USD, active wallets, failed count.
- IMPLEMENTED: Unique index on chain/date.
- PARTIAL: Aggregate stats are updated from transaction data, but pending USD calculation uses `amountIn` raw units as USD proxy, which is unsafe for live economics.

## Indexes And Constraints

- IMPLEMENTED: Key uniqueness indexes exist for wallet address, token symbol/address, pair direction, wallet-pair rule, transaction chain/hash, idempotency key, daily wallet stats, aggregate chain/date.
- PARTIAL: Additional indexes are likely needed for production transaction queries by wallet/status/createdAt and scheduler jobs by status/schedule.

## Migration Metadata Health

- IMPLEMENTED: `_journal.json` has entries `0000` through `0012`.
- IMPLEMENTED: Snapshot files exist through `0012`.
- PARTIAL: `git status` shows migration metadata modified and many migrations/snapshots untracked.
- NOT_TESTED: `pnpm db:migrate` was not run in this audit because it mutates the database outside report-only scope.

## Fresh Migration Readiness

- NOT_TESTED: Fresh migration against empty Postgres not run.
- EVIDENCE: CI includes migration smoke, and tests include `migration-metadata.test.ts`.
- RISK: Dirty/untracked migration files must be committed consistently before relying on fresh installs.

## Seed/Demo Quality

- IMPLEMENTED: Standard seed creates disabled placeholders.
- IMPLEMENTED: Demo seed creates UI-only demo wallets, demo balances, demo transactions, disabled Telegram.
- RISK: `docs/OPERATIONS_RUNBOOK.md` warns not to run `db:seed` and `demo:seed` into same fresh database unless ownership rules are updated.

## Data Integrity Risks

- HIGH / PARTIAL: Aggregate USD calculations based on raw token amount can misstate exposure.
- MEDIUM / PARTIAL: Scheduler job states are text rather than enum-constrained.
- MEDIUM / PARTIAL: Audit logs lack immutable retention and review workflow.
- MEDIUM / PARTIAL: Transaction replacement state is modeled but not automatically reconciled.

## Acceptance Criteria

- Fresh `db:migrate` and seed pass on an empty database.
- Migration files and snapshots are committed and in sync.
- Aggregate exposure uses normalized USD values from trusted quote data, not raw token units.
- Transaction and scheduler query paths have production indexes.
