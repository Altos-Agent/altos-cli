# 08 — Observability and Trace Review

**Date:** 2026-05-21

---

## Trace / Correlation ID Infrastructure

### Status: ✅ DEFINED BUT NOT WIRED

**What exists:**
- `request-context.ts`: AsyncLocalStorage-based context with `X-Trace-Id` or auto-generated UUID
- `trace.service.ts`: Event store with 11 phase types defined
- `trace.routes.ts`: API endpoints at `/api/traces/:traceId`, `/api/transactions/:id/trace`
- DB columns: `schedulerJobs.traceId`, `scheduleOccurrences.traceId`, `transactions.traceId`, `transactionRequests.traceId`, `deadLetterJobs.traceId`
- Sensitive data redaction: 20+ field patterns

### Gap: Trace Events Never Recorded

The following functions are **defined but never called** (outside tests and service itself):

| Function | Should Record | Called? |
|----------|-------------|---------|
| `recordQuote` | Quote success/failure | ❌ NO |
| `recordRisk` | Risk check result | ❌ NO |
| `recordJobQueued` | Job enqueued | ❌ NO |
| `recordTxCreated` | Transaction created | ❌ NO |
| `recordTxStatus` | Status transitions | ❌ NO |
| `recordDlq` | DLQ recording | ❌ NO |
| `recordAlert` | Alert dispatched | ❌ NO |
| `recordSimulationFailure` | Simulation rejected | ❌ NO |
| `recordAggregateRiskReject` | Risk rejection | ❌ NO |

The trace API exists but the pipeline is dry — trace data is never actually recorded.

---

## Prometheus Metrics

### Status: ✅ DEFINED BUT NOT WIRED

**What exists:**
- 30+ metrics defined in `metrics.ts`
- `/metrics` endpoint with optional Bearer auth
- Transactional metrics refresh from DB on each scrape

### Metrics That Are Defined But Never Recorded

| Metric | Defined | Called? |
|--------|---------|---------|
| `simulation_failure_total` | ✅ | ❌ NO |
| `aggregate_risk_reject_total` | ✅ | ❌ NO |
| `provider_429_total` | ✅ | ❌ NO |
| `provider_circuit_state` | ✅ | ❌ NO |
| `notification_failure_total` | ✅ | ❌ NO |
| `stale_quote_count` | ✅ | ❌ NO |
| `dlq_count` | ✅ | ❌ NO |

### Metrics Called Correctly

| Metric | Called In |
|--------|---------|
| `api_requests_total` | HTTP middleware |
| `api_request_duration_seconds` | HTTP middleware |
| `auth_login_failures_total` | auth routes |
| `vault_locked_state` | vault-lock.ts |
| `emergency_pause_state` | emergency-pause.ts |
| `transactions_by_status_total` | confirmation worker |
| `transaction_stuck_total` | metrics-routes.ts |
| `transaction_dropped_total` | metrics-routes.ts |
| `scheduler_jobs_by_status_total` | scheduler-service.ts |

### Gap: Quote Provider Not Instrumented

`zeroX.ts` uses `withCircuitBreaker()` but does not call `recordQuoteProviderFailure` or `recordProvider429` when errors occur. Circuit breaker state transitions are logged to console but not exported as Prometheus metrics.

### Gap: Signing Operations Not Instrumented

`signing-coordinator.ts` has zero metrics for signing request count, latency, success/failure. Critical for live scheduler auditing.

---

## Alert Webhooks

### Status: ✅ IMPLEMENTED

- Generic dispatcher with bearer token auth
- Fire-and-forget with redacted sensitive fields
- 10+ alert rules documented in `OBSERVABILITY_AND_ALERTS.md`
- `recordAlert` function defined but never called from alert webhook

---

## Trace Store Durability

### Status: ❌ IN-MEMORY ONLY

Trace events stored in `Map<string, TraceEvent[]>` in process memory:
- Lost on API restart
- Not shared across multiple API instances
- No distributed tracing

**For production, trace store should be Redis or DB-backed.**

---

## API Latency Histogram

### Status: ❌ MISSING

API latency only has a counter (`api_request_duration_seconds`) but no histogram buckets. Cannot calculate p50/p95/p99 latencies without histogram data.

---

## Hard Blockers in This Area

| # | Blocker | Fix Required |
|---|---------|-------------|
| H1 | Trace event functions defined but never called | Wire `recordQuote`, `recordRisk`, `recordJobQueued`, `recordTxCreated`, `recordDlq` into execution path |
| H2 | ZeroX provider not instrumented | Call `recordQuoteProviderFailure` and `recordProvider429` on errors |
| H3 | Circuit breaker state not exported to Prometheus | Call `setProviderCircuitState` on state transitions |
| H4 | Signing coordinator has zero metrics | Add signing request count, latency, success/failure metrics |
| H5 | Workers don't propagate trace context | Call `setCurrentTraceIdForAppend(job.data.traceId)` in trade worker |
| H6 | In-memory trace store | Move to Redis or DB for persistence |