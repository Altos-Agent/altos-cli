# Telegram Observability And Operations Review

Date: 2026-05-13  
Scope: Telegram settings, encrypted tokens, delivery audit, event coverage, failure handling, logs, metrics, monitoring, and runbooks.  
Verdict/status: IMPLEMENTED for local notifications; PARTIAL for production observability.

## Telegram Settings

Telegram settings are exposed through `apps/api/src/notifications/telegram-routes.ts` and `apps/web/app/(app)/settings/telegram/page.tsx`. The UI warns that Telegram is third-party infrastructure and exposes bot token/chat ID fields, event toggles, save, test notification, and recent delivery table.

## Token Encryption

Bot tokens are encrypted before storage and returned only as a preview. Evidence: `apps/api/src/notifications/telegram.ts`, tests in `telegram.test.ts` and `telegram.integration.test.ts`.

## Delivery Audit

`notification_deliveries` records channel, event type, status, request ID, job ID, wallet ID, transaction ID, destination preview, error code/message, and creation timestamp.

## Notification Events

Implemented event families include submitted, confirmed/finalized, failed, rejected, dry-run, emergency pause, approval/revoke, and Telegram test. Event toggles are stored in `telegram_settings`.

## Failure Handling

Failures are recorded as delivery rows. Disabled/missing destination cases are recorded as skipped. Telegram test sends are locally rate-limited. Queue retry/backoff is limited and needs production hardening.

## Ops Summary

`apps/api/src/ops/ops-routes.ts` returns runtime, vault, emergency pause, dependency status, notification failure count, and transaction counts. Queue depth currently appears incomplete/null in docs/code paths and should be finalized for production monitoring.

## Request / Job IDs

Request IDs are attached by HTTP middleware and included in notification delivery metadata. Scheduler jobs carry queue/job IDs into job history and notification delivery.

## Logging

Fastify/Pino logs request method, URL, status, timing, and request ID. This is suitable locally. Production needs log redaction review and structured log shipping.

## Metrics Gaps

| Gap | Severity | Status |
| --- | --- | --- |
| Durable metrics endpoint/prometheus exporter | MEDIUM | MISSING |
| Queue depth in ops summary fully wired | MEDIUM | PARTIAL |
| RPC latency/error metrics | MEDIUM | MISSING |
| Notification latency/retry metrics | MEDIUM | PARTIAL |
| Submitted/stuck/dropped transaction alerting | HIGH | MISSING |

## Monitoring Recommendations

1. Alert on `/health` degraded/down.
2. Alert on API 5xx rate and auth failures.
3. Alert on queue depth, failed jobs, and scheduler heartbeat expiry.
4. Alert on submitted/stuck/dropped transactions.
5. Alert on Telegram delivery failures.
6. Track RPC latency, quote provider latency, and quote validation rejection rate.
7. Track disk usage and backup success/failure.

## Alerting Gaps

No production alerting configuration was found. Telegram can notify some domain events, but it is not a full monitoring system.

## Operational Runbook Quality

`docs/OPERATIONS_RUNBOOK.md` is strong for local operations, emergency pause, backup/restore concepts, quotes/dry-runs, confirmations, and deployment smoke checks. It remains preparation-level for public/live-funds operations.

