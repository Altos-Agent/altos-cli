# 15 — Audit Index

**Date:** 2026-05-21

---

## Cross-Reference: Findings by Severity

### Critical (Hard Blockers — Must Fix)

| Finding | Section | Layer | File(s) |
|---------|---------|-------|---------|
| SigningCoordinator never called — all signing bypasses policy engine | §03, §14 | L1 | custody/signing-coordinator.ts |
| SignerPolicyEngine dead code | §03, §14 | L1 | custody/policy/signer-policy-engine.ts |
| External signer dead code | §03 | L3 | custody/providers/external-http-signer.ts |
| Scheduler has no pre-sign aggregate risk gate | §04, §14 | L3 | scheduler/trade.worker.ts |
| Auth missing on 10+ routes (pause, stop, emergency enable, wallet mutations) | §03, §09, §14 | L3 | Multiple route files |
| Execute-once has no rate limit | §03, §09, §14 | L3 | http/rate-limit-provider.ts |
| `isLiveSchedulerEnabled` hardcoded false — check 20 is no-op | §11, §14 | L3 | readiness/readiness-service.ts |
| Checks 21-23 hardcoded true — no actual health checks | §11, §14 | L3 | readiness/readiness-service.ts |
| MFA not per-operation — only at login | §03, §09, §14 | L3 | auth/ |
| Session role hardcoded as admin | §03, §09, §14 | L3 | auth/session-store-factory.ts |

### High Priority

| Finding | Section | Layer | File(s) |
|---------|---------|-------|---------|
| ZeroX has no fetch timeout — infinite hang | §07 | L3 | quote/providers/zeroX.ts |
| Vault state per-worker memory — inconsistent | §03, §03 | L3 | vault/vault-lock.ts |
| Trace event functions defined but never called | §08 | L3 | trace/trace.service.ts |
| Circuit breaker state not exported to Prometheus | §08 | L3 | quote/provider-circuit-breaker.ts |
| Lock acquisition race condition | §05, §14 | L3 | scheduler/scheduler-service.ts |
| No multi-provider fallback — single point of failure | §07 | L3 | quote/quoteEngine.ts |
| Price impact always null from 0x | §07 | G2 | quote/providers/zeroX.ts |
| `getDlqStats()` loads entire table into memory | §05 | L3 | scheduler/dlq.service.ts |
| `scheduler_jobs.status` no enum constraint | §12 | L3 | db/schema.ts |
| Nonce reservation not integrated into scheduler | §06, §14 | L3 | scheduler/trade.worker.ts |

### Medium Priority

| Finding | Section | File(s) |
|---------|---------|---------|
| No pair concentration limit | §04 | risk/aggregate-risk.ts |
| No global daily tx count limit | §04 | risk/aggregate-risk.ts |
| `upsertAggregateStats` writes `totalPendingUsd=0` | §04 | risk/aggregate-risk.ts |
| Nonce update + lock release not atomic | §06 | nonce-reservation.ts |
| Unique index on `occurrenceKey` not verified | §05 | db/schema.ts |
| No periodic stale occurrence reconciliation | §05 | scheduler/scheduler-service.ts |
| No max attempt enforcement on occurrence | §05 | scheduler/occurrence.service.ts |
| Worker doesn't propagate trace context | §08 | scheduler/trade.worker.ts |
| Wallet quarantine chaos scenario non-functional | §05 | scheduler/chaos-scenarios.ts |
| MFA TOTP verify endpoint no rate limit | §03 | auth/mfa-routes.ts |

---

## Cross-Reference: Findings by File

| File | Findings | Severity |
|------|----------|----------|
| `auth/session-store-factory.ts` | Session role hardcoded admin | CRITICAL |
| `auth/mfa-service.ts` | MFA not per-operation | CRITICAL |
| `auth/mfa-routes.ts` | No MFA verify rate limit | MEDIUM |
| `custody/signing-coordinator.ts` | Never called from routes | CRITICAL |
| `custody/policy/signer-policy-engine.ts` | Dead code | CRITICAL |
| `custody/providers/external-http-signer.ts` | Dead code, fake mTLS | CRITICAL |
| `db/schema.ts` | No enum on scheduler_jobs.status, missing index | HIGH |
| `http/rate-limit-provider.ts` | No rate limit on execute-once | CRITICAL |
| `ops/metrics.ts` | Histogram missing | MEDIUM |
| `ops/metrics-routes.ts` | Metrics refresh from DB | MEDIUM |
| `quote/providers/zeroX.ts` | No fetch timeout, price impact null | CRITICAL |
| `quote/quoteEngine.ts` | No multi-provider fallback | HIGH |
| `quote/provider-circuit-breaker.ts` | State not in Prometheus | HIGH |
| `readiness/readiness-service.ts` | Checks 20-23 hardcoded | CRITICAL |
| `risk/aggregate-risk.ts` | No pair concentration, no global tx limit | HIGH |
| `scheduler/occurrence.service.ts` | No verified unique index, loose transitions | MEDIUM |
| `scheduler/scheduler-service.ts` | Lock race condition, no worker aliveness | HIGH |
| `scheduler/trade.worker.ts` | No trace context, no pre-sign risk gate | CRITICAL |
| `scheduler/dlq.service.ts` | OOM risk on stats | HIGH |
| `trace/trace.service.ts` | Events not recorded, in-memory only | HIGH |
| `vault/vault-lock.ts` | Per-worker memory | HIGH |

---

## Cross-Reference: Findings by Report Section

| Report | Critical | High | Medium | Total |
|--------|----------|------|--------|-------|
| §01 Executive | Summary | — | — | — |
| §02 Capabilities | 8 not implemented | — | — | 8 |
| §03 Security/Custody | 10 blockers | — | — | 10 |
| §04 Risk Engine | 2 blockers | 2 | — | 4 |
| §05 Scheduler | 1 blocker | 4 | — | 5 |
| §06 Nonce/Tx | — | 2 | — | 2 |
| §07 Provider | 1 blocker | 1 | 1 | 3 |
| §08 Observability | 4 blockers | 2 | — | 6 |
| §09 Auth/RBAC | 4 blockers | 2 | — | 6 |
| §10 Test/CI | — | 3 | 1 | 4 |
| §11 Live Readiness | 3 blockers | 2 | — | 5 |
| §12 Tech Debt | 20 items | 8 | 22 | 50 |
| §13 Runbooks | — | — | — | — |
| §14 No-Go | 16 gates | — | — | 16 |

---

## Pre-Existing Test Failures (Not Introduced by This Audit)

| Test File | Failures | Root Cause |
|----------|----------|------------|
| `trade.worker.test.ts` | 2 | Mock issues: `db.update`, `client.js` |
| `preflight.test.ts` | 8 | Missing `id` field in test objects |
| `signer-policy-engine.test.ts` | 4+ | Type errors: null/UNVERIFIED |
| `signing-coordinator.test.ts` | 6+ | Type errors, unknown error type |
| `provider.errors.test.ts` | 2 | Missing `retryable` field |
| `rate-limit-provider.test.ts` | 2 | Missing env fields |
| Integration tests (4 files) | 8+ | `rateLimitProvider: null` type |

---

## Validation Commands Reference

```bash
# TypeScript
pnpm --filter api typecheck

# ESLint
pnpm --filter api lint

# Unit tests
pnpm --filter api test

# Dry-run load test (safe)
cd apps/api && pnpm run dry-run-load-test --concurrency 4 --duration 60

# Migration smoke
npx drizzle-kit migrate status

# Docker smoke
docker compose up -d && curl -s http://localhost:8132/health | jq .

# Readiness check
curl -s http://localhost:8132/api/readiness | jq .
```

---

## Doc References

| Document | Section | Purpose |
|----------|---------|---------|
| `NO_GO_CONDITIONS.md` | Baseline | Extended by §14 |
| `LIVE_READINESS_CENTER.md` | Baseline | Extended by §11 |
| `USD_NORMALIZED_RISK_ACCOUNTING.md` | Baseline | Referenced by §04 |
| `SIGNER_POLICY_ENGINE.md` | Baseline | Dead code per §03 |
| `EMERGENCY_PAUSE_DRILL.md` | Baseline | Drill procedure in §13 |
| `BACKUP_RESTORE_DRILL.md` | Baseline | Drill procedure in §13 |
| `SCHEDULE_OCCURRENCE_IDEMPOTENCY.md` | Baseline | Unique index concern in §05 |
| `NONCE_RESERVATION_AND_RECOVERY.md` | Baseline | Atomic concern in §06 |
| `TRACEABILITY.md` | Baseline | Trace gap in §08 |
| `PROVIDER_CIRCUIT_BREAKER.md` | Baseline | Metrics gap in §08 |
| `VERIFIED_REGISTRY_WORKFLOW.md` | Baseline | Verified registry in §04 |

---

## Files in This Report

```
report_release_candidate/
├── 01_EXECUTIVE_VERDICT.md       ← Top-level summary and verdict
├── 02_PRODUCT_CAPABILITIES.md    ← What works, what doesn't, safe boundaries
├── 03_SECURITY_AND_CUSTODY_REVIEW.md ← Auth, RBAC, MFA, vault, external signer
├── 04_RISK_ENGINE_REVIEW.md      ← Aggregate risk, USD normalization, limits
├── 05_SCHEDULER_AUTOMATION_REVIEW.md ← Scheduler, worker, occurrence, DLQ
├── 06_NONCE_AND_TRANSACTION_SAFETY_REVIEW.md ← Nonce, transaction state
├── 07_PROVIDER_RESILIENCE_REVIEW.md ← Quote provider, circuit breaker
├── 08_OBSERVABILITY_AND_TRACE_REVIEW.md ← Metrics, traces, alerting
├── 09_AUTH_RBAC_RATE_LIMIT_REVIEW.md ← Auth routes, MFA, session management
├── 10_TEST_CI_DEPLOYMENT_REVIEW.md ← Test coverage, CI, Docker
├── 11_LIVE_READINESS_REVIEW.md   ← Readiness center, drill requirements
├── 12_REMAINING_TECHNICAL_DEBT.md ← All gaps with fix effort
├── 13_OPERATOR_RUNBOOKS.md       ← Daily checklist, procedures, limits
├── 14_FINAL_NO_GO_CONDITIONS.md  ← Complete no-go gate list with states
└── 15_AUDIT_INDEX.md              ← This file — cross-reference
```