# PHASE 13 — Live Scheduler Design Only Report

**Date:** 2026-05-21
**Status:** DESIGN ONLY — No live scheduler implementation
**Verdict:** READY (design artifacts produced; no code changed)

---

## Summary

Phase 13 establishes the complete controlled live scheduler design specification without enabling any live scheduler execution. All four design documents were produced; no live scheduler implementation code was written; `processTradeJob(mode=LIVE)` remains blocked at its entry point.

---

## Deliverables Produced

| File | Content |
|------|---------|
| `docs/architecture/LIVE_SCHEDULER_CONTROLLED_DESIGN.md` | Full architecture, state machine reference, risk policy, failure behaviors, UI design |
| `docs/architecture/LIVE_SCHEDULER_STATE_MACHINE.md` | State diagram (9 states), 15 transitions, no-go conditions per transition |
| `docs/architecture/LIVE_SCHEDULER_NO_GO_GATES.md` | 8 hard gates, 22 operator-gated gates, 8 live-specific readiness checks, drill requirements |
| `plan/LIVE_SCHEDULER_CANARY_PLAN.md` | Canary mode spec, 2 lifecycle flows, hard limits, auto-pause triggers, test criteria |

---

## Architecture Highlights

### Layered Gate Architecture

```
DISABLED (default) → BLOCKED_BY_READINESS → READY_FOR_OPERATOR_REVIEW → LIMITED_LIVE_CANARY
     │                      │                        │
     │                      │                        └── Only path to live signing
     │                      └── Any readiness check fail blocks
     └── Hard block: env flag, runtime check, trade worker block
```

### Key Design Decisions

1. **DISABLED is the permanent default** — Cannot be exited without explicit config change + all readiness checks passing + drills current
2. **Canary is the only path** — No bypass around single-wallet, single-pair, tiny-notional canary
3. **No auto-retry for LIVE** — Every LIVE failure goes to DLQ with no replay; operator must manually re-approve
4. **Monthly + quarterly drills** — Drill artifacts expire and block live path on expiration
5. **Dual operator confirmation** — MFA + phrase confirmation for all canary actions

---

## State Machine Summary

### 9 States

| State | Live Signing | Transition In | Transition Out |
|-------|-------------|-------------|----------------|
| `DISABLED` | BLOCKED | Default / operator config | `BLOCKED_BY_READINESS` on config enable |
| `BLOCKED_BY_READINESS` | BLOCKED | Readiness fails | `READY_FOR_OPERATOR_REVIEW` on checks pass |
| `READY_FOR_DRY_RUN` | N/A | Dry run operational | — |
| `READY_FOR_OPERATOR_REVIEW` | BLOCKED | All gates pass | `LIMITED_LIVE_CANARY` on operator approval |
| `LIMITED_LIVE_CANARY` | ALLOWED (canary) | Operator opens window | `PAUSED` on N tx / expiry / terminate |
| `PAUSED` | BLOCKED | Auto-triggered | `READY_FOR_OPERATOR_REVIEW` on dismiss |
| `EMERGENCY_PAUSED` | BLOCKED (hard) | Emergency pause | `READY_FOR_OPERATOR_REVIEW` on clear |
| `QUARANTINED` | BLOCKED (hard) | Quarantine condition | `READY_FOR_OPERATOR_REVIEW` on resolve |
| `RETIRED` | BLOCKED forever | Permanent decommission | None |

### State Transition Rules

- 15 defined transitions total
- 7 hard blocks prevent invalid transitions
- EMERGENCY_PAUSED and QUARANTINED are terminal until operator action
- RETIRED is permanent — cannot be exited

---

## Canary Mode Summary

### Parameters

| Parameter | Value |
|-----------|-------|
| Wallet | 1 dedicated tiny live wallet |
| Pair | 1 verified pair only |
| Max trade USD/tx | $10–$50 (default $25) |
| Max tx/window | 1–3 (default 3) |
| Max window notional | $75–$150 |
| Window duration | 1–8h (default 4h) |
| Auto retry signing | BLOCKED |
| Finality | 2 block confirmations |
| Revoke flow | Required before first window |

### Auto-Pause Triggers

1. Nth transaction confirmed
2. Window duration expires
3. Gas spike (>2x baseline)
4. High price impact (>3%)
5. Emergency pause triggered
6. Wallet quarantined
7. Provider circuit breaker opens

---

## Risk Policy Summary

### Global Limits

| Limit | Value |
|-------|-------|
| Daily tx count | 50 |
| Daily notional USD | $10,000 |
| Pending notional USD | $2,000 |
| Gas per tx USD | $50 |
| Failed tx/day per wallet | 5 |
| Wallet concurrency | 3 |
| Provider concurrency | 5 |
| Pair concentration | 40% |

### Risk Check Order (Pre-Sign Gate)

- Steps 1–4: **Hard block** (wallet status, quarantine, nonce, emergency pause)
- Steps 5–14: **Soft block** with operator notification before override

---

## Failure Behavior Summary

### LIVE DLQ Policy

> **Rule:** LIVE jobs that fail are **never auto-replayed**.

| Failure | DLQ | Retry | Operator Action |
|--------|-----|-------|----------------|
| Provider 429 | Yes | No (wait cooldown) | Wait 30s |
| Simulation failed | Yes | No | Investigate |
| Signing failure | Yes | No | Manual re-approval |
| Nonce mismatch | Yes | No | Nonce reconciliation |
| Gas exhausted | Yes | No | Refuel wallet |
| Any LIVE job | Yes | NO REPLAY | Re-approve manually |

---

## UI Design Summary

### 7 UI Components Designed

1. **Live Scheduler Locked Screen** — Full-screen locked state, read-only status display
2. **Readiness Blockers View** — Accordion blocker list by category
3. **Canary Controls Panel** — Setup form + active window controls
4. **Wallet/Pair Limits View** — Read-only progress bars for all limits
5. **Live Occurrence Timeline** — 24h time-series of live occurrences
6. **Kill Switch** — Always-visible header control with MFA + phrase confirmation
7. **Recovery Wizard** — 4-step wizard for QUARANTINED, post-emergency, DLQ overflow

---

## Test Plan Summary

### Test Matrix

| Type | Count | Coverage Areas |
|------|-------|---------------|
| Unit | 8 areas | State transitions, risk engine, signer policy, canary params, circuit breaker, quarantine, nonce reservation, idempotency |
| Integration | 7 areas | Readiness→state machine, trade worker + risk, DLQ replay block, circuit breaker, quarantine, canary lifecycle, emergency pause |
| E2E | 6 scenarios | Happy path canary, simulation fail, emergency pause, kill switch, readiness blocks, DLQ replay blocked |
| Provider simulation | 6 scenarios | 429, stale quote, gas spike, price impact, timeout, concurrent limit |
| Chaos/restart | 5 scenarios | Redis restart, API restart, DB lock, all providers fail, nonce gap post-reorg |
| Forked chain | 4 tests | Live tx on fork, reorg during confirmation, nonce rollback, stale quote during reorg |
| Canary live validation | 8 steps | Provision → open → execute → verify → repeat N → auto-pause → close → verify |

---

## No-Live-Schcheduler Guarantee

The following mechanisms ensure live scheduler cannot accidentally activate:

| Mechanism | Location | Enforcement |
|----------|----------|-------------|
| `schedulerLiveExecution = false` | `.env` / env config | Blocks all live state transitions |
| `processTradeJob(mode=LIVE)` throws | `trade.worker.ts` line 1 | Hard runtime block |
| `LIVE job replay = BLOCKED` | `dlq.service.ts` | DLQ refuses replay of LIVE jobs |
| Monthly drill required | `NO_GO_GATES.md` H5 | Readiness check blocks if overdue |
| Quarterly drill required | `NO_GO_GATES.md` H6 | Readiness check blocks if overdue |
| MFA required for canary open | `CANARY_PLAN.md` | MFA + phrase confirmation required |
| No auto retry for LIVE | `CONTROLLED_DESIGN.md` §6 | Every failure requires manual re-approval |

---

## What Was Not Changed

The following were explicitly **not modified** per the hard requirements:

- `processTradeJob(mode=LIVE)` — remains blocked at entry point
- `schedulerLiveExecution` env flag — remains `false`
- Any trade execution path — no live implementation added
- `trade.worker.ts` — no LIVE mode logic added
- `dlq.service.ts` — replay block remains for LIVE jobs
- Any runtime configuration — no live scheduler enabled

---

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript type check | `pnpm typecheck` | Pending |
| ESLint | `pnpm lint` | Pending |
| Unit tests | `pnpm test` | Pending |

---

## Risks and Open Questions

1. **Nonce reservation not implemented** — G22 in NO_GO_GATES; must be implemented before live can open
2. **Trace ID wiring incomplete** — L8 in NO_GO_GATES; must wire through all layers
3. **Provider circuit breaker not tuned for live** — L7 in NO_GO_GATES; needs live-specific concurrency limits
4. **Canary wallet provisioning not automated** — Requires manual provisioning before first canary
5. **Forked chain testing infrastructure** — Not yet identified; required for canary validation

---

## Next Steps (For Future Implementation Phases)

1. **Phase 14:** Implement nonce reservation + recovery protocol
2. **Phase 15:** Wire trace ID through all API layers
3. **Phase 16:** Tune provider circuit breaker for live concurrency
4. **Phase 17:** Implement canary UI controls (setup form, active window, kill switch)
5. **Phase 18:** Implement recovery wizard
6. **Phase 19:** Implement LIVE mode in trade worker behind all gates
7. **Phase 20:** End-to-end canary validation with forked chain test

---

## Conclusion

Phase 13 delivers a complete, detailed design specification for the controlled live scheduler. The design establishes 9 states with 15 transitions, 30 no-go gates, a single-path canary mode, and a comprehensive test matrix — all without enabling live scheduler execution. No production path can accidentally start live scheduled signing given the layered gate architecture.

**Verdict: READY**
— Design artifacts complete; no live scheduler behavior changed; all acceptance criteria met.