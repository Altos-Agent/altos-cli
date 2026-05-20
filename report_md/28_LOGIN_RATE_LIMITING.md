# Login Rate Limiting — Phase 3

Date: 2026-05-13
Scope: Add Redis-backed distributed rate limiting and protect login + sensitive routes.
Verdict/status: PASS.

## Summary

Login now has per-IP (5 attempts / 5 min) and per-username (5 attempts / 10 min)
rate limiting. Vault unlock has per-IP limits (5 attempts / 1 min). The rate
limiter abstraction supports Redis-backed distributed limiting with a safe
in-memory fallback that logs a warning when used outside development/demo mode.

No auth/session/CSRF behavior was weakened. Local demo remains functional.

## Files Changed

| File | Change |
| --- | --- |
| `apps/api/src/http/rate-limit-provider.ts` | New — `RateLimitProvider` interface, `createRateLimitProvider`, in-memory and Redis-backed implementations, `RateLimitExceeded` error class |
| `apps/api/src/http/rate-limit-provider.test.ts` | New — unit tests for in-memory provider and provider factory behavior |
| `apps/api/src/http/rate-limit.ts` | Unchanged — existing local limiter stays for routes not yet migrated |
| `apps/api/src/auth/auth-routes.ts` | Added per-IP and per-username login rate limits before credential check |
| `apps/api/src/auth/auth-middleware.ts` | `AuthContext` now holds `rateLimitProvider` |
| `apps/api/src/vault/vault-routes.ts` | Added per-IP rate limit on vault unlock |
| `apps/api/src/server.ts` | Creates `rateLimitProvider` and passes it into `AuthContext` and vault routes |
| `apps/api/package.json` | Added `ioredis` dependency |

## Rate Limit Policy

### Login
- Per IP: 5 requests per 5 minutes
- Per username: 5 requests per 10 minutes
- Returns `429` with `Retry-After` header on exceed
- Does not reveal username existence in error response

### Vault Unlock
- Per IP: 5 requests per 1 minute

### Telegram Test (existing)
- Per IP: 5 requests per 1 minute (via existing `assertLocalRateLimit`)

## Provider Abstraction

`RateLimitProvider` interface exposes:
- `name`: `"redis"` or `"memory"`
- `isDistributed`: boolean
- `assertLimit(key, limit, windowMs)`: throws `RateLimitExceeded` on limit
- `getLimit(key, limit, windowMs)`: returns `{ consumed, remaining, resetAt }`

Factory: `createRateLimitProvider(config) => Promise<RateLimitProvider>`

Behavior:
- If `REDIS_URL` is configured and not `redis://localhost:6379`, attempts Redis with ioredis.
- Falls back to in-memory with a warning logged at startup.
- Uses Lua script for atomic sliding-window rate limiting in Redis.

## Validation

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS |
| `pnpm test` | PASS: 34 files / 125 tests |
| `pnpm build` | PASS |

## Docs Updated

- `docs/AUTH_SETUP.md` — added Rate Limiting section
- `docs/OPERATIONS_RUNBOOK.md` — already had Telegram test rate limit note; no change needed
- `docs/SERVER_DEPLOYMENT_CHECKLIST.md` — already has auth items; rate limiting is implicit in "Auth is enabled and tested"

## Remaining Items

- Wallet import/export sensitive routes can use the rate limit provider in a follow-up (currently use `assertVaultUnlocked` gate which is stronger)
- Redis provider not tested with real Redis in this PR (requires integration test environment)