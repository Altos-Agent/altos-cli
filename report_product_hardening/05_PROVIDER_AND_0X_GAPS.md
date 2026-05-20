# Provider And 0x Gaps

Date: 2026-05-20

Scope: Quote provider abstraction, 0x provider, strict quote validation, provider resilience, rate limiting, load tests, and Base RPC behavior.

Verdict/status: HIGH / PARTIAL. Provider abstraction and strict validation exist, but 0x live behavior, USD notional, gas USD, rate-limit handling, and 5+/10+ wallet load proof are incomplete.

## Current Implementation

- IMPLEMENTED: `apps/api/src/quote/quoteEngine.ts` selects mock or 0x provider.
- IMPLEMENTED: `apps/api/src/quote/providers/mock.ts` supports safe demo/dry-run behavior.
- IMPLEMENTED: `apps/api/src/quote/providers/zeroX.ts` maps 0x allowance-holder quote response into `NormalizedQuote`.
- IMPLEMENTED: `apps/api/src/quote/quote-validation.ts` validates chain ID, router/spender/target, token addresses, sell amount, tx data, native value, expiry, price impact, slippage, and buy amount.
- IMPLEMENTED: `apps/api/src/quote/quote-validation.test.ts` exists.

## Gaps

- HIGH / PARTIAL: `zeroX.ts` does not compute `gasUsd`; it sets `estimatedGas.gasUsd` to `"0"`.
- HIGH / PARTIAL: `zeroX.ts` sets `priceImpactBps` to `null`, so price-impact enforcement depends on missing provider metadata.
- HIGH / MISSING: Provider 429/5xx/network failures are not classified into retryable/non-retryable typed errors.
- HIGH / MISSING: No circuit breaker, provider cooldown, or fallback provider policy.
- HIGH / MISSING: No audited local load result for 5+/10+ wallets with realistic quote fan-out.
- MEDIUM / PARTIAL: `safeRawResponse()` limits size, but raw provider response still needs a redaction/review policy before production logs or audits.
- MEDIUM / PARTIAL: `ZEROX_API_KEY` defaults to empty string; live use requires explicit operator verification and failure behavior if missing.
- MEDIUM / MISSING: No quote SLA metrics for latency, status code, provider failure reason, or freshness rejection count.

## Exact Files Likely Touched

- `apps/api/src/quote/providers/zeroX.ts`
- `apps/api/src/quote/types.ts`
- `apps/api/src/quote/quoteEngine.ts`
- `apps/api/src/quote/quote-validation.ts`
- `apps/api/src/quote/quote-validation.test.ts`
- `apps/api/src/cli/dry-run-load-test.ts`
- `apps/api/src/ops/metrics.ts`
- `apps/api/src/ops/ops-routes.ts`
- `apps/api/src/ops/alert-webhook.ts`
- `apps/api/src/config/env.ts`
- `packages/shared/src/schemas/quote.ts`
- `docs/PROVIDER_LOAD_TEST.md`
- `.github/workflows/ci.yml`

## Acceptance Criteria

- HIGH: 0x provider returns typed errors for 400, 401/403, 429, 5xx, malformed response, timeout, stale quote, and missing calldata.
- HIGH: Quote metadata includes normalized USD notional or explicitly rejects live if not available.
- HIGH: Gas USD is estimated from gas units and Base fee data or marked unknown and rejected for live.
- HIGH: Provider load test proves 5 and 10 wallet dry-run fan-out without unsafe retries or rate-limit storms.
- MEDIUM: Metrics capture quote count, latency, failure code, stale rejection, and provider cooldown state.
- MEDIUM: Docs define exactly how to verify 0x allowance target and tx target on Base.

## Validation Commands

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/quote/quoteEngine.test.ts apps/api/src/quote/quote-validation.test.ts
pnpm --filter @base-orchestrator/api load-test
pnpm test
```
