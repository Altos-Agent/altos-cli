# Live Scheduler — Controlled Live Design

**Date:** 2026-05-21
**Status:** DESIGN ONLY — No live scheduler implementation

---

## 1. Overview and Design Principles

### Purpose
This document specifies a controlled live scheduler architecture that **requires explicit, independent, multi-layer gates** before any live transaction can be signed. The live scheduler remains disabled until all gates are satisfied through a staged canary rollout.

### Core Principles

1. **Never enable by accident** — Every path to live signing requires explicit configuration + operator action + MFA confirmation.
2. **Fail-safe by default** — Any misconfiguration, component failure, or drill expiration returns to blocked state.
3. **USD-normalized risk accounting** — All notional limits use USD-normalized values, never raw token units.
4. **Canary-first rollout** — All live activity starts as single-wallet, single-pair, tiny-notional canary with manual operator approval per window.
5. **Observability before activity** — No live path opens unless traces, DLQ, and alerting are fully operational.

### Hard Constraints (Non-Negotiable)

- `processTradeJob(mode=LIVE)` must never sign a transaction until all gates pass.
- No live implementation path can be merged that bypasses the readiness center.
- Monthly emergency pause drill must pass before any live window opens.
- Quarterly backup/restore drill must pass before any live window opens.
- Canary mode is the ONLY allowed path to live execution.

---

## 2. Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────┐
│              LIVE SCHEDULER DISABLED                        │
│  • env flag: schedulerLiveExecution must remain false      │
│  • runtime check: trade.worker.ts blocks LIVE mode         │
│  • readiness check: schedulerLiveDisabled must pass        │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐   ┌───────────────┐   ┌──────────────┐  │
│  │ Scheduler    │──▶│ Readiness     │──▶│ Signer       │  │
│  │ Service      │   │ Center        │   │ Policy       │  │
│  │ (DISABLED     │   │ (23+ checks,  │   │ Engine       │  │
│  │  state)       │   │  LIVE checks  │   │ (pre-sign    │  │
│  │               │   │  added)        │   │  gate)        │  │
│  └──────┬───────┘   └───────────────┘   └──────┬───────┘  │
│         │                                      │           │
│  ┌──────▼───────┐                       ┌──────▼───────┐  │
│  │ Occurrence   │                       │ Aggregate    │  │
│  │ Service      │                       │ Risk Engine  │  │
│  │ (idempotency │                       │ (USD-norm    │  │
│  │  enforced)   │                       │  limits)     │  │
│  └──────┬───────┘                       └──────┬───────┘  │
│         │                                      │           │
│  ┌──────▼───────┐   ┌───────────────┐   ┌──────▼───────┐  │
│  │ Trade        │──▶│ Circuit       │──▶│ External     │  │
│  │ Worker       │   │ Breaker       │   │ Signer/KMS   │  │
│  │ (LIVE blocked│   │ (provider     │   │ (custody or  │  │
│  │  at line 1)  │   │  resilience)   │   │  cloud KMS)  │  │
│  └──────┬───────┘   └───────────────┘   └──────────────┘  │
│         │                                                │
│  ┌──────▼───────┐   ┌───────────────┐   ┌──────────────┐  │
│  │ DLQ          │   │ Quarantine   │   │ Nonce        │  │
│  │ (LIVE replay │   │ Monitor      │   │ Reservation  │  │
│  │  explicitly  │   │              │   │              │  │
│  │  blocked)    │   │              │   │              │  │
│  └──────────────┘   └──────────────┘   └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### External Dependencies Required Before Live

| Dependency | Current Status | Required Before Live |
|------------|--------------|---------------------|
| External signer/KMS provider | Plumbed but not live | Custody provider healthy + operator-configured |
| Signer policy engine | Exists (dry-run) | Must pass all live-specific rules |
| USD-normalized aggregate risk | Exists | Must be enabled + configured |
| Verified token/router/spender registry | Exists | All trading pairs must be verified |
| Provider circuit breaker | Exists | Must be tuned for live concurrency |
| Schedule occurrence idempotency | Exists | Must handle LIVE concurrency |
| Nonce reservation | Documented, not impl. | Must be implemented before live |
| Wallet quarantine | Exists (UNCERTAIN/QUARANTINED) | Active monitoring + alerting |
| Trace/correlation ID | Documented | Must wire through all layers |
| DLQ with backoff | Exists (DRY_RUN replay only) | LIVE DLQ replay blocked forever |
| Readiness center | Exists (23 checks) | Must add LIVE-specific checks |
| Load test artifacts | Dry-run exists | LIVE load test required |
| Emergency pause drill | Documented | Monthly validation required |
| Backup/restore drill | Documented | Quarterly validation required |
| MFA/RBAC | Exists | Live operators require MFA |
| Production env hardening | Partial | Full hardening checklist |

---

## 3. State Machine

See `LIVE_SCHEDULER_STATE_MACHINE.md` for full state diagram, transitions, and no-go conditions.

### States

| State | Live Signing | Description |
|-------|-------------|-------------|
| `DISABLED` | BLOCKED | Live scheduler explicitly off |
| `BLOCKED_BY_READINESS` | BLOCKED | Readiness check failing |
| `READY_FOR_DRY_RUN` | N/A | Dry-run operational |
| `READY_FOR_OPERATOR_REVIEW` | BLOCKED | All gates pass, awaiting approval |
| `LIMITED_LIVE_CANARY` | ALLOWED (canary rules) | Canary window open |
| `PAUSED` | BLOCKED | Operator-initiated pause |
| `EMERGENCY_PAUSED` | BLOCKED (hard) | Emergency pause active |
| `QUARANTINED` | BLOCKED (hard) | Quarantine condition |
| `RETIRED` | BLOCKED forever | Permanently decommissioned |

---

## 4. Canary Mode Design

See `LIVE_SCHEDULER_CANARY_PLAN.md` for full canary specification.

### Canary Parameters

| Parameter | Value |
|-----------|-------|
| Wallet | 1 dedicated tiny live wallet |
| Trading pair | 1 verified pair only |
| Max trade USD | $10–50 per tx |
| Max tx/day | 1–3 tx |
| Approval window | 4 hours (configurable) |
| Auto pause after N tx | N=3 (configurable) |
| Manual re-approval | Required per window |
| Auto retry signing | BLOCKED |
| Finality required | Yes — 2 block confirmations |
| Revoke flow | Must be available before first window |

---

## 5. Risk Policy

### Global Risk Limits

| Limit | Default | Hard Block? |
|-------|---------|-------------|
| Max global daily tx count | 50 | Yes |
| Max global daily notional USD | $10,000 | Yes |
| Max pending notional USD | $2,000 | Yes |
| Max gas per tx USD | $50 | Yes |
| Max failed tx/day per wallet | 5 | Yes |
| Max wallet concurrency | 3 | Yes |
| Max provider concurrency | 5 | Yes |
| Max pair concentration | 40% | Yes |

### Risk Check Order (Pre-Sign Gate)

```
1. wallet status = ACTIVE                      → hard block
2. wallet not quarantined                     → hard block
3. nonce status = CLEAN                        → hard block
4. emergency pause OFF                          → hard block
5. global daily tx count < limit               → soft block
6. global daily notional < limit               → soft block
7. global pending notional < limit             → soft block
8. wallet daily tx count < limit               → soft block
9. wallet daily notional < limit               → soft block
10. pair concentration < 40%                   → soft block
11. gas estimate < wallet.maxGasUsd           → soft block
12. trade USD < wallet.maxTradeUsd             → soft block
13. price impact < 3%                          → soft block
14. quote age < 30 seconds                     → hard block
```

---

## 6. Failure Behavior

See Section 7 of this document for detailed failure specifications.

### Key Principle
LIVE jobs that fail are **never auto-replayed**. Operator manual re-approval is required for every retry.

| Failure | DLQ Recorded? | Auto Retry? | Operator Action |
|----------|---------------|-------------|-----------------|
| Provider 429 | Yes | No | Wait 30s cooldown |
| Simulation failed | Yes | No | Investigate root cause |
| Signing failure | Yes | No | Manual re-approval |
| Nonce mismatch | Yes | No | Nonce reconciliation |
| Gas exhausted | Yes | No | Wallet refuel |
| Any LIVE job | Yes | NO REPLAY | Re-approve manually |

---

## 7. Detailed Failure Behaviors

### Provider and Quote Failures

| Failure | Detection | Immediate Action | Retry |
|---------|-----------|-----------------|-------|
| Provider 429 | HTTP 429 | Open circuit breaker, mark degraded | 30s cooldown then half-open probe |
| Stale quote >30s | quote.timestamp vs now | Reject, do not sign | Skip cycle |
| Simulation failed | preflight error | DLQ job, mark occurrence DLQ | NO auto retry for LIVE |
| Gas spike >2x baseline | estimatedGas > baseline * 2 | Reject quote, alert operator | Re-quote |
| High price impact >3% | priceImpact from quote engine | Reject trade, alert operator | Skip until cleared |

### Transaction Failures

| Failure | Detection | Action | Recovery |
|---------|-----------|--------|----------|
| Stuck tx >10min | Block timestamp check | Alert operator, mark wallet uncertain | Manual nonce investigation |
| Dropped tx | tx status = DROPPED | Alert, attempt nonce repair | Nonce reservation protocol |
| Nonce mismatch | expected nonce != on-chain | Quarantine wallet | Operator resolution required |
| Reorg | Block reorg detection | Alert, check wallet state | Operator reviews |
| Confirmation timeout >5min | After submission | Alert operator | Monitor |

### System Failures

| Failure | Action | Recovery |
|---------|--------|----------|
| Emergency pause | STOP all live workers immediately | Operator must disable |
| Redis restart | Pause schedulers, block new jobs | Wait for Redis |
| API restart | Workers reconnect via BullMQ | BullMQ handles re-queue |
| DB lock conflict | Retry once, then DLQ | Operator investigation |
| Alert delivery failure | Log locally, retry 3x | Fallback to file log |

---

## 8. UI Design

### 8.1 Live Scheduler Locked Screen
Full-screen locked state. Read-only. Shows state name, duration, readiness summary (X/23 checks passing), blocker list if any. No action buttons.

### 8.2 Readiness Blockers View
Accordion blocker list grouped by category. Each blocker: check name, current value, required value, fix action. "Run Checks" and "Dismiss" buttons. Blockers categorized as Hard blocks vs Operator-gated.

### 8.3 Canary Controls Panel
**READY_FOR_OPERATOR_REVIEW:** Pair selector (verified only), max trade USD, max tx/day, window duration, estimated exposure, "Open Canary Window" button (requires MFA).
**LIMITED_LIVE_CANARY:** Countdown timer, tx counter "1 of 3", "Terminate Early" button, live tx status feed, window expiry display.

### 8.4 Wallet/Pair Limits View
Read-only dashboard. Per-wallet: daily tx, daily notional, nonce status. Per-pair: 24h volume, concentration %, pair limit. Global: daily tx, daily notional, pending notional. Visual progress bars: <60% green, 60–80% yellow, 80–100% orange, >100% red.

### 8.5 Live Occurrence Timeline
Time-series view of LIVE occurrences. X-axis: time (24h rolling). Y-axis: notional USD. Colors: confirmed green, pending yellow, failed red, queued gray. Hover for details. Filters: wallet, pair, status, time range.

### 8.6 Kill Switch
Always visible in header when in canary/live state.
- CANARY ACTIVE (yellow) → terminate confirmation
- LIVE PAUSED (orange) → resume/terminate choice
- EMERGENCY (red pulsing) → initiate emergency pause
All kill actions require phrase confirmation + MFA.

### 8.7 Recovery Wizard
4-step wizard after QUARANTINED, emergency pause cleared, or DLQ overflow.
- Step 1: Diagnose — diagnostic info shown
- Step 2: Options — recovery actions presented
- Step 3: Confirm — MFA + phrase confirmation
- Step 4: Execute — progress shown

---

## 9. References

- `LIVE_SCHEDULER_STATE_MACHINE.md` — State diagram, transitions, no-go conditions
- `LIVE_SCHEDULER_NO_GO_GATES.md` — Hard gates, operator-gated gates, drill requirements
- `LIVE_SCHEDULER_CANARY_PLAN.md` — Canary mode specification
- `NO_GO_CONDITIONS.md` — Baseline no-go conditions (extended here)
- `LIVE_READINESS_CENTER.md` — Readiness center (extended with LIVE checks)
- `USD_NORMALIZED_RISK_ACCOUNTING.md` — USD-normalized risk rules
- `SIGNER_POLICY_ENGINE.md` — Signer policy rules
- `EMERGENCY_PAUSE_DRILL.md` — Emergency pause drill
- `BACKUP_RESTORE_DRILL.md` — Backup/restore drill
- `SCHEDULE_OCCURRENCE_IDEMPOTENCY.md` — Occurrence idempotency
- `NONCE_RESERVATION_AND_RECOVERY.md` — Nonce reservation
- `TRACEABILITY.md` — Trace/correlation ID