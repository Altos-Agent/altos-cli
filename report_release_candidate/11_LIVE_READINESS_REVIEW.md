# 11 — Live Readiness Review

**Date:** 2026-05-21

---

## Readiness Center — 23 Checks

### Category 1: Core Gating (Checks 1–4)
| Check | Name | Current Status | Live Relevance |
|-------|------|--------------|---------------|
| C1 | `demoModeOff` | DEMO_MODE=false | Required for all live |
| C2 | `dryRunEnabled` | dry_run=true | Required for all live |
| C3 | `vaultUnlocked` | Vault lock status | Required for signing |
| C4 | `emergencyPauseOff` | `globalEmergencyPaused=false` | Hard block for any live |

### Category 2: Registry & Risk (Checks 5–9)
| Check | Name | Current Status | Live Relevance |
|-------|------|--------------|---------------|
| C5 | `aggregateRiskEnabled` | limits.enabled=true | Required for live |
| C6 | `aggregateRiskUsdNormalized` | maxDailyTradeUsd > 0 | **WEAK** — doesn't verify data |
| C7 | `tokenRecordsVerified` | tokens.VERIFIED | Required for live pairs |
| C8 | `routerRecordsVerified` | routers.VERIFIED | Required for live routing |
| C9 | `spenderRecordsVerified` | spenders.VERIFIED | Required for live approvals |

### Category 3: Artifacts & Drills (Checks 10–16)
| Check | Name | Current Status | Live Relevance |
|-------|------|--------------|---------------|
| C10 | `0xQuoteArtifact` | Artifact present | Required |
| C11 | `backupDrillArtifact` | Artifact present | Required |
| C12 | `emergencyDrillArtifact` | Artifact present | Required |
| C13 | `dryRunLoadTestArtifact` | Artifact present | Required |
| C14 | `telegramTestArtifact` | Artifact present | Required |
| C15 | `e2eCiGreen` | `!CI_STATUS_URL` | **PASSIVE** — not real CI check |
| C16 | `metricsTokenConfigured` | METRICS_TOKEN env var | Required |

### Category 4: Wallet Health (Checks 17–19)
| Check | Name | Current Status | Live Relevance |
|-------|------|--------------|---------------|
| C17 | `tinyWalletExists` | wallet with "TINY_LIVE" | Required for canary |
| C18 | `tinyWalletPaused` | tiny wallet status=PAUSED | Required for canary |
| C19 | `noStuckWallets` | Zero FAILED/DROPPED txs | Required |

### Category 5: Scheduler & Custody (Checks 20–23)
| Check | Name | Current Status | **CRITICAL ISSUE** |
|-------|------|--------------|-------------------|
| C20 | `schedulerLiveDisabled` | **HARDCODED FALSE** | `isLiveSchedulerEnabled: false` always passed — check is a no-op |
| C21 | `custodyProviderHealthy` | **HARDCODED TRUE** | Always `true` — never actually checked |
| C22 | `exactApprovalFlowAvailable` | **HARDCODED TRUE** | Always `true` — never actually checked |
| C23 | `revokeFlowAvailable` | **HARDCODED TRUE** | Always `true` — never actually checked |

---

## Readiness State Machine

| State | Transitions From | Transitions To |
|-------|----------------|---------------|
| `DEMO_READY` | — | Any (demo mode on) |
| `DRY_RUN_READY` | DEMO_READY | TINY_MANUAL_LIVE_BLOCKED |
| `TINY_MANUAL_LIVE_BLOCKED` | DRY_RUN_READY | TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW |
| `TINY_MANUAL_LIVE_READY_FOR_OPERATOR_REVIEW` | TINY_MANUAL_LIVE_BLOCKED | LIMITED_LIVE_CANARY (operator opens) |
| `LIVE_AUTOMATION_HARD_NO_GO` | Always | Never exits |
| `LIVE_AUTOMATION_READY` | Always | Never exits |

**`LIVE_AUTOMATION_HARD_NO_GO` and `LIVE_AUTOMATION_READY` are always `false`** — live automation state is hard-coded as unreachable.

---

## Readiness State Persistence

### Status: ❌ IN-MEMORY ONLY — RESETS ON RESTART

```typescript
// readiness-state.ts line 3
let _currentState: ReadinessState = "DEMO_READY";
```

**Does NOT survive API restarts.** The system resets to `DEMO_READY` on every restart. Drill artifacts are on disk (persistent), emergency pause state is in DB (persistent), but the readiness state itself is lost.

---

## Drill Requirements

### Emergency Pause Drill
- **Cadence:** Monthly (recommended)
- **Procedure:** `docs/EMERGENCY_PAUSE_DRILL.md`
- **Artifact:** `.readiness/artifacts/emergency_pause_<timestamp>.json`
- **Check:** C12

### Backup/Restore Drill
- **Cadence:** Quarterly (recommended)
- **Procedure:** `docs/BACKUP_RESTORE_DRILL.md`
- **Artifact:** `.readiness/artifacts/backup_restore_<timestamp>.json`
- **Check:** C11

### Dry-Run Load Test
- **Cadence:** After any config change
- **Procedure:** `pnpm --filter api run dry-run-load-test`
- **Artifact:** `.readiness/artifacts/dry_run_load_test_<timestamp>.json`
- **Check:** C13

### Telegram Test
- **Cadence:** After Telegram config change
- **Procedure:** Send test message via `/api/notifications/test`
- **Artifact:** `.readiness/artifacts/telegram_test_<timestamp>.json`
- **Check:** C14

---

## Canary Mode (Tiny Manual Live)

### Prerequisites for Canary Window

| Prerequisite | Status |
|-------------|--------|
| All 23 checks passing | ⚠️ Checks 20-23 are no-ops |
| Canary wallet exists | ✅ |
| Canary wallet PAUSED | ✅ |
| Canary pair verified | ✅ |
| Revoke flow available | ⚠️ Always `true` — not verified |
| Operator MFA configured | ⚠️ Not enforced per-check |
| Operator re-auth valid | ⚠️ Not checked by readiness |
| Monthly drill current | ✅ |
| Quarterly backup drill current | ✅ |

---

## Missing Checks for Live Scheduler Readiness

The following are **required before live scheduler** but not currently in the readiness center:

| Check | Required For | Status |
|-------|-------------|--------|
| Nonce reservation implemented | Live execution | ❌ Not a readiness check |
| Provider circuit breaker tuned for live | Live concurrency | ❌ Not a readiness check |
| Signer policy engine wired | Live signing safety | ❌ Dead code |
| Trace event recording wired | Live observability | ❌ Not a readiness check |
| Fetch timeout on ZeroX provider | Live resilience | ❌ Not a readiness check |
| Multi-provider fallback | Live resilience | ❌ Not a readiness check |
| Pre-sign aggregate risk in scheduler | Live risk safety | ❌ Not a readiness check |

---

## Hard Blockers in This Area

| # | Blocker | Fix |
|---|---------|-----|
| H1 | Checks 20-23 hardcoded to pass — no actual health checks | Implement real health checks for custody, approval, revoke flows |
| H2 | Readiness state not persisted | Store in DB, not memory |
| H3 | `isLiveSchedulerEnabled` hardcoded to false in buildContext | Read from actual runtime config |
| H4 | `ciGreen` passive check doesn't query real CI | Query actual CI endpoint |
| H5 | Canary preconditions not enforced (revoke, MFA, re-auth) | Add as readiness checks |