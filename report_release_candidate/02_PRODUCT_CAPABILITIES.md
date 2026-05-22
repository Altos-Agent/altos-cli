# 02 — Product Capabilities

**Date:** 2026-05-21

---

## What the System Can Do

### Completed Features

| Feature | Status | Notes |
|---------|--------|-------|
| Demo mode | ✅ Implemented | Demo wallet, demo mode flag, demo-only routes |
| Dry-run scheduling | ✅ Implemented | Multi-wallet, multi-pair, configurable schedules |
| Dry-run load testing | ✅ Implemented | Dry-run load test CLI with chaos injection |
| USD-normalized risk accounting | ✅ Implemented | `amountInUsd`, `gasUsd` used for all risk decisions |
| Aggregate risk engine | ✅ Implemented | 5 limits: daily trade, daily gas, pending notional, pending wallets, failed tx |
| Per-wallet risk limits | ✅ Implemented | Max trade USD, max gas USD, daily trades, daily loss |
| Verified token/router/spender registry | ✅ Implemented | Runtime enforcement for live mode |
| Quote engine | ✅ Implemented | ZeroX provider + mock provider |
| Provider circuit breaker | ✅ Implemented | CLOSED/HALF_OPEN/OPEN, concurrency + rate limits |
| Stale quote guard | ✅ Implemented | 30s expiry on quotes |
| Price impact guard | ✅ Implemented | BPS-based check against pair config |
| Occurrence idempotency | ✅ Implemented | Minute-bucket key, unique index |
| Nonce reservation | ✅ Implemented | Reserve → use → release flow for on-demand trades |
| Wallet quarantine | ✅ Implemented | QUARANTINED/UNCERTAIN states block scheduling |
| Emergency pause | ✅ Implemented | Global + per-wallet, enforced at all layers |
| Vault lock | ✅ Implemented | Auto-lock after configurable timeout |
| MFA (TOTP) | ✅ Implemented | 8 recovery codes, encrypted at rest |
| RBAC | ✅ Implemented | viewer/operator/admin hierarchy |
| Re-auth flow | ✅ Implemented | 5-minute window for sensitive operations |
| Rate limiting | ✅ Implemented | Redis-backed sliding window |
| Session management | ✅ Implemented | 12-hour sessions, Redis-backed |
| Readiness center | ✅ Implemented | 23 checks, 5 state categories |
| Drill artifacts | ✅ Implemented | Backup/restore, emergency pause, dry-run load test, Telegram |
| DLQ with replay | ✅ Implemented | DRY_RUN replay only, payload redaction |
| Trace/correlation ID | ✅ Implemented | AsyncLocalStorage, DB columns, API endpoints |
| Prometheus metrics | ✅ Implemented | 30+ metrics, `/metrics` endpoint |
| Alert webhooks | ✅ Implemented | 10+ alert rules, bearer token auth |
| Telegram notifications | ✅ Implemented | Confirmation + error alerts |
| Wallet management | ✅ Implemented | Import, rotate, pause, resume, emergency pause |
| Schedule management | ✅ Implemented | Create, update, pause, resume per wallet |
| Transaction state machine | ✅ Implemented | 11 states with proper transitions |
| Strategy engine | ✅ Implemented | Pair selection, rebalance, rotation |
| Preflight simulation | ✅ Implemented | Gas estimation, risk utilization |
| Chaos scenarios | ✅ Implemented | 6 failure simulation scenarios |

---

## What the System Cannot Do (Not Implemented)

| Feature | Missing | Priority |
|---------|---------|----------|
| Live scheduled execution | Hard-blocked at worker | Required for live |
| Multi-provider fallback | Single provider only | Required for live |
| Fetch timeout on ZeroX | Infinite hang on network issues | Required for live |
| Real-time price impact from 0x | Always null, guard never fires | Required for live |
| Per-operation MFA challenge | Only login MFA | Required for live |
| Auth on wallet status mutations | No RBAC on pause/resume/disable | Required for live |
| Auth on scheduler pause/stop | No auth check at all | Required for live |
| Auth on emergency pause enable | No auth check | Required for live |
| SigningCoordinator integration | Dead code, never called | Required for live |
| Pre-sign risk gate in scheduler | Not in worker execution path | Required for live |
| Trace event recording | Functions exist but uncalled | Required for live |
| Circuit breaker → Prometheus | Not wired to metrics | Required for live |
| Multi-worker vault propagation | Per-worker memory only | Required for multi-instance |
| Pair concentration limit | No cross-wallet tracking | Desired for live |
| Distributed lock (atomic) | Race condition in acquireLock | Required for HA |
| Periodic stale occurrence reconciliation | Only on startup | Desired |
| DLQ entry TTL / cleanup | Entries persist forever | Medium |
| MFA rate limiting on verify | Not documented | Medium |
| Session sliding window | Fixed 12-hour TTL | Medium |

---

## Safe Operating Boundaries

| Mode | Safe? | Conditions |
|------|-------|------------|
| Demo mode | ✅ Yes | Demo wallet only, no real tokens |
| Dry-run (single wallet) | ✅ Yes | Verified tokens, operator review |
| Dry-run (multi-wallet) | ✅ Yes | With load test artifact |
| Tiny manual live (execute-once) | ⚠️ Conditional | MFA per-op, rate limit on execute-once, auth on wallet mutations |
| Scheduled live automation | ❌ No | Not implemented, hard-blocked |
| Live with real funds | ❌ No | Would require all dead code paths fixed |

---

## Known Limitations

1. **External signer integration is dead code** — all signing uses `viem` direct key access
2. **Signer policy engine is dead code** — never invoked in execution path
3. **MFA only at login** — no per-trade MFA challenge
4. **ZeroX price impact not parsed** — always null, price impact check ineffective
5. **Vault state per-worker** — multi-worker deployments have inconsistent vault state
6. **ETH_USD_PRICE placeholder $3.50** in preflight — will produce wrong USD estimates
7. **No pair concentration limit** — one pair can absorb 100% of daily limit
8. **Scheduler lock race condition** — two schedulers could simultaneously acquire lock