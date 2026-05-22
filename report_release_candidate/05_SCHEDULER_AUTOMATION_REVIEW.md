# 05 — Scheduler Automation Review

**Date:** 2026-05-21

---

## Scheduler Service

### Safety Mechanisms
- **DB-based distributed lock** with TTL + heartbeat
- **Stale occurrence reconciliation** on startup
- **Duplicate job prevention** (checks existing PENDING/STARTED jobs)
- **Wallet scheduling policy** via `canScheduleWallet`
- **Emergency pause** enforced at start

### Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| Lock race condition | HIGH | `acquireLock()` does SELECT then UPDATE/INSERT — not atomic. Two schedulers can acquire simultaneously. |
| Temporal job check | MEDIUM | `existingPendingJob` checks historical jobs that never completed — stale data can incorrectly block scheduling |
| No worker aliveness check | MEDIUM | Heartbeat updates DB but doesn't verify BullMQ workers are still processing |
| No max loop jitter | MEDIUM | All scheduler instances with same `loopIntervalMs` fire simultaneously after restart |
| No balance check | MEDIUM | Scheduler enqueues jobs even for zero-balance wallets |
| No periodic reconciliation | MEDIUM | `reconcileStaleOccurrences` only runs at startup |

---

## Trade Worker

### Safety Mechanisms
- `assertGlobalEmergencyNotPaused()` at entry
- `assertGlobalEmergencyNotPaused()` before any processing
- **LIVE jobs hard-blocked** at line 1 with explicit error
- **DLQ recording** on any error with wallet/pair/schedule/occurrence correlation
- **No retry for LIVE** — `isSafeToRetryJob` returns false for LIVE mode
- Occurrence status tracking with RUNNING guard

### Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| LIVE retry behavior undocumented | MEDIUM | LIVE jobs with retryable errors silently complete as FAILED — no retry, no auto-replay |
| No quote hash freshness check | MEDIUM | Worker uses `scheduled.quoteHash` from potentially old dry-run without verifying freshness |
| No occurrence state validation | MEDIUM | Worker doesn't confirm occurrence is in valid state before execution |
| No idempotency on transaction creation | MEDIUM | Duplicate worker processing could create two transactions for same occurrence |

---

## Occurrence Service

### Safety Mechanisms
- **Idempotency key** with minute-bucket uniqueness
- **ON CONFLICT DO NOTHING** for duplicate occurrence prevention
- **Status-based guards** on all transition functions
- **Atomic `attemptCount` increment**

### Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| No verified unique index on `occurrenceKey` | HIGH | Documentation claims unique index exists; cannot verify from code. Without it, concurrent writes cause duplicate occurrences. |
| Loose QUEUED → RUNNING transition | MEDIUM | If job is queued and scheduler ticks again before pickup, occurrence can be marked RUNNING while first job still processes |
| No max attempt enforcement | MEDIUM | Occurrence can retry indefinitely (BullMQ limits apply separately) |
| `reconcileStaleOccurrences` only checks `updatedAt` | MEDIUM | Recently-updated but genuinely stuck occurrences won't be reconciled |

---

## DLQ Service

### Safety Mechanisms
- **LIVE replay explicitly blocked** — returns error for LIVE job replay
- **Payload redaction** — only safe fields preserved in DLQ records
- **Replay backoff** — 5-15s random delay
- **Resolved entries cannot be replayed**
- **DLQ stats by error code/queue/job type**

### Gaps

| Gap | Severity | Description |
|-----|----------|-------------|
| `getDlqStats()` loads entire table into memory | HIGH | `await db.select().from(deadLetterJobs)` — no pagination. OOM on large DLQ. |
| Replay doesn't validate occurrence state | MEDIUM | Replaying occurrence in terminal state creates duplicate transactions |
| Replay uses redacted payload | MEDIUM | Replay does not re-validate wallet/pair/schedule existence |
| No DLQ entry TTL | MEDIUM | Entries persist forever, table grows indefinitely |
| notificationQueue/reconciliationQueue not replayable | LOW | Silent ignore — could be intentional |

---

## Scheduler Policy

### Status: ACCEPTABLE

`canScheduleWallet` correctly enforces:
- QUARANTINED wallets blocked
- UNCERTAIN nonce requires operator review
- Emergency pause check
- Daily run count limit
- Daily loss limit

### Gaps
- `dailyRunCount` from schedulerJobs is potentially stale (includes unprocessed jobs)
- No concurrent in-flight job limit per wallet

---

## Hard Blockers in This Area

| # | Blocker | Fix Required |
|---|---------|-------------|
| H1 | Lock acquisition race condition | Use `SELECT FOR UPDATE` or atomic DB operation |
| H2 | `getDlqStats()` OOM risk | Add pagination or date filter |
| H3 | No verified unique index on `occurrenceKey` | Add DB constraint and verify with migration |
| H4 | DLQ replay doesn't revalidate occurrence state | Check occurrence is not in terminal state before replay |
| H5 | Scheduler has no pre-sign risk gate | Add `checkAggregateRisk` before signing |