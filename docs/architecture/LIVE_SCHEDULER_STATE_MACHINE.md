# Live Scheduler State Machine

**Date:** 2026-05-21
**Status:** DESIGN ONLY

---

## 1. State Definitions

| State | Description | Live Signing |
|-------|-------------|-------------|
| `DISABLED` | Live scheduler explicitly disabled in config | BLOCKED (hard) |
| `BLOCKED_BY_READINESS` | One or more readiness checks failing | BLOCKED (hard) |
| `READY_FOR_DRY_RUN` | Dry-run mode fully operational | N/A |
| `READY_FOR_OPERATOR_REVIEW` | All readiness gates pass | BLOCKED |
| `LIMITED_LIVE_CANARY` | Canary window open, operator-approved | ALLOWED (canary rules) |
| `PAUSED` | Operator-initiated pause | BLOCKED |
| `EMERGENCY_PAUSED` | Global or wallet emergency pause active | BLOCKED (hard) |
| `QUARANTINED` | Quarantine condition detected | BLOCKED (hard) |
| `RETIRED` | Live permanently decommissioned | BLOCKED forever |

---

## 2. State Transition Diagram

```
                         ┌──────────────────────────────────────────┐
                         │            DISABLED                       │
                         │  (schedulerLiveExecution = false)         │
                         └─────────────────┬────────────────────────┘
                                           │ operator enables
                         ┌─────────────────▼────────────────────────┐
                         │     BLOCKED_BY_READINESS               │
                         │  (readiness check fails)                │
                         └─────────────────┬──────────────────────┘
                                           │ all readiness checks pass
                    ┌─────────────────────▼────────────────────────┐
                    │     READY_FOR_OPERATOR_REVIEW                │
                    │  (operator sees approval screen)              │
                    └─────────────────────┬────────────────────────┘
                                          │ operator approves canary
                    ┌─────────────────────▼────────────────────────┐
                    │       LIMITED_LIVE_CANARY                     │
                    │  • one wallet, one verified pair             │
                    │  • max N tx (e.g., 3)                         │
                    │  • tiny max trade USD (e.g., $25/tx)         │
                    │  • window duration (e.g., 4h)                │
                    │  • no auto retry signing                      │
                    │  • 2 block finality required                 │
                    └─────────────────────┬─────────────────────────┘
                                          │ window expires OR N tx
                                          │ OR operator terminates
                     ┌────────────────────▼────────────────────────┐
                     │           PAUSED                              │
                     │  (returns to READY_FOR_OPERATOR_REVIEW)      │
                     └─────────────────────┬────────────────────────┘
                                           │
              ┌────────────────────────────┴────────────────────────┐
              │ emergency pause detected              │ quarantine     │
              ▼                                              ▼          │
   ┌─────────────────────┐                      ┌─────────────────────┐ │
   │   EMERGENCY_PAUSED  │                      │    QUARANTINED      │ │
   │     (hard block)     │                      │    (hard block)      │ │
   └──────────┬──────────┘                      └──────────┬─────────┘ │
              │ cleared by operator                      │ operator     │
              │                                         │ resolves      │
              └─────────────────────┬────────────────────┘             │
                                    ▼                                    │
                    ┌──────────────────────────────────────────────┐ │
                    │         READY_FOR_OPERATOR_REVIEW               │ │
                    └──────────────────────────────────────────────┘ │
```

---

## 3. Transition Table

| From | Event | To | Conditions |
|------|-------|----|------------|
| `DISABLED` | Operator sets `schedulerLiveExecution = true` AND all readiness checks pass | `BLOCKED_BY_READINESS` | Config flag change |
| `DISABLED` | Operator sets `schedulerLiveExecution = true` AND readiness fails | `BLOCKED_BY_READINESS` | — |
| `BLOCKED_BY_READINESS` | All readiness checks pass | `READY_FOR_OPERATOR_REVIEW` | — |
| `BLOCKED_BY_READINESS` | Readiness check fails | remains | — |
| `READY_FOR_OPERATOR_REVIEW` | Operator approves canary window | `LIMITED_LIVE_CANARY` | MFA confirmed + phrase confirmed |
| `READY_FOR_OPERATOR_REVIEW` | Readiness check fails | `BLOCKED_BY_READINESS` | Any check failure |
| `LIMITED_LIVE_CANARY` | Window duration expires | `PAUSED` | Auto |
| `LIMITED_LIVE_CANARY` | N transactions completed (N = configured max) | `PAUSED` | Auto |
| `LIMITED_LIVE_CANARY` | Operator terminates early | `PAUSED` | MFA + phrase confirmed |
| `LIMITED_LIVE_CANARY` | Emergency pause triggered | `EMERGENCY_PAUSED` | Auto |
| `LIMITED_LIVE_CANARY` | Quarantine condition detected | `QUARANTINED` | Auto |
| `PAUSED` | Operator dismisses pause | `READY_FOR_OPERATOR_REVIEW` | All checks still passing |
| `PAUSED` | Readiness check fails | `BLOCKED_BY_READINESS` | — |
| `EMERGENCY_PAUSED` | Operator clears emergency pause | `READY_FOR_OPERATOR_REVIEW` | All checks pass |
| `EMERGENCY_PAUSED` | Operator clears emergency pause | `BLOCKED_BY_READINESS` | Some checks failed |
| `QUARANTINED` | Operator resolves root cause + unquarantines | `READY_FOR_OPERATOR_REVIEW` | All checks pass |
| `QUARANTINED` | Operator resolves root cause | `BLOCKED_BY_READINESS` | Some checks failed |

---

## 4. No-Go Conditions Per Transition

### Hard Blocks (Cannot Be Overridden)

| ID | Condition | Blocks Transition To |
|----|-----------|---------------------|
| H1 | `schedulerLiveExecution = false` | Any state above DISABLED |
| H2 | Emergency pause active | `LIMITED_LIVE_CANARY` |
| H3 | Vault locked | `LIMITED_LIVE_CANARY` |
| H4 | Wallet quarantined | `LIMITED_LIVE_CANARY` |
| H5 | Monthly drill overdue | `LIMITED_LIVE_CANARY` |
| H6 | Quarterly backup drill overdue | `LIMITED_LIVE_CANARY` |
| H7 | MFA not configured for operator | `LIMITED_LIVE_CANARY` |

### Readiness-Gated (Operator-Gated, Must Acknowledge)

| ID | Condition | Blocks |
|----|-----------|--------|
| R1 | Demo mode enabled | Canary window |
| R2 | Dry run disabled | Canary window |
| R3 | Aggregate risk disabled | Canary window |
| R4 | Token not verified | Canary window |
| R5 | Router not verified | Canary window |
| R6 | Spender not verified | Canary window |
| R7 | Missing emergency drill artifact | Canary window |
| R8 | Missing backup drill artifact | Canary window |
| R9 | No tiny live wallet | Canary window |
| R10 | Tiny wallet not paused | Canary window |
| R11 | Stuck/dropped wallet detected | Canary window |
| R12 | CI not green | Canary window |
| R13 | Custody provider unhealthy | Canary window |
| R14 | Exact approval flow unavailable | Canary window |
| R15 | Revoke flow unavailable | Canary window |
| R16 | USD-normalized risk not configured | Canary window |
| R17 | DLQ not operational | Canary window |
| R18 | Trace ID not wired | Canary window |

---

## 5. DISABLED State — The Permanent No-Go

The `DISABLED` state is the **default and permanent state** of the live scheduler. It cannot be exited without explicit operator action to change the config flag AND all readiness checks passing.

```
DISABLED is the only state where the following are true:
  • trade.worker.ts will reject any LIVE mode job at line 1
  • scheduler service will not enqueue LIVE mode jobs
  • readiness center shows schedulerLiveDisabled = pass
  • no canary window can be opened
  • no emergency pause can be "cleared" because there is nothing to clear
```

### Entering DISABLED

- Default on fresh deployment
- Operator sets `schedulerLiveExecution = false`
- Any state can return to DISABLED via operator action

### Exiting DISABLED

Requires ALL of:
1. Operator sets `schedulerLiveExecution = true` (in config, not runtime)
2. All 23+ readiness checks pass
3. Monthly drill artifact present and current
4. Quarterly backup drill artifact present and current
5. MFA configured for operator account
6. All operator-gated conditions acknowledged

---

## 6. State Summary for UI

| State | UI Lock Screen? | Show Blockers? | Show Canary Controls? | Kill Switch Visible? |
|-------|----------------|---------------|---------------------|---------------------|
| `DISABLED` | Yes | Yes (if any) | No | No |
| `BLOCKED_BY_READINESS` | Yes | Yes | No | No |
| `READY_FOR_OPERATOR_REVIEW` | No | No | Yes (setup form) | No |
| `LIMITED_LIVE_CANARY` | No | No | Yes (active window) | Yes |
| `PAUSED` | Yes | Yes (if any) | No | Yes (resume/terminate) |
| `EMERGENCY_PAUSED` | Yes | Yes | No | Yes (emergency) |
| `QUARANTINED` | Yes | Yes | No | Yes (recovery wizard) |
| `RETIRED` | Yes | No | No | No |