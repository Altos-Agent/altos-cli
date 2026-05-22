# 14 — Final No-Go Conditions

**Date:** 2026-05-21
**Status:** COMPLETE — LIVE AUTOMATION HARD NO-GO

---

## Principle

> **When in doubt, block.**

The system is designed to fail-safe. Any misconfiguration, component failure, or expired artifact returns the system to a blocked state. Live scheduled execution must remain disabled until every gate below is satisfied through an explicit, validated implementation.

---

## Layer 1: Hard No-Go (Cannot Be Overridden — Ever)

These conditions, if true, block ALL live execution paths permanently until explicitly fixed and verified.

| ID | Condition | Current State | How Verified |
|----|-----------|--------------|-------------|
| H1 | `SCHEDULER_LIVE_EXECUTION=true` env flag | FALSE (default) | Env config check |
| H2 | `trade.worker.ts` LIVE block removed | BLOCKED (line 98-109) | Code review |
| H3 | Emergency pause active | FALSE | `GET /api/emergency-pause/status` |
| H4 | Vault locked | TRUE (locked by default) | Vault lock status |
| H5 | DLQ LIVE replay allowed | BLOCKED (dlq.service.ts:211) | Code review |
| H6 | Monthly emergency drill overdue | Check artifact date in `.readiness/artifacts/` | File system |
| H7 | Quarterly backup drill overdue | Check artifact date in `.readiness/artifacts/` | File system |
| H8 | MFA not configured for operator | Operator login MFA flow | Operator account check |
| H9 | Live scheduler flag `isLiveSchedulerEnabled` returns false | FALSE in readiness context | Readiness check C20 |

---

## Layer 2: Operator-Gated No-Go (Require Acknowledgment + Fix)

These conditions block live paths until fixed or explicitly acknowledged by a role-1 or role-2 operator.

| ID | Condition | Fix Required |
|----|-----------|-------------|
| G1 | Demo mode enabled | Set `DEMO_MODE=false` |
| G2 | Dry run disabled | Enable dry-run mode |
| G3 | Aggregate risk disabled | Enable risk engine |
| G4 | Token not verified | Verify token via registry workflow |
| G5 | Router not verified | Verify router via registry workflow |
| G6 | Spender not verified | Verify spender via registry workflow |
| G7 | Missing backup drill artifact | Complete and upload artifact |
| G8 | Missing emergency drill artifact | Complete and upload artifact |
| G9 | No tiny live wallet | Provision tiny live wallet |
| G10 | Tiny live wallet not paused | Set wallet status to PAUSED |
| G11 | Stuck or dropped tx detected | Resolve all STUCK/DROPPED tx |
| G12 | CI not green | Fix failing CI |
| G13 | Telegram not tested | Send test notification |
| G14 | Dry-run load test not run | Run and upload artifact |
| G15 | Metrics token not configured | Set `METRICS_TOKEN` env var |
| G16 | Custody provider unhealthy | Verify custody provider |
| G17 | Exact approval flow unavailable | Verify vault approve flow |
| G18 | Revoke flow unavailable | Verify vault revoke flow |
| G19 | USD-normalized risk not configured | Verify risk limits are USD-denominated |

---

## Layer 3: Live Scheduler Specific (Before Any LIVE_PATH)

Required before enabling `SCHEDULER_LIVE_EXECUTION=true` or opening any canary window.

| ID | Condition | Status |
|----|-----------|--------|
| L1 | SigningCoordinator wired into execution path | ❌ DEAD CODE |
| L2 | SignerPolicyEngine wired into execution path | ❌ DEAD CODE |
| L3 | Pre-sign aggregate risk gate in scheduler worker | ❌ NOT IMPLEMENTED |
| L4 | Nonce reservation integrated into scheduler | ❌ NOT INTEGRATED |
| L5 | Fetch timeout on ZeroX provider | ❌ NOT IMPLEMENTED |
| L6 | Multi-provider fallback | ❌ NOT IMPLEMENTED |
| L7 | Trace event recording wired | ❌ NOT IMPLEMENTED |
| L8 | Auth on scheduler pause/stop | ❌ MISSING |
| L9 | Auth on wallet pause/resume/disable | ❌ MISSING |
| L10 | Auth on emergency pause enable | ❌ MISSING |
| L11 | Rate limit on execute-once | ❌ MISSING |
| L12 | Vault state distributed (not per-worker) | ❌ IN-MEMORY ONLY |
| L13 | Circuit breaker state in Prometheus | ❌ NOT WIRED |
| L14 | Scheduler lock is atomic | ❌ RACE CONDITION |
| L15 | MFA per-operation enforced | ❌ LOGIN ONLY |
| L16 | `isLiveSchedulerEnabled` read from real config | ❌ HARDCODED FALSE |

---

## Layer 4: Canary Mode Preconditions

Required before opening any canary window.

| Precondition | Requirement |
|-------------|-------------|
| State = `READY_FOR_OPERATOR_REVIEW` | All 23 checks passing |
| Canary wallet provisioned + PAUSED | Wallet with purpose=TINY_LIVE |
| Canary pair verified | Token + router + spender all verified |
| Revoke flow verified | Canary wallet can revoke approvals |
| Operator re-auth within 5 minutes | `requireReauth()` passes |
| MFA configured | TOTP secret set on operator account |
| Window duration set | 1-8 hours |
| Max tx set | 1-3 transactions |
| Max trade USD set | $10-$50 per transaction |

---

## Drill Expiration Policy

| Drill | Expiration | Blocking State |
|-------|-----------|----------------|
| Emergency pause drill | 30 days | Any state above DISABLED |
| Backup/restore drill | 90 days | Any state above DISABLED |
| Dry-run load test | Until next config change | TINY_MANUAL_LIVE_BLOCKED |

If a drill artifact is overdue, the system returns to `BLOCKED_BY_READINESS` until a new drill is completed and artifact uploaded.

---

## What Can Be Used at Each Readiness State

| State | Demo | Dry-Run | Execute-Once Live | Scheduled Live |
|-------|------|---------|-------------------|----------------|
| `DEMO_READY` | ✅ | ❌ | ❌ | ❌ |
| `DRY_RUN_READY` | ❌ | ✅ | ❌ | ❌ |
| `MULTI_WALLET_DRY_RUN_READY` | ❌ | ✅ | ❌ | ❌ |
| `TINY_MANUAL_LIVE_BLOCKED` | ❌ | ✅ | ❌ | ❌ |
| `TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW` | ❌ | ✅ | ✅* | ❌ |
| `LIVE_AUTOMATION_HARD_NO_GO` | ❌ | ✅ | ❌ | ❌ (blocked forever) |

*Execute-once with explicit operator confirmation per trade.

---

## No-Go for LIVE_AUTOMATION

`LIVE_AUTOMATION_HARD_NO_GO` is a permanent state. There is no transition out of it without an explicit, reviewed, tested implementation phase that addresses all 16 Layer-3 items plus all Layer-1 and Layer-2 items.

**This is intentional.** Live automation requires all safety mechanisms to be real and wired, not stubbed or hardcoded. The state machine encodes this as a hard permanent no-go.

---

## Verdict

| Gate Layer | Gate Count | Currently Passing |
|------------|-----------|-------------------|
| Layer 1 (Hard) | 9 | 9/9 ✅ |
| Layer 2 (Operator-Gated) | 19 | Unknown — depends on config |
| Layer 3 (Live Scheduler) | 16 | 0/16 ❌ |
| Layer 4 (Canary) | 9 | Unknown — depends on setup |

**Live scheduler cannot be safely enabled.** Layer 3 has 0/16 items implemented. The execution path still bypasses the signer policy engine, aggregate risk, and nonce reservation entirely.

**Recommendation:** Live scheduler remains disabled. Address Layer-3 items in a dedicated implementation phase before any live path can open.