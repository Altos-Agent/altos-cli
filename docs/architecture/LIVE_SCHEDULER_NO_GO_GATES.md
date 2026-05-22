# Live Scheduler No-Go Gates

**Date:** 2026-05-21
**Status:** DESIGN ONLY

---

## 1. Overview

Every path to live signing requires passing through layered gates. This document defines the complete set of no-go conditions — conditions that definitively block live execution — and the criteria for clearing them.

The principle: **When in doubt, block.**

---

## 2. Hard No-Go Gates

Hard no-go gates cannot be overridden by any operator action. They represent physical, architectural, or regulatory constraints.

| ID | Gate | Description | Current Status | How to Clear |
|----|------|-------------|----------------|--------------|
| H1 | Live scheduler disabled | `schedulerLiveExecution` config flag must remain `false` | Pass (flag is false) | NEVER change flag |
| H2 | Emergency pause active | `globalEmergencyPaused = true` blocks all live | Pass (not paused) | NEVER active |
| H3 | Vault locked | Private keys not accessible for signing | Pass (vault lock exists) | NEVER bypass vault lock |
| H4 | LIVE job in trade worker | `processTradeJob(mode=LIVE)` must throw at entry | Pass (hard block exists at line 1) | NEVER remove block |
| H5 | Monthly drill overdue | Emergency pause drill not completed in last 30 days | Check artifact date | Run monthly drill |
| H6 | Quarterly backup drill overdue | Backup/restore drill not completed in last 90 days | Check artifact date | Run quarterly drill |
| H7 | MFA not configured for operator | Operator account lacks TOTP secret | Check MFA service | Operator sets up MFA |
| H8 | DLQ LIVE replay not blocked | DLQ must reject replay of LIVE jobs | Check dlq.service.ts | Ensure replay check exists |

---

## 3. Operator-Gated No-Go Gates

Operator-gated gates require operator acknowledgment but can be cleared by a role-1 or role-2 operator after fixing the underlying condition.

| ID | Gate | Description | Fix Required |
|----|------|-------------|--------------|
| G1 | Demo mode enabled | System not in production configuration | Set `NODE_ENV=production`, disable demo mode |
| G2 | Dry run disabled | Dry run not operational | Enable dry run, verify at least 3 successful dry runs |
| G3 | Aggregate risk disabled | No risk guardrails active | Enable aggregate risk engine with USD-normalized limits |
| G4 | Token not verified | Token address not confirmed on Basescan | Verify token via registry workflow |
| G5 | Router not verified | Router not confirmed on Basescan | Verify router via registry workflow |
| G6 | Spender not verified | Spender address not confirmed on Basescan | Verify spender via registry workflow |
| G7 | Missing backup drill artifact | Backup/restore drill not completed | Complete drill, upload artifact |
| G8 | Missing emergency drill artifact | Emergency drill not completed | Complete drill, upload artifact |
| G9 | No tiny live wallet | No dedicated wallet for canary | Provision tiny live wallet |
| G10 | Tiny wallet not paused | Canary wallet must start paused | Set wallet status to PAUSED |
| G11 | Stuck/dropped wallet | System health issue detected | Resolve stuck tx, clear nonce issues |
| G12 | CI not green | Untested code in deployment | Fix failing CI, merge tested code |
| G13 | Missing Telegram test | Alert channel not verified | Complete Telegram integration test |
| G14 | Missing dry-run load test artifact | Performance under load not validated | Run dry-run load test, upload artifact |
| G15 | Metrics token not configured | Observability gap | Configure metrics token in env |
| G16 | Custody provider unhealthy | Custody layer not operational | Verify custody provider health |
| G17 | Exact approval flow unavailable | Cannot set precise approval | Verify approve flow in vault |
| G18 | Revoke flow unavailable | Cannot revoke approval | Verify revoke flow in vault |
| G19 | Aggregate risk not USD-normalized | Risk accounting not comparable | Configure USD price source for all pairs |
| G20 | DLQ not operational | DLQ service not reachable | Verify Redis and DLQ service |
| G21 | Trace ID not wired | Correlation IDs not propagating | Wire trace ID through all layers |
| G22 | Nonce reservation not implemented | No nonce tracking for concurrent live | Implement nonce reservation |

---

## 4. Live-Specific Readiness Checks

These checks extend the existing 23-check readiness center for live scheduler mode. They must be added alongside the existing checks before the live scheduler can enter `READY_FOR_OPERATOR_REVIEW`.

### Category 6: Live Scheduler Specific (IDs 24–31)

| ID | Check Name | Requirement | Failure State |
|----|-----------|-------------|---------------|
| L1 | `liveSchedulerConfigEnabled` | `schedulerLiveExecution = true` in env (must be intentionally set) | `BLOCKED_BY_READINESS` |
| L2 | `nonceReservationImplemented` | Nonce reservation service is implemented and operational | `BLOCKED_BY_READINESS` |
| L3 | `canaryWalletProvisioned` | Canary wallet exists and is PAUSED | `BLOCKED_BY_READINESS` |
| L4 | `canaryPairVerified` | Canary pair (USDC→WETH) is verified in registry | `BLOCKED_BY_READINESS` |
| L5 | `monthlyDrillCurrent` | Emergency pause drill artifact < 30 days old | `BLOCKED_BY_READINESS` |
| L6 | `quarterlyBackupDrillCurrent` | Backup drill artifact < 90 days old | `BLOCKED_BY_READINESS` |
| L7 | `providerCircuitBreakerTuned` | Circuit breaker limits adjusted for live concurrency | `BLOCKED_BY_READINESS` |
| L8 | `signerPolicyLiveRulesEnabled` | Signer policy engine has all live rules enabled | `BLOCKED_BY_READINESS` |

---

## 5. Drill Requirements

### Monthly Emergency Pause Drill

**Must be completed every 30 days.**

Drill sequence:
1. Enable global emergency pause
2. Verify all schedulers stop immediately
3. Verify dry-run continues
4. Verify Telegram alert sent
5. Disable emergency pause
6. Verify schedulers resume
7. Upload artifact to readiness center

**If drill is overdue:**
- All states above `DISABLED` transition to `BLOCKED_BY_READINESS`
- Canary windows cannot be opened
- Live scheduler returns to `DISABLED` if already in canary

### Quarterly Backup/Restore Drill

**Must be completed every 90 days.**

Drill sequence:
1. Create full backup of DB and Redis state
2. Simulate catastrophic failure
3. Restore from backup
4. Verify scheduler state matches pre-failure
5. Verify no tx loss for in-flight occurrences
6. Upload artifact to readiness center

**If drill is overdue:**
- Same blocking behavior as monthly drill
- Must be current before first canary window can open

---

## 6. Canary Mode Preconditions

Before the `LIMITED_LIVE_CANARY` state can be entered from `READY_FOR_OPERATOR_REVIEW`, the following must all be true:

### Infrastructure Preconditions

| Precondition | Verification |
|-------------|---------------|
| Nonce reservation implemented | Nonce reservation service responds to health check |
| Provider circuit breaker tuned | Circuit breaker configured for live concurrency (not dry-run limits) |
| DLQ operational | DLQ service can record and list LIVE jobs |
| Trace ID wired | All API routes propagate trace ID |
| Redis HA | Redis is running with persistence enabled |
| Database replication | DB has read replica for risk queries |

### Operator Preconditions

| Precondition | Verification |
|-------------|---------------|
| Operator MFA configured | TOTP secret is set for operator account |
| Operator RBAC role = 1 or 2 | `requireRole(1)` passes |
| Operator re-auth window valid | `requireReauth()` passes within 5 minutes |
| Operator has not dismissed blockers | No session-dismissed blockers |

### Wallet Preconditions

| Precondition | Verification |
|-------------|---------------|
| Canary wallet exists | Wallet with `purpose=TINY_LIVE` exists |
| Canary wallet status = PAUSED | Wallet not accidentally ACTIVE before window |
| Canary wallet funded | Wallet has gas token + trade token |
| Canary wallet nonce = CLEAN | Nonce status = CLEAN |
| Canary wallet verified pair funded | USDC and WETH balances confirmed |

### Pair Preconditions

| Precondition | Verification |
|-------------|---------------|
| Pair verified in registry | Token, router, spender all verified |
| Pair has USD price feed | Price source configured |
| Pair price impact < 3% at time of window open | Verified at window open |

---

## 7. No-Go Gate Check Priority

When a blocker is encountered, gates are checked in this priority order:

```
Tier 1 — Physical Blocks (check first)
  1. schedulerLiveExecution = false         → always block
  2. Emergency pause active                → always block
  3. Vault locked                          → always block
  4. LIVE mode not blocked in trade.worker  → always block

Tier 2 — Drill Expiration (check second)
  5. Monthly drill overdue                 → block, show drill CTA
  6. Quarterly backup drill overdue        → block, show drill CTA

Tier 3 — MFA/RBAC (check third)
  7. Operator MFA not configured          → block, show MFA setup CTA
  8. Operator role insufficient           → block

Tier 4 — Readiness Checks (check fourth)
  9–31. All readiness checks pass         → proceed or block per check

Tier 5 — Canary Specific (check fifth)
  32. Canary wallet exists and PAUSED     → block if missing
  33. Canary pair verified               → block if not verified
  34. Canary operator re-auth valid       → block if expired
```

---

## 8. Gates Summary Table

| Gate ID | Gate Name | Gate Type | Blocks State | Blocks Transition |
|---------|-----------|-----------|-------------|-------------------|
| H1 | Live scheduler disabled | HARD | All | Any → above DISABLED |
| H2 | Emergency pause active | HARD | All | → CANARY |
| H3 | Vault locked | HARD | All | → CANARY |
| H4 | LIVE job not blocked | HARD | All | → CANARY |
| H5 | Monthly drill overdue | HARD | All | → CANARY |
| H6 | Quarterly drill overdue | HARD | All | → CANARY |
| H7 | MFA not configured | HARD | All | → CANARY |
| H8 | DLQ LIVE replay blocked | HARD | All | → CANARY |
| G1–G22 | Operator-gated gates | OPERATOR | CANARY | → CANARY |
| L1–L8 | Live-specific readiness | READINESS | All | → READY_FOR_OPERATOR_REVIEW |