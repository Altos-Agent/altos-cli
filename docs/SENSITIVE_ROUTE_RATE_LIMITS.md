# Sensitive Route Rate Limits

## Overview

Sensitive API endpoints are protected by rate limiting to prevent brute-force attacks, credential stuffing, and abuse.

## Rate Limit Configuration

### Authentication Endpoints

| Endpoint | Limit | Window | Lockout |
|----------|-------|--------|---------|
| `POST /api/auth/login` | 5 attempts | 15 minutes | 15 minute lockout |
| `POST /api/auth/mfa/verify` | 5 attempts | 15 minutes | 15 minute lockout |
| `POST /api/auth/reauth` | 5 attempts | 15 minutes | 15 minute lockout |
| `POST /api/auth/mfa/disable` | 3 attempts | 15 minutes | Permanent until resolved |

### Sensitive Operations

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /api/wallets/import` | 10/hour | Rolling |
| `DELETE /api/wallets/:id` | 5/hour | Rolling |
| `POST /api/scheduler/purge` | 3/hour | Rolling |
| `POST /api/emergency-pause/enable` | 5/hour | Rolling |

## Implementation

Rate limits are implemented using Redis with a sliding window algorithm:

```typescript
const rateLimitKey = `ratelimit:${endpoint}:${operatorId}:${window}`;
const count = await redis.incr(rateLimitKey);
if (count === 1) {
  await redis.expire(rateLimitKey, windowSeconds);
}
if (count > limit) {
  throw new RateLimitError(`Rate limit exceeded for ${endpoint}`);
}
```

## Response Headers

Rate-limited responses include:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining in window
- `Retry-After`: Seconds until limit resets (on 429 responses)

## Lockout Behavior

On lockout, the operator's `locked_until` timestamp is set. All subsequent requests from that operator are rejected with HTTP 423 (Locked) until the lockout expires.