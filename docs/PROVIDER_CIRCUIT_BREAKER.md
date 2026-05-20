# Provider Circuit Breaker

## Overview

The Provider Circuit Breaker protects the quote provider from being overwhelmed by concurrent requests and rate-limited responses. This is critical when scaling to 10+ wallet dry-runs.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProviderCircuitBreaker                        │
├─────────────────────────────────────────────────────────────────┤
│  State Machine: CLOSED → HALF_OPEN → OPEN → CLOSED              │
│                                                                  │
│  ┌──────────┐     failure      ┌───────────┐     success       │
│  │  CLOSED  │ ────────────────▶│  HALF_OPEN │ ─────────────────┤
│  └──────────┘                 └───────────┘                  │
│       ▲                              │                          │
│       │     3x 429 failures          │ failure                  │
│       └──────────────────────────────┘                         │
│                                                                  │
│  ┌──────────┐                                                  │
│  │   OPEN   │ ─── wait 60s ───▶ HALF_OPEN                       │
│  └──────────┘                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

```typescript
interface CircuitBreakerConfig {
  maxConcurrent: 5,           // Max parallel quote requests
  maxPerSecond: 10,             // Max requests per second
  maxPerMinute: 50,             // Max requests per minute
  rateLimitThreshold: 3,        // 429s before opening circuit
  halfOpenAfterMs: 60_000,      // Wait 60s before probe
  resetAfterMs: 30_000,        // Not used directly
  cooldownAfterRateLimitMs: 30_000, // Cooldown after 429
}
```

## States

### CLOSED (Normal)
- All requests pass through
- Failures are counted but circuit stays closed
- Opens after 3 consecutive rate-limit (429) failures

### HALF_OPEN (Testing)
- Limited requests allowed (probing)
- Any failure immediately opens circuit
- 2 consecutive successes → CLOSED
- Used to test if provider recovered

### OPEN (Blocking)
- All new requests rejected immediately
- Wait `halfOpenAfterMs` before transitioning to HALF_OPEN
- Prevents hammering a struggling provider

## Metrics

The circuit breaker exposes metrics via `scheduler/status`:

```json
{
  "provider": {
    "circuitState": "CLOSED",
    "rateLimit429Count": 2,
    "totalRequests": 1540,
    "successfulRequests": 1498,
    "failedRequests": 42,
    "rejectedRequests": 15,
    "currentConcurrent": 2,
    "lastErrorAt": "2026-05-20T10:30:00Z",
    "lastErrorCode": "PROVIDER_RATE_LIMITED",
    "lastRateLimitedAt": "2026-05-20T10:25:00Z"
  }
}
```

## Rate Limiting

### Per-Second Limit
- Rolling window of 1 second
- Default: 10 requests/second
- Exceeding → request rejected

### Per-Minute Limit
- Rolling window of 60 seconds
- Default: 50 requests/minute
- Exceeding → request rejected

### Concurrency Limit
- Maximum parallel requests: 5
- Exceeding → request rejected

## Circuit Breaker Integration with Quote Provider

```typescript
const result = await withCircuitBreaker(
  async () => {
    const response = await fetch(quoteUrl);
    if (response.status === 429) {
      throw new ProviderRateLimitedError({...});
    }
    return response.json();
  },
  (errorCode) => {
    // Callback for rate limit events
    console.warn(`[provider] Rate limited: ${errorCode}`);
  }
);
```

## UI Display

The operator UI shows circuit breaker state:

```
Provider Health
─────────────────
Circuit: CLOSED ✅
429 Errors: 2
Rejected: 15

Total Requests: 1540
Successful: 1498
Failed: 42
Concurrent: 2/5
```

States:
- **CLOSED**: Green, normal operation
- **HALF_OPEN**: Yellow, testing recovery
- **OPEN**: Red, blocking requests

## Troubleshooting

### Circuit stuck OPEN
1. Check provider health (is 0x.org down?)
2. Wait for `halfOpenAfterMs` (60s default)
3. Force close via API if provider is healthy
4. Restart API container (resets circuit)

### High rejected count
1. Check if `maxConcurrent` is too low for load
2. Consider increasing limits
3. Check for runaway loops in scheduling

### 429s still happening
1. Provider rate limit may have changed
2. Check 0x API documentation
3. May need API key upgrade
4. Consider adding provider fallback