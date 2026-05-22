# 01 — Executive Verdict

**Date:** 2026-05-21
**Status:** RELEASE CANDIDATE — CONDITIONAL
**Verdict:** SAFE FOR DRY-RUN / NOT READY FOR LIVE

---

## Top-Level Verdict

The system is a well-structured, safety-conscious crypto trading platform with defense-in-depth against accidental live trading. The live scheduler is disabled by design and hard-blocked at multiple layers. However, there are significant gaps that prevent it from being production-ready for live trading.

**Safe Now:** Dry-run mode with single-wallet, operator-reviewed tiny manual live execute-once trades.
**Not Safe Now:** Automated live scheduling, multi-wallet live trading, unattended operation.

---

## Live Scheduler Safety Guarantee

✅ **CONFIRMED: Live scheduler is architecturally disabled.**

| Layer | Mechanism | Status |
|-------|-----------|--------|
| Config | `SCHEDULER_LIVE_EXECUTION=false` env flag | ✅ Enforced |
| Runtime | `scheduler-service.ts` throws if flag is true | ✅ Enforced |
| Worker | `trade.worker.ts` throws "Live scheduled execution is not implemented" | ✅ Enforced |
| DLQ | `dlq.service.ts` blocks replay of LIVE jobs | ✅ Enforced |
| Readiness | `check20_schedul erLiveDisabled` — but **HARDCODED to pass** (see §14) |

**The live scheduler cannot activate through accident or misconfiguration.** However, if all gates are bypassed by future code changes, the signer policy engine and aggregate risk engine are **dead code paths** — they are never invoked in the current execution flow.

---

## Critical Findings Summary

### Hard Blockers (Must Fix Before Any Live Path)

| # | Finding | Severity | Section |
|---|---------|----------|---------|
| 1 | `SigningCoordinator` and `SignerPolicyEngine` are dead code — all signing bypasses them | CRITICAL | §03 |
| 2 | Scheduler execution path has no pre-sign aggregate risk gate | CRITICAL | §05 |
| 3 | MFA not required on per-operation basis — only enforced at login | CRITICAL | §03 |
| 4 | Wallet pause/resume/stop endpoints require **no authentication** | CRITICAL | §03 |
| 5 | Execute-once has no rate limit — most sensitive endpoint unprotected | CRITICAL | §03 |
| 6 | `isLiveSchedulerEnabled` hardcoded to `false` in readiness context — check 20 is a no-op | CRITICAL | §11 |

### High Priority (Should Fix Before Production)

| # | Finding | Severity | Section |
|---|---------|----------|---------|
| 7 | ZeroX provider has **no fetch timeout** — infinite hang possible | HIGH | §07 |
| 8 | Vault lock state is per-worker memory — inconsistent across workers | HIGH | §03 |
| 9 | Trace event recording functions defined but **never called** | HIGH | §08 |
| 10 | Circuit breaker state not exported to Prometheus metrics | HIGH | §08 |
| 11 | `getDlqStats()` loads entire DLQ table into memory — OOM risk | HIGH | §05 |
| 12 | `scheduler_jobs.status` has no enum constraint — silent bad values | HIGH | §06 |
| 13 | Lock acquisition in scheduler has a **race condition** | HIGH | §05 |
| 14 | Nonce reservation not integrated into scheduled dry-run path | MEDIUM | §06 |
| 15 | No multi-provider fallback — single point of failure | MEDIUM | §07 |

### Medium Priority

| # | Finding |
|---|---------|
| 16 | Price impact always `null` from ZeroX — price impact guard never fires |
| 17 | `ETH_USD_PRICE` hardcoded as `$3.50` placeholder in preflight |
| 18 | `ciGreen` readiness check uses passive env var, doesn't query real CI |
| 19 | 12-hour fixed session TTL with no sliding window |
| 20 | MFA TOTP verify endpoint has no documented rate limit |

---

## What Works Well

- **Emergency pause** enforced at every layer (API, scheduler, worker) and persisted to DB
- **USD-normalized risk accounting** — correctly implemented; raw token amounts never used
- **Verified registry enforcement** — tokens/routers/pairs checked at runtime for live mode
- **Circuit breaker** — full implementation with CLOSED/HALF_OPEN/OPEN states
- **Occurrence idempotency** — minute-bucket key with ON CONFLICT DO NOTHING
- **DLQ payload redaction** — safe fields only in DLQ records
- **Readiness center** — 23 checks with clear state machine
- **RBAC role hierarchy** — admin/operator/viewer with proper enforcement
- **Vault lock** — prevents signing when vault is locked
- **Prometheus metrics** — comprehensive counter-based metrics registry

---

## Product Readiness States

| State | Status | Notes |
|-------|--------|-------|
| **Local demo** | ✅ READY | Demo mode operational |
| **Dry-run** | ✅ READY | Multi-wallet dry-run validated |
| **Multi-wallet dry-run** | ✅ READY | Load test artifact required |
| **Tiny manual live (execute-once)** | ⚠️ CONDITIONAL | Works but MFA not per-op enforced |
| **Server deployment** | ⚠️ CONDITIONAL | Some hardening needed |
| **Live automation** | ❌ BLOCKED | Live scheduler hard-blocked; would be unsafe if enabled |

---

## What's Needed to Move Forward

### Before Tiny Manual Live (execute-once)
- Fix: MFA per-operation enforcement or document limitation
- Fix: Rate limit on `/api/trades/execute-once`
- Fix: Wallet status mutation endpoints need auth

### Before Live Scheduler Consideration
- Wire `SigningCoordinator.signTransaction` into execution path
- Add pre-sign aggregate risk gate in scheduler worker path
- Implement all trace event recording
- Fix `isLiveSchedulerEnabled` in readiness context
- Add fetch timeout to ZeroX provider
- Fix scheduler lock race condition
- Implement multi-provider fallback

---

## Release Recommendation

**✅ RECOMMENDED FOR DRY-RUN RELEASE**

The system is safe and well-structured for dry-run operation. It is **not ready** for any live trading path. The hard blockers are in the auth/custody layer, not the risk engine. With the critical auth fixes in place, execute-once live trades could be considered with explicit operator confirmation per trade.

**Live scheduler automation should remain blocked** until all 15 high-priority items are addressed and independently validated.

---

## Files in This Report

| # | Report | Primary Section |
|---|--------|----------------|
| 01 | Executive Verdict | This file |
| 02 | Product Capabilities | What the system can and cannot do |
| 03 | Security and Custody Review | Auth, RBAC, MFA, vault, external signer |
| 04 | Risk Engine Review | Aggregate risk, USD normalization, limits |
| 05 | Scheduler Automation Review | Scheduler, worker, occurrence, DLQ |
| 06 | Nonce and Transaction Safety | Nonce management, transaction state |
| 07 | Provider Resilience Review | Quote provider, circuit breaker |
| 08 | Observability and Trace Review | Metrics, traces, alerting |
| 09 | Auth, RBAC, Rate Limit Review | Auth routes, MFA, session management |
| 10 | Test, CI, Deployment Review | Test coverage, CI, Docker |
| 11 | Live Readiness Review | Readiness center, drill requirements |
| 12 | Remaining Technical Debt | Gaps, placeholders, known issues |
| 13 | Operator Runbooks | How to operate the system safely |
| 14 | Final No-Go Conditions | Complete no-go gate list |
| 15 | Audit Index | Cross-reference of all findings |