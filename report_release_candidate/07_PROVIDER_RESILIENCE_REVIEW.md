# 07 — Provider Resilience Review

**Date:** 2026-05-21

---

## Circuit Breaker

### Status: ✅ IMPLEMENTED

Full circuit breaker with three states:
- **CLOSED** — normal operation
- **HALF_OPEN** — probe requests allowed
- **OPEN** — all requests rejected for cooldown period

Configuration:
- `maxConcurrent: 5`
- `maxPerSecond: 10`
- `maxPerMinute: 50`
- `rateLimitThreshold: 3` (429s before opening)
- `halfOpenAfterMs: 60,000`
- `resetAfterMs: 30,000`
- `cooldownAfterRateLimitMs: 30,000`

### Gap: Not Tuned for Live vs Dry-Run

Circuit breaker uses hard-coded defaults, not env-driven. No mode distinction between dry-run and live. If live concurrency exceeds `maxConcurrent: 5`, requests will be rejected — which is its designed behavior, but limits are not validated for live conditions.

---

## 429 Handling

### Status: ✅ CORRECTLY IMPLEMENTED

`zeroX.ts` detects HTTP 429 and throws `ProviderRateLimitedError` with `retryable: true` and `retryAfterMs: 30_000`. Circuit breaker correctly opens on rate limit detection via string matching on error messages.

---

## Timeout Handling

### Status: ❌ MISSING — HIGH PRIORITY

`ZeroXQuoteProvider.getQuote()` has **no AbortController / signal timeout**. The `fetch()` call can hang indefinitely on network issues. `ProviderTimeoutError` is defined but never thrown from within `getQuote()`.

**Impact:** In production, a stalled network call to the 0x API will hang the quote request indefinitely with no timeout guard.

---

## Stale Quote Guard

### Status: ✅ IMPLEMENTED

Both `MockQuoteProvider` and `ZeroXQuoteProvider` set `expiresAt: now + 30,000`. `quote-validation.ts` checks `now > quote.expiresAt`. 30-second window is enforced.

---

## Price Impact

### Status: ⚠️ PARTIAL — ZeroX Never Returns It

`checkPriceImpact` function in `risk/price-impact.ts` validates `priceImpactBps` against `pair.maxPriceImpactBps`. However, **`ZeroXQuoteProvider` sets `priceImpactBps: null`** — the 0x API response is never parsed for price impact data.

**Impact:** Price impact check will always pass for real trades via 0x because the field is null, which is allowed by `checkPriceImpact`.

---

## Verified Registry Enforcement

### Status: ✅ IMPLEMENTED

Runtime verification enforcement via:
- `assertTokenVerifiedForLive` — Base chain, enabled, VERIFIED, evidence fields
- `assertRouterVerifiedForLive` — includes tx target + allowance target
- `assertPairVerifiedForLive` — recursively validates both tokens and pair
- `assertQuoteTargetVerifiedForLive` — maps quote target to verified router

These are called in `validateQuoteForExecution` when `live=true`.

---

## Multi-Provider Fallback

### Status: ❌ NOT IMPLEMENTED — SINGLE POINT OF FAILURE

`quoteEngine.ts` uses a single provider:
```typescript
provider = getConfiguredQuoteProvider()
```

If the single provider fails, the system has no recovery path. No `Promise.allSettled` across multiple providers, no fallback provider list, no retry loop.

**Impact:** Any provider outage results in complete inability to quote. Required for production live trading.

---

## Quote Freshness

### Status: ✅ IMPLEMENTED

`quote-freshness.ts` rejects quotes where `now > expiresAt`. 30-second window enforced. Both providers use 30 seconds.

---

## Hard Blockers in This Area

| # | Blocker | Fix Required |
|---|---------|-------------|
| H1 | No fetch timeout in ZeroX provider | Add AbortController with configurable timeout |
| H2 | No multi-provider fallback | Implement fallback provider list |
| H3 | Price impact always null from 0x | Parse price impact from 0x API response |