# Live Scheduler Canary Plan

**Date:** 2026-05-21
**Status:** DESIGN ONLY

---

## 1. Canary Mode Overview

Canary mode is the **only allowed path** from `READY_FOR_OPERATOR_REVIEW` to `LIMITED_LIVE_CANARY`. It enables a single live transaction window with strict, verifiable constraints.

### Purpose
- Validate live execution with minimal financial exposure
- Verify system behavior under real conditions
- Build operator confidence through incremental validation
- Identify failure modes before scaling to multi-wallet

### Principles
- **Single wallet** — all canary tx use one dedicated wallet
- **Single pair** — one verified trading pair per window
- **Tiny notional** — max $10–50 per tx, $50–150 total window
- **Manual approval per tx** — no auto retry on signing failure
- **Short window** — 4 hours max, auto-pause after N tx
- **Full observability** — every step traced with correlation ID

---

## 2. Canary Parameters

| Parameter | Value | Validation |
|-----------|-------|------------|
| Wallet | 1 dedicated `purpose=TINY_LIVE` wallet | Must exist, status=PAUSED, nonce=CLEAN |
| Trading pair | 1 verified pair only (default: USDC→WETH) | Must be verified in registry |
| Max trade USD per tx | $25 (configurable, range: $10–$50) | Hard cap per tx |
| Max tx per window | 3 (configurable, range: 1–3) | Auto-pause after Nth tx |
| Approval window | 4 hours (configurable, range: 1–8h) | Countdown timer visible |
| Auto pause after N tx | N=3 (equals max tx) | Triggers `PAUSED` state |
| Manual re-approval | Required for each transaction | No auto retry on failure |
| Auto retry signing | BLOCKED | Every tx requires fresh operator intent |
| Finality | 2 block confirmations minimum | Prevents reorg reversibility |
| Revoke flow | Must be verified available | Required before first window |
| Price impact threshold | < 3% | Reject if exceeded |

---

## 3. Canary Lifecycle

### State Transition

```
READY_FOR_OPERATOR_REVIEW
    │
    │ operator opens canary window
    │ (specifies: pair, max tx, window duration)
    │ + MFA confirmation + phrase confirmation
    ▼
LIMITED_LIVE_CANARY (window open)
    │
    ├── [ TX #1 ] ───▶ preflight simulation ──▶ risk check
    │                                          │
    │                                    If risk fails:
    │                                    Reject → operator notified
    │                                    (no auto retry)
    │
    │                                    If risk passes:
    │                                    → signer policy engine
    │                                    → external signer/KMS
    │                                    → submission (2 block finality)
    │                                    → confirmation
    │
    ├── [ TX #2 ] ───▶ preflight simulation ──▶ risk check
    │                                    → signing → submission → confirm
    │
    ├── [ TX #3 ] ───▶ preflight simulation ──▶ risk check
    │                                    → signing → submission → confirm
    │                                    │
    │                              Auto-pause triggered (N tx reached)
    ▼
PAUSED (window expired OR N tx reached OR operator terminates)
    │
    │ operator reviews results
    │ can close window or request new approval
    ▼
READY_FOR_OPERATOR_REVIEW
```

### Transaction Flow Detail

```
1. OCCURRENCE_TRIGGERED
   └── Scheduler picks up occurrence
       └── Checks: wallet nonce CLEAN, not quarantined

2. QUOTE_REQUESTED
   └── Quote engine returns: sell token, buy token, amount, expected return USD, price impact
       └── Quote age must be < 30 seconds

3. SIMULATION_REQUESTED
   └── Preflight simulation runs (dry-run style, no signing)
       └── Must succeed or tx is rejected, no auto retry

4. RISK_CHECK
   └── Aggregate risk engine evaluates USD-normalized limits
       └── Global daily tx < 50, global daily notional < $10,000,
           wallet daily tx < 10, wallet daily notional < $500,
           pair concentration < 40%, price impact < 3%

5. SIGNER_POLICY_CHECK
   └── Signer policy engine evaluates all 9 rules
       └── wallet=ACTIVE, emergency pause=OFF, router=VERIFIED,
           function selector allowed, trade USD < wallet.maxTradeUsd,
           gas USD < wallet.maxGasUsd

6. SIGNING_REQUESTED
   └── Request sent to external signer/KMS
       └── If signing fails: DLQ, operator notification, NO auto retry

7. SUBMISSION
   └── Transaction submitted to chain
       └── 2 block finality required before counted as confirmed

8. CONFIRMED
   └── Transaction confirmed on-chain
       └── Update occurrence status, update risk counters,
           check if N tx reached → trigger auto-pause

9. FAILED
   └── Transaction failed (revert, gas exhausted, etc.)
       └── DLQ recorded, operator notified, window continues
           (operator can decide to terminate or continue)
```

---

## 4. Opening a Canary Window

### Prerequisites

Before the "Open Canary Window" button is enabled:

| Check | Required |
|-------|----------|
| State = `READY_FOR_OPERATOR_REVIEW` | Yes |
| Canary wallet exists | Yes |
| Canary wallet status = PAUSED | Yes |
| Canary pair verified | Yes |
| Revoke flow available | Yes |
| Operator re-auth within 5 minutes | Yes |

### Operator Confirmation Required

| Action | MFA | Phrase Confirm |
|--------|-----|----------------|
| Open canary window | Yes | Yes |
| Terminate window early | Yes | Yes |
| Dismiss blocker (session) | Yes | No |
| Emergency pause | Yes | No |
| Resume from pause | Yes | No |

---

## 5. Canary Window Constraints (Hard Limits)

These constraints **cannot be modified** within an active window. A new window must be opened to change any parameter.

| Constraint | Rule | What Happens if Violated |
|-------------|------|--------------------------|
| One wallet | All tx must use canary wallet | Hard block, reject tx |
| One pair | All tx must use same pair | Hard block, reject tx |
| Max trade USD per tx | Per-tx notional must not exceed configured max | Soft block, reject tx |
| Max N tx per window | When N reached, window auto-pauses | Auto-pause triggered |
| No auto retry | Signing failure does not retry | DLQ, no retry |
| 2 block finality | Tx not counted until 2 confirmations | Finality tracker enforces |
| Window duration | Window closes after duration expires | Auto-pause triggered |
| Cannot extend window | Window duration is fixed | Must open new window |

---

## 6. Auto-Pause Triggers

The canary window automatically transitions to `PAUSED` when ANY of the following occur:

| Trigger | Condition |
|---------|-----------|
| Nth transaction confirmed | When `confirmedTxCount >= maxTxPerWindow` |
| Window duration expires | When `now >= windowOpenedAt + windowDuration` |
| Gas spike detected | When `gasEstimate > baseline * 2` on any tx |
| High price impact | When `priceImpact > 3%` on any quote |
| Emergency pause triggered | When `globalEmergencyPaused = true` |
| Quarantine condition | When `wallet.nonceStatus = QUARANTINED` |
| Provider circuit open | When circuit breaker opens on sole provider |

---

## 7. Canary Window Limits (USD)

### Parameter Constraints

| Parameter | Min | Default | Max | Notes |
|-----------|-----|---------|-----|-------|
| Max trade USD per tx | $10 | $25 | $50 | Hard cap |
| Max tx per window | 1 | 3 | 3 | Cannot exceed 3 |
| Max total window notional | — | $75 | $150 | N tx × max trade USD |
| Window duration | 1h | 4h | 8h | Hours |

### Risk Engine Limits During Canary

These limits apply **in addition to** canary parameters. Both must pass.

| Limit | Value | Applies To |
|-------|-------|------------|
| Max global daily tx | 50 | All wallets |
| Max global daily notional | $10,000 | All wallets |
| Max pending notional | $2,000 | All wallets |
| Max wallet daily tx | 10 | Canary wallet |
| Max wallet daily notional | $500 | Canary wallet |
| Max pair concentration | 40% | Canary pair |

---

## 8. Test Criteria for Canary Mode

Before considering canary mode successful, the following must be verified:

### Functional Criteria

- [ ] Canary window opens with valid parameters
- [ ] Tx #1 executes and confirms with correct state change
- [ ] Tx #2 executes and confirms with correct state change
- [ ] Tx #3 executes and confirms; auto-pause triggers immediately after
- [ ] Window auto-pauses when N tx reached
- [ ] Window auto-pauses when duration expires
- [ ] Operator can terminate window early
- [ ] All 9 signer policy rules enforced on each tx
- [ ] Aggregate risk limits enforced on each tx
- [ ] Price impact > 3% blocks tx with operator notification
- [ ] Stale quote (>30s) blocks tx
- [ ] Gas spike (>2x) blocks tx with re-quote
- [ ] Signing failure → DLQ, no auto retry, operator notified
- [ ] DLQ records LIVE job correctly

### Non-Functional Criteria

- [ ] All tx traced with correlation ID end-to-end
- [ ] All tx appear in occurrence timeline
- [ ] Alert fires on any failure
- [ ] Kill switch visible and functional throughout
- [ ] Recovery wizard launches correctly after QUARANTINED

### Cleanup Criteria

- [ ] Canary wallet can be unpaused for inspection
- [ ] Canary wallet can be deprovisined after test
- [ ] All occurrences show correct final state
- [ ] Risk counters reflect canary activity
- [ ] DLQ empty after operator resolution

---

## 9. Future Expansion (Out of Scope for Initial Canary)

These are noted for completeness but are explicitly **not in scope** for the initial canary implementation:

| Feature | Notes |
|---------|-------|
| Multiple canary wallets | Not in scope |
| Multiple pairs | Not in scope |
| Automated risk adjustment | Not in scope |
| Multi-signer canary | Not in scope |
| Automated window scheduling | Not in scope |
| Production live (non-canary) | Not in scope |

---

## 10. Revoke Flow Requirement

Before the first canary window can open, the revoke flow must be verified:

### Verification Steps

1. Provision approval for canary wallet
2. Verify approval exists on-chain
3. Execute revoke flow
4. Verify approval removed on-chain
5. Re-establish approval for canary window

**If revoke flow is unavailable at any time:**
- Canary windows cannot be opened
- State returns to `BLOCKED_BY_READINESS` with reason: `revokeFlowUnavailable`

---

## 11. References

- `LIVE_SCHEDULER_CONTROLLED_DESIGN.md` — Full architecture
- `LIVE_SCHEDULER_STATE_MACHINE.md` — State transitions
- `LIVE_SCHEDULER_NO_GO_GATES.md` — All gates and preconditions
- `SIGNER_POLICY_ENGINE.md` — Signer policy rules
- `USD_NORMALIZED_RISK_ACCOUNTING.md` — Risk accounting rules
- `NONCE_RESERVATION_AND_RECOVERY.md` — Nonce reservation