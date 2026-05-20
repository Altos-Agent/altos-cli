# Observability Trace Gaps

Date: 2026-05-20

Scope: Request IDs, job IDs, transaction IDs, notification audit, metrics, alert webhooks, logs, redaction, and trace continuity.

Verdict/status: MEDIUM / PARTIAL. Observability primitives exist, but end-to-end correlation from UI action to queue job to transaction hash to notification is incomplete.

## Current Implementation

- IMPLEMENTED: `apps/api/src/http/request-context.ts` creates an AsyncLocalStorage request ID and returns `x-request-id`.
- IMPLEMENTED: `apps/api/src/db/schema.ts` stores `requestId` on `transactions`, `transactionRequests`, and `notificationDeliveries`.
- IMPLEMENTED: `apps/api/src/notifications/telegram.ts` stores delivery rows and includes request ID, job ID, tx hash, and Basescan URL in messages where provided.
- IMPLEMENTED: `apps/api/src/ops/metrics.ts` defines Prometheus-compatible metrics.
- IMPLEMENTED: `apps/api/src/ops/alert-webhook.ts` provides redacted alert delivery.
- IMPLEMENTED: Fastify logger redacts sensitive fields in `apps/api/src/server.ts`.

## Gaps

- HIGH / PARTIAL: Queue jobs often use `getCurrentRequestId()` inside scheduler loops/workers where request context is absent. This causes `requestId: null` for autonomous jobs.
- HIGH / MISSING: No explicit trace entity that links UI action, API request, transaction request, scheduler job, risk reservation, tx hash, confirmation refresh, and notification delivery.
- MEDIUM / PARTIAL: Metrics accessors exist, but `recordApiRequest`, `setQueueDepth`, `recordSchedulerJobStatus`, and `recordQuoteProviderFailure` are mostly not wired into runtime paths.
- MEDIUM / PARTIAL: Alert webhook has an invalid cast to severity `"error"` in `alertSchedulerFailure()`, outside the declared `info | warning | critical` set.
- MEDIUM / PARTIAL: Notification delivery audit is good, but there is no alert drill proof for Telegram failure, stuck tx, dropped tx, repeated login failures, or emergency pause.
- LOW / PARTIAL: Logs are redacted for known fields, but provider raw response and future custody payloads need explicit redaction policy.

## Exact Files Likely Touched

- `apps/api/src/http/request-context.ts`
- `apps/api/src/server.ts`
- `apps/api/src/ops/metrics.ts`
- `apps/api/src/ops/metrics-routes.ts`
- `apps/api/src/ops/ops-routes.ts`
- `apps/api/src/ops/alert-webhook.ts`
- `apps/api/src/notifications/telegram.ts`
- `apps/api/src/notifications/telegram-routes.ts`
- `apps/api/src/scheduler/queues.ts`
- `apps/api/src/scheduler/scheduler-service.ts`
- `apps/api/src/scheduler/trade.worker.ts`
- `apps/api/src/scheduler/confirmation.worker.ts`
- `apps/api/src/trades/trade-routes.ts`
- `apps/api/src/transactions/transaction-manager.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/drizzle/0015_trace_audit.sql`
- `apps/web/lib/api.ts`
- `apps/web/components/transactions-table.tsx`
- `apps/web/app/(app)/transactions/[id]/page.tsx`

## Acceptance Criteria

- HIGH: Every dangerous action returns and persists a correlation ID visible in UI.
- HIGH: Scheduler-created jobs have deterministic trace IDs even without an HTTP request.
- HIGH: Telegram delivery records include request ID, job ID, wallet ID, transaction ID, tx hash context where safe, and status.
- HIGH: Metrics are wired for API status, queue depth, job status, quote failures, notification failures, stuck/dropped tx, vault lock, and emergency pause.
- MEDIUM: Alert webhook severity values conform to schema and have tests.
- MEDIUM: Alert drills for emergency pause, stuck tx, dropped tx, Telegram failure, and vault unlock are documented and runnable.

## Validation Commands

```bash
pnpm typecheck
pnpm lint
pnpm --filter @base-orchestrator/api test -- apps/api/src/ops/metrics.test.ts apps/api/src/ops/ops-routes.integration.test.ts
pnpm --filter @base-orchestrator/api test -- apps/api/src/notifications/telegram.test.ts apps/api/src/notifications/telegram-routes.integration.test.ts
pnpm test
```
