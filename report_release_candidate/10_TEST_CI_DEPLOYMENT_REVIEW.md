# 10 — Test, CI, Deployment Review

**Date:** 2026-05-21

---

## Unit Tests

### Status: ⚠️ PARTIAL — Pre-Existing Failures

| Area | Tests | Status |
|------|-------|--------|
| Aggregate risk | ✅ 418+ passing | Good coverage |
| Signer policy engine | ❌ Type errors | Pre-existing |
| Signing coordinator | ❌ Type errors | Pre-existing |
| Trade worker | ❌ 2 failures | Mock issues with `db.update`, `client.js` |
| Preflight | ❌ 8 failures | Missing `id` field in test objects |
| Provider errors | ❌ 2 failures | Missing `retryable` field, `internal` property |
| Rate limit provider | ❌ 2 failures | Missing env fields |
| Route validation integration | ❌ 2 failures | `rateLimitProvider: null` type mismatch |
| Idempotency routes | ❌ 3 failures | `rateLimitProvider: null` |

**Total: 16 pre-existing failures across 60 test files.**

---

## Integration Tests

### Status: ✅ COVERED

Key integration flows tested:
- Execute-once aggregate risk rejection
- Route validation
- Idempotency

### Gap: No Integration Test for Scheduler + Risk

The scheduler execution path with aggregate risk is not covered by integration tests.

---

## Load Testing

### Status: ✅ IMPLEMENTED

`dry-run-load-test.ts` CLI provides:
- Configurable concurrency (default: 4)
- Chaos injection (`--chaos` flag)
- Read-only mode (`--readOnly`)
- 6 chaos scenarios: provider_429, stale_quote, rpc_timeout, wallet_quarantine, dlq_replay, emergency_pause
- Safety gate: refuses to run with `DRY_RUN=false`
- Dry-run only — cannot execute live trades

---

## CI Pipeline

### Status: ⚠️ INCOMPLETE

From `.github/workflows/ci.yml`:
- Lint + typecheck
- Unit tests
- No E2E tests in CI
- No Playwright configured
- No load testing in CI
- No Docker smoke test in CI

### Gaps
- No E2E tests running in CI
- No Playwright or Cypress for UI testing
- No Docker runtime smoke test
- No load test in CI pipeline
- `e2eCiGreen` readiness check is passive (`!process.env.CI_STATUS_URL`) — doesn't actually query CI

---

## Docker Deployment

### Status: ✅ STRUCTURED

- `Dockerfile` exists
- `docker-compose.yml` with postgres + redis
- Nginx reverse proxy configuration
- Health check endpoints on all services

### Gaps
- No Docker runtime smoke test in CI
- No resource limit configuration (CPU/memory)
- No health check for Redis connectivity in API startup
- Vault state in memory — not suitable for multi-replica without external store

---

## Migration Safety

### Status: ✅ SAFE — All Additive

All migrations (0015, 0016, 0017) use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` patterns. No data destruction. No column removals.

---

## Hard Blockers in This Area

| # | Blocker | Fix |
|---|---------|-----|
| H1 | 16 pre-existing test failures | Fix test fixtures: missing `id`, `retryable`, `client.js` mocks |
| H2 | No E2E tests in CI | Add Playwright E2E suite |
| H3 | No Docker smoke test in CI | Add `docker compose up -d && curl health` |
| H4 | `e2eCiGreen` check is passive | Actually query CI endpoint, not env var absence |