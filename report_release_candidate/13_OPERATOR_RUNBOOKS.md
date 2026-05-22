# 13 — Operator Runbooks

**Date:** 2026-05-21

---

## Daily Operator Checklist

### Start of Shift

1. **Check readiness center** — `GET /api/readiness`
   - Verify state is `DRY_RUN_READY` or `MULTI_WALLET_DRY_RUN_READY`
   - If `BLOCKED_BY_READINESS`, identify and resolve blockers
   - If `TINY_MANUAL_LIVE_BLOCKED`, identify which checks 17-23 are failing

2. **Check emergency pause status** — `GET /api/emergency-pause/status`
   - Must show `globalEmergencyPaused: false`
   - If paused, investigate before clearing

3. **Check stuck/dropped transactions** — `GET /metrics` (search `transaction_stuck_total`, `transaction_dropped_total`)
   - Any stuck tx > 10 minutes requires investigation
   - Check `wallet_quarantine_count` metric

4. **Check DLQ depth** — `GET /api/scheduler/dlq/stats`
   - If DLQ growing, investigate root cause before new trades
   - Any LIVE job in DLQ is a critical alert (should not exist)

5. **Check circuit breaker state** — inspect `provider_circuit_state` metric
   - Should be CLOSED (state=1) for normal operation

6. **Verify vault is locked** after any unlock operations
   - Confirm `vault_locked_state = 1`

---

## Emergency Pause Procedure

### When to Trigger
- Unexpected behavior in live trading context
- Suspected nonce issues or stuck transactions
- Custody provider unresponsive
- Security incident suspected

### Steps

```
1. POST /api/emergency-pause/enable
   (No auth required — this is intentional for speed during incidents)

2. Verify: GET /api/emergency-pause/status
   → Should show globalEmergencyPaused: true

3. Alert via Telegram:
   - Automated alert fires on enable
   - Monitor for operator acknowledgment

4. Investigate root cause
   - Check logs: docker compose logs api
   - Check DLQ: GET /api/scheduler/dlq
   - Check stuck transactions in DB

5. Resolve issue

6. Disable emergency pause:
   POST /api/emergency-pause/disable
   → requires admin role + reauth + phrase confirmation
   → phrase: "DISABLE EMERGENCY PAUSE"

7. Verify: GET /api/emergency-pause/status
   → Should show globalEmergencyPaused: false

8. Resume scheduler:
   POST /api/scheduler/start (requires admin)
```

### Per-Wallet Emergency Pause

```
POST /api/wallets/:id/emergency-pause
(No auth required — for use during incident response)
```

---

## Quarantine Recovery Procedure

### When Wallet Goes Quarantine

1. **Identify quarantined wallet** — `GET /metrics` shows `wallet_quarantine_count > 0`
2. **Check reason** — Look for:
   - Nonce mismatch (on-chain nonce ≠ local nonce)
   - Stuck tx > 30 minutes
   - Dropped tx followed by nonce gap
3. **Do NOT schedule new trades** for this wallet while quarantined
4. **Recovery steps:**

```
# Step 1: Stop the schedule
POST /api/wallets/:id/pause

# Step 2: Investigate nonce state
# Check on-chain nonce vs local nonce
# Look at pendingWalletLocks table for orphaned locks

# Step 3: If orphaned locks exist
# Clear via nonce reconciliation process

# Step 4: Reset wallet nonce status
# Manual DB update or operator tool (if exists)

# Step 5: Unquarantine
# Change wallet.nonceStatus from QUARANTINED to CLEAN

# Step 6: Resume
POST /api/wallets/:id/resume
```

---

## Stuck/Dropped Transaction Recovery

### Stuck Transaction (>10 min without confirmation)

```
1. Check transaction status in DB
   SELECT * FROM transactions WHERE status = 'STUCK' AND wallet_id = ?

2. Check nonce state
   SELECT nonce, nonce_status FROM wallets WHERE id = ?

3. If nonce is uncertain:
   - Wallet goes to UNCERTAIN state
   - Requires operator review before more trades

4. If nonce is quarantined:
   - No new trades until resolved
   - Follow quarantine recovery procedure

5. If tx confirmed after stuck:
   - Mark confirmed in DB
   - Update occurrence status
   - Clear any stuck flags
```

### Dropped Transaction

```
1. Check if transaction is confirmed on-chain (Basescan)
2. If confirmed on-chain but local state is wrong:
   - Update local transaction status to match chain
3. If NOT confirmed and dropped:
   - Release nonce reservation if applicable
   - Re-queue trade if within daily limits
   - Alert if nonce gap detected
```

---

## DLQ Investigation

### Check DLQ

```
GET /api/scheduler/dlq?limit=20&offset=0&unresolved=true
```

### Analyze Error Codes

| Error Code | Cause | Resolution |
|------------|-------|------------|
| `SIMULATION_FAILED` | Dry-run simulation rejected | Check pair config, wallet balance |
| `AGGREGATE_RISK_REJECTED` | Risk limit reached | Wait for daily reset or increase limits |
| `PROVIDER_RATE_LIMITED` | 429 from quote provider | Wait 30s, retry |
| `PROVIDER_TIMEOUT` | Quote provider timeout | Check provider health |
| `VAULT_LOCKED` | Vault locked at execution time | Unlock vault, retry |
| `EMERGENCY_PAUSED` | Emergency pause active | Clear emergency pause |

### Replay Dry-Run Job

```
POST /api/scheduler/dlq/:id/replay
(Only works for DRY_RUN jobs — LIVE jobs cannot be replayed)
```

---

## Dry-Run Load Test Procedure

### When to Run

- After any quote provider configuration change
- After any risk limit configuration change
- Before any scheduled maintenance window
- Monthly as part of drill validation

### Run the Test

```bash
cd apps/api
pnpm run dry-run-load-test --concurrency 4 --duration 60 --chaos
```

### Upload Artifact

After test completes, artifact is auto-generated. Verify it appears:
```
GET /api/readiness/run-checks
→ Should show dryRunLoadTestArtifact: present
```

---

## Monthly Drill: Emergency Pause

### Procedure

```
1. Enable emergency pause
   POST /api/emergency-pause/enable

2. Verify all schedulers stopped
   docker compose logs api | grep "emergency pause"
   → Should show scheduler halted

3. Verify dry-run is blocked
   → Attempt dry-run should be rejected

4. Disable emergency pause
   POST /api/emergency-pause/disable
   (admin + reauth + phrase)

5. Verify scheduler resumed
   docker compose logs api | grep "scheduler"
   → Should show scheduler running

6. Upload artifact
   → Artifact auto-generated in .readiness/artifacts/
```

---

## Quarterly Drill: Backup/Restore

### Procedure

```
1. Create full backup
   docker exec base_db pg_dump -U base_user base_db > backup_pre_drill.sql

2. Export Redis state
   docker exec base_redis redis-cli SAVE

3. Verify backup files exist

4. Simulate catastrophic failure
   docker compose down
   docker volume rm base_pgdata base_redis
   docker compose up -d

5. Restore from backup
   docker exec -i base_db psql -U base_user base_db < backup_pre_drill.sql
   docker exec base_redis redis-cli RESTORE

6. Verify scheduler state matches

7. Upload artifact
   → Artifact auto-generated in .readiness/artifacts/
```

---

## Safe Operating Boundaries

| Operation | Limit | Reason |
|-----------|-------|--------|
| Execute-once (live) | 10/min per admin | Rate limit protection |
| Scheduler start/stop | Admin only | Production safety |
| Vault unlock | Admin only, auto-lock 15min | Key exposure minimization |
| Emergency pause enable | No auth (intentional) | Speed during incidents |
| Emergency pause disable | Admin + reauth + phrase | Prevent abuse |
| Wallet pause/resume | Operator | Wallet safety |
| DLQ replay | DRY_RUN only | Live jobs need manual re-approval |

---

## Alert Response Times

| Alert | Response Time | Action |
|-------|-------------|--------|
| Emergency pause enabled | Immediately | Investigate cause |
| DLQ spike (>10 jobs/min) | Within 15 min | Investigate root cause |
| Provider 429 rate limited | Within 30 min | Monitor, check limits |
| Wallet quarantined | Within 1 hour | Investigate and resolve |
| Circuit breaker OPEN | Within 1 hour | Check provider health |
| Stuck tx > 10 min | Within 15 min | Check nonce state |
| ALL provider failures | Immediately | Failover or alert |