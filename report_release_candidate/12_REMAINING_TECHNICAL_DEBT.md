# 12 — Remaining Technical Debt

**Date:** 2026-05-21

---

## Critical Technical Debt (Must Address Before Live)

| # | Debt | Location | Impact | Fix Effort |
|---|------|---------|--------|-------------|
| 1 | `SigningCoordinator` never called | custody/signing-coordinator.ts | Live signing bypasses policy engine | Medium |
| 2 | `SignerPolicyEngine` dead code | custody/policy/signer-policy-engine.ts | No pre-sign policy enforcement | Medium |
| 3 | ZeroX has no fetch timeout | quote/providers/zeroX.ts | Infinite hang on network issues | Low |
| 4 | `isLiveSchedulerEnabled` hardcoded false | readiness/readiness-service.ts:109 | Readiness check 20 is a no-op | Low |
| 5 | Checks 21-23 hardcoded true | readiness/readiness-service.ts:110-112 | Custody/approval/revoke never verified | Medium |
| 6 | Scheduler has no pre-sign risk gate | scheduler/trade.worker.ts | No aggregate risk check before signing | Medium |
| 7 | Trace event recording not wired | trace/trace.service.ts | Cannot trace execution path | High |
| 8 | Trace store in-memory only | trace/trace.service.ts | Lost on restart, no multi-instance | High |
| 9 | Auth missing on 10+ routes | Multiple route files | Unprotected wallet/scheduler controls | Low |
| 10 | Execute-once has no rate limit | http/rate-limit-provider.ts | DoS risk on live execution | Low |
| 11 | Vault state per-worker memory | vault/vault-lock.ts | Multi-worker inconsistency | Medium |
| 12 | Lock acquisition race condition | scheduler/scheduler-service.ts:600 | Two schedulers could acquire lock | Medium |
| 13 | No multi-provider fallback | quote/quoteEngine.ts | Single point of failure | High |
| 14 | Session role hardcoded as admin | auth/session-store-factory.ts | Every session is admin | Low |
| 15 | `getDlqStats()` loads entire table | scheduler/dlq.service.ts:264 | OOM on large DLQ | Low |
| 16 | Price impact null from 0x | quote/providers/zeroX.ts:101 | Price impact guard ineffective | Low |
| 17 | No pair concentration limit | risk/aggregate-risk.ts | Uncontrolled pair exposure | Medium |
| 18 | No global daily tx count limit | risk/aggregate-risk.ts | Could execute unlimited tx | Medium |
| 19 | Nonce reservation not in scheduler | scheduler/trade.worker.ts | Concurrent dry-run nonce risk | Medium |
| 20 | Nonce update + lock release not atomic | nonce-reservation.ts | Potential nonce desync | Medium |

---

## High Priority Technical Debt

| # | Debt | Location | Impact |
|---|------|---------|--------|
| 21 | Circuit breaker state not in Prometheus | quote/provider-circuit-breaker.ts | Cannot monitor circuit health |
| 22 | ZeroX not instrumented for metrics | quote/providers/zeroX.ts | No visibility into provider failures |
| 23 | Signing coordinator has zero metrics | custody/signing-coordinator.ts | No audit trail for signing |
| 24 | Worker doesn't propagate trace context | scheduler/trade.worker.ts | Trace timeline incomplete |
| 25 | `upsertAggregateStats` writes `totalPendingUsd=0` | risk/aggregate-risk.ts:282 | Pending stat always zero |
| 26 | `getPendingTransactionStats` has dead code branch | risk/aggregate-risk.ts:100 | Correct fallback always used |
| 27 | No periodic stale occurrence reconciliation | scheduler/scheduler-service.ts | Long-running scheduler drift |
| 28 | No max attempt enforcement on occurrence | scheduler/occurrence.service.ts | Infinite retry possible |

---

## Medium Priority Technical Debt

| # | Debt | Location |
|---|------|---------|
| 29 | `ETH_USD_PRICE` hardcoded $3.50 placeholder | scheduler/preflight.service.ts:86 |
| 30 | `estimatedTradeUsd` always returns "1.00" | scheduler/preflight.service.ts:290 |
| 31 | `ciGreen` check uses passive env var | readiness/readiness-service.ts:114 |
| 32 | MFA TOTP verify has no documented rate limit | auth/mfa-routes.ts |
| 33 | 12-hour fixed session TTL, no sliding window | auth/session-store-factory.ts |
| 34 | MFA not per-operation (only at login) | auth/ |
| 35 | Bulk wallet ops no auth | wallet routes |
| 36 | Scheduler no max loop jitter | scheduler/scheduler-service.ts |
| 37 | Scheduler no worker aliveness check | scheduler/scheduler-service.ts |
| 38 | DLQ replay doesn't revalidate occurrence state | scheduler/dlq.service.ts |
| 39 | No DLQ entry TTL | scheduler/dlq.service.ts |
| 40 | No balance check before dry-run scheduling | scheduler/scheduler-service.ts |
| 41 | Unique index on `occurrenceKey` not verified | db/schema.ts |
| 42 | `scheduler_jobs.status` has no enum constraint | db/schema.ts:659 |
| 43 | mTLS is header-based, not real TLS cert | custody/providers/external-http-signer.ts |
| 44 | External signer no retry on 5xx | custody/providers/external-http-signer.ts |
| 45 | No signature verification on external signer | custody/providers/external-http-signer.ts |
| 46 | API latency histogram missing | ops/metrics.ts |
| 47 | `recordNotificationFailure` not called | notifications/telegram.ts |
| 48 | `recordSimulationFailure` not called | strategy/planner.ts |
| 49 | `recordAggregateRiskReject` not called | risk/aggregate-risk.ts |
| 50 | Wallet quarantine chaos scenario non-functional | scheduler/chaos-scenarios.ts |

---

## Placeholder Values in Code

| Location | Placeholder | Impact |
|----------|-------------|--------|
| `preflight.service.ts:86` | `ETH_USD_PRICE = "3.50"` | Wrong gas USD estimates |
| `preflight.service.ts:290` | `estimatedTradeUsd = "1.00"` | Wrong trade USD estimates |
| `zeroX.ts:101` | `priceImpactBps: null` | Price impact check bypassed |
| `aggregate-risk.ts:282` | `totalPendingUsd: "0"` | Pending exposure always zero |
| `readiness-service.ts:109` | `isLiveSchedulerEnabled: false` | Readiness check 20 is a no-op |
| `readiness-service.ts:110-112` | `true` for checks 21-23 | Custody checks are no-ops |

---

## Dead Code Paths

| Path | Called From Routes? | Notes |
|------|---------------------|-------|
| `SigningCoordinator.signTransaction` | ❌ NO | All signing uses direct viem |
| `SignerPolicyEngine.check` | ❌ NO | Bypassed by direct signing |
| `ExternalHttpSignerProvider` | ❌ NO | Never instantiated in signing path |
| `recordQuote / recordRisk / recordJobQueued` | ❌ NO | Defined but never called |
| `recordSimulationFailure` | ❌ NO | Never called |
| `recordAggregateRiskReject` | ❌ NO | Never called |
| `setProviderCircuitState` | ❌ NO | Never called |
| `recordNotificationFailure` | ❌ NO | Never called |
| `recordProvider429` | ❌ NO | Never called |