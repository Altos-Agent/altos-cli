# Queue Retry & DLQ Runbook

## Overview

This runbook covers the retry logic, backoff strategy, and Dead Letter Queue (DLQ) operations for the Base Auto Trader scheduler.

## Retry Policy

### Job Types and Retry Behavior

| Job Type | Mode | Retryable | Backoff |
|----------|------|-----------|---------|
| `ScheduledTradeJob` | DRY_RUN | Yes (transient errors) | Exponential (1s base, max 60s) |
| `ScheduledTradeJob` | LIVE | No | N/A - Never retried |
| `ConfirmationJob` | - | Yes | Fixed 60s |
| `NotificationJob` | - | No | N/A |

### Transient vs Non-Retryable Errors

**Retryable (will retry up to 3 times):**
- `PROVIDER_RATE_LIMITED` - 429 errors from quote provider
- `PROVIDER_UNAVAILABLE` - 5xx errors
- `PROVIDER_TIMEOUT` - Request timeouts
- `SIMULATION_FAILED` - Transaction simulation failures
- `RPC_FINALITY_LAG` - RPC node lagging
- `RPC_NONCE_MISMATCH` - Nonce mismatch errors

**Non-Retryable (fails immediately, goes to DLQ):**
- `STALE_QUOTE` - Quote too old
- `HIGH_PRICE_IMPACT` - Price impact exceeds threshold
- `HIGH_SLIPPAGE` - Slippage exceeds threshold
- `INVALID_QUOTE_TARGET` - Invalid router/target address

### BullMQ Configuration

```typescript
// Exponential backoff with jitter
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60000;

export const calculateRetryBackoff = (attempt: number): number => {
  const exponentialDelay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, MAX_RETRY_DELAY_MS);
};
```

## Dead Letter Queue (DLQ)

### Schema

```sql
CREATE TABLE dead_letter_jobs (
  id UUID PRIMARY KEY,
  queue_name TEXT NOT NULL,
  job_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  wallet_id UUID,
  pair_id UUID,
  schedule_id UUID,
  request_id TEXT,
  trace_id TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  retryable BOOLEAN NOT NULL,
  payload_preview_json JSONB,
  failed_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_note TEXT
);
```

### DLQ Service API

#### `recordDeadLetterJob(db, params)`
Called automatically when a job fails. Records:
- Job metadata (queue, job ID, type)
- Context (wallet, pair, schedule)
- Error details (code, message)
- Retryable flag
- **Redacted** payload preview (only safe fields stored)

#### `listDeadLetterJobs(db, params)`
Query DLQ with filters:
- `queueName` - Filter by queue
- `walletId` - Filter by wallet
- `pairId` - Filter by pair
- `errorCode` - Filter by error type
- `includeResolved` - Include/exclude resolved jobs
- `limit`, `offset` - Pagination

#### `markDeadLetterResolved(db, params)`
Mark a DLQ entry as resolved:
- `id` - DLQ entry ID
- `resolvedBy` - Who/what resolved it
- `resolutionNote` - Optional note

#### `replayDeadLetterJob(db, params)` - DRY_RUN ONLY
Re-queue a failed job for retry:
- **ONLY allowed for DRY_RUN jobs**
- LIVE jobs cannot be replayed (security)
- Adds 5-15s random backoff before re-execution

## Common Operations

### Viewing DLQ

```bash
# Via API
curl http://localhost:8100/api/scheduler/status | jq '.dlq'
```

### Resolving a DLQ Entry

```bash
curl -X POST http://localhost:8100/api/dlq/:id/resolve \
  -H "Content-Type: application/json" \
  -d '{"resolvedBy": "operator", "resolutionNote": "Fixed downstream dependency"}'
```

### Replaying a DRY_RUN Job

```bash
curl -X POST http://localhost:8100/api/dlq/:id/replay \
  -H "Content-Type: application/json"
```

### Monitoring DLQ Size

```bash
# Check DLQ counts per queue
curl http://localhost:8100/api/scheduler/status | jq '.dlq.unresolved'
```

## Alerting

### Should Alert When:
- DLQ unresolved count > 10
- DLQ retryableUnresolved count > 5 for > 30 minutes
- Same error code appears > 20 times in 1 hour

### Should Page When:
- DLQ unresolved count > 50
- Provider circuit breaker is OPEN for > 5 minutes
- Rate limited (429) count > 100 in 1 hour

## Troubleshooting

### Job stuck in waiting state
1. Check BullMQ dashboard for worker health
2. Verify Redis connection
3. Check circuit breaker state
4. Review DLQ for underlying error

### DLQ growing continuously
1. Identify most common error codes
2. If provider errors: check rate limits, circuit breaker state
3. If simulation failures: check RPC node health
4. Consider increasing retry limits temporarily

### Circuit breaker stuck OPEN
1. Check if provider is actually available
2. If provider fixed, manually reset via API or restart
3. Verify cooldown period has elapsed
4. Check for cascading failures from downstream

## Security Notes

- **LIVE jobs are NEVER replayed** - this is enforced at the API level
- **Payloads are redacted** - sensitive fields (API keys, private keys) are never stored in DLQ
- **DLQ access should be restricted** to operations team