# Live Scheduler Implementation Gates

> **Purpose:** Checklist of prerequisites that must be satisfied before live scheduler execution can be enabled. These are hard gates — live scheduler must not be enabled until all gates pass.

## Gate 0 — Explicit Operator Acknowledgment

- [ ] Operator has read `architecture/06_LIVE_SCHEDULER_THREAT_MODEL.md` in full
- [ ] Operator has read `architecture/07_LIVE_SCHEDULER_DESIGN.md` in full
- [ ] Operator has accepted the risk acknowledgment document (signature on file)
- [ ] `SCHEDULER_LIVE_EXECUTION=true` is set explicitly in production `.env` with operator signature in commit history

---

## Gate 1 — Manual Live Test Passes

**Test:** A single operator-initiated `execute-once` live trade on Base mainnet using the exact same quote provider, wallet, and pair that the scheduler would use.

- [ ] Transaction submits successfully and reaches `FINALIZED`
- [ ] No duplicate transaction was created
- [ ] No nonce conflict occurred
- [ ] Telegram confirmation notification received
- [ ] Ops summary shows correct state
- [ ] Aggregate risk stats updated correctly

**Why required:** Verifies the entire live execution path works correctly for one trade before automation runs it on a schedule.

---

## Gate 2 — Aggregate Risk Engine Is Operational

- [ ] `GET /api/risk/aggregate` returns correct stats and limits
- [ ] Aggregate risk is evaluated at `execute-once` time (not just dry-run time)
- [ ] `checkAggregateRisk` is called in the live trade worker before signing
- [ ] Aggregate risk rejection produces a DLQ entry with `RISK_REJECTED` reason
- [ ] Aggregate risk stats update after `FINALIZED` transaction
- [ ] Alert fires when aggregate pending exceeds 80% of cap

---

## Gate 3 — Provider Load Test Passes

**Test:** `pnpm run load-test -- --walletCount 10 --iterations 3 --concurrency 4 --maxErrorRate 0.05`

- [ ] Error rate ≤ 5% with `QUOTE_PROVIDER=zeroX`
- [ ] No `PROVIDER_429` spike without alert
- [ ] p99 latency < 500ms at 10 wallets × 3 iterations
- [ ] `quote_provider_failures_total` metrics are being recorded

**Why required:** Before automating live trades, the quote provider must handle concurrent load without rate limit issues that would cause mass job failures.

---

## Gate 4 — Monitoring and Alerting Is Live

- [ ] `GET /metrics` returns Prometheus metrics (authenticated)
- [ ] `GET /api/ops/summary` shows stuck/dropped counts, notification failures, auth failures
- [ ] Alert webhook is configured (`ALERT_WEBHOOK_URL` set)
- [ ] Alert fires on `stuck_transaction` event (test with a stuck transaction)
- [ ] Alert fires on `dropped_transaction` event
- [ ] Alert fires on `emergency_pause_enabled`
- [ ] Alert fires on `scheduler_failure` (DLQ entry)
- [ ] `alert_webhook_total{result="failure"}` metric tracks webhook failures

**Why required:** Cannot safely operate live automation without operational awareness. Silent failures cause undetected fund exposure.

---

## Gate 5 — Backup and Restore Drill Completed

**Drill:** Simulate total loss of Postgres data on a non-production environment.

- [ ] Full database backup created
- [ ] Database restored from backup
- [ ] Wallets decrypt correctly after restore (master key available)
- [ ] Scheduler state reconstituted correctly
- [ ] No transaction state lost beyond what was in the backup
- [ ] Aggregate risk stats recalculated correctly

**Why required:** A compromised or corrupted database is a critical incident. Recovery must be rehearsed before live funds are at stake.

---

## Gate 6 — Token and Router Verification Complete

For every token and router involved in a scheduled live trade:

- [ ] Token has a verified Base mainnet contract address (not `null`)
- [ ] Token has verified decimals metadata
- [ ] Router has a verified Base mainnet contract address (not `null`)
- [ ] Router is `enabled = true`
- [ ] Pair using the token and router is `enabled = true`
- [ ] Wallet-pair rule exists and is `enabled = true`
- [ ] No placeholder or `null` addresses anywhere in the trade path

**Why required:** The system intentionally ships with `null` addresses and `enabled=false` for all seeded tokens/routers. These must be independently verified on Base mainnet before any live trade can succeed.

---

## Gate 7 — Nonce Replacement Policy Is Designed

- [ ] Threat model explicitly addresses `STUCK` and `DROPPED` nonce states
- [ ] Operator has a documented procedure for manually reviewing and clearing `STUCK`/`DROPPED` wallets
- [ ] The system does NOT send replacement transactions automatically (confirmed in writing)
- [ ] Nonce replacement procedure has been tested in a non-production environment

**Why required:** The system currently does not support automatic nonce replacement. This gap must be acknowledged and managed procedurally until explicit replacement flow is designed and implemented.

---

## Gate 8 — Production Environment Hardening

- [ ] `DRY_RUN=false` explicitly set in production `.env` (not default)
- [ ] `SCHEDULER_LIVE_EXECUTION=true` explicitly set in production `.env`
- [ ] `OPERATOR_PASSWORD_HASH` set to a production-strength Argon2id hash
- [ ] `SESSION_SECRET` set to a unique, strong secret (not the dev default)
- [ ] `MASTER_KEY_FILE` points to a secure, backed-up location
- [ ] Redis uses AUTH password in production (`REDIS_PASSWORD` env var implemented)
- [ ] Postgres `POSTGRES_PASSWORD` is strong and not committed to repo
- [ ] `ALERT_WEBHOOK_URL` is set and tested
- [ ] `METRICS_TOKEN` is set if `/metrics` is network-accessible
- [ ] Telegram bot token is encrypted in `telegram_settings`, not in env

---

## Gate 9 — Database Migration Clean

- [ ] `pnpm db:generate` reports `No schema changes, nothing to migrate`
- [ ] Migration metadata test passes: `pnpm test -- src/db/migration-metadata.test.ts`
- [ ] Migration has been run against a fresh database in CI

**Why required:** Live scheduler adds tables (`scheduler_jobs` extended, `pending_wallet_locks` usage). Schema must be clean before enabling live mode.

---

## Gate 10 — Code Review Sign-off

- [ ] Threat model reviewed by a second engineer
- [ ] Architecture design reviewed by a second engineer
- [ ] All Phase 9 monitoring metrics are wired into the live scheduler paths
- [ ] All Phase 9 alert webhooks fire from the correct live scheduler events
- [ ] `SCHEDULER_LIVE_EXECUTION=true` guard remains in `scheduler-service.ts` until all other gates pass
- [ ] No new code bypasses existing safety gates (vault lock, emergency pause, dry-run, live confirmation)

---

## Summary

| Gate | Name | Blocker for |
|------|------|-------------|
| 0 | Operator acknowledgment | All live execution |
| 1 | Manual live test | Any automation |
| 2 | Aggregate risk engine | Live scheduling |
| 3 | Provider load test | Concurrent scheduling |
| 4 | Monitoring/alerting | Unattended operation |
| 5 | Backup/restore drill | Production readiness |
| 6 | Token/router verification | Live trade execution |
| 7 | Nonce replacement policy | `STUCK`/`DROPPED` handling |
| 8 | Production hardening | Unattended production |
| 9 | Database migration clean | Schema safety |
| 10 | Code review sign-off | Governance |

---

## Future Implementation Phases

### LS1 — Dry-Run Scheduler Metrics
Add `scheduler_live_jobs_total` and `scheduler_dlq_jobs_total` metrics to the existing dry-run scheduler. No live execution changes. Validates monitoring pipeline.

### LS2 — Manual-Approved Queued Live Jobs
Jobs enter a `PENDING_APPROVAL` state. Operator must approve via API before signing. Still uses `SCHEDULER_LIVE_EXECUTION=false` gate. Validates the per-wallet queue and nonce manager without unattended execution.

### LS3 — Single-Wallet Scheduled Live Job
One designated wallet (not production funds) on a single pair runs on a schedule. Operator approval required per run. Full pipeline with monitoring. Gate 1 retest.

### LS4 — Multi-Wallet Limited Live Scheduler
Up to 3 wallets, aggregate risk cap enforced, 1% of normal trade size. Gate 2 and 3 retest. Operator dashboard shows all scheduled jobs and pending approvals.

### LS5 — Production Hardening
All gates complete. Full wallet set. Normal trade sizes. Automated (no per-job approval). Gate 8 and 10 final sign-off.

---

**No live scheduler execution code will be merged until Gate 0 through Gate 10 are completed and documented in this file.**