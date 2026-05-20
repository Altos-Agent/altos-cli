# Telegram Observability Monitoring And Alerting

Date: 2026-05-20

Scope: Telegram settings/token encryption, notification events, delivery audit, request/job IDs, ops summary, Prometheus metrics, alert webhook, log redaction, stuck/dropped alerts, and production observability requirements.

Verdict/status: PARTIAL. Observability foundation is implemented. Production alerting and incident response still require configuration and drills.

## Telegram Settings And Token Encryption

- IMPLEMENTED: Telegram settings routes exist under `apps/api/src/notifications/telegram-routes.ts`.
- IMPLEMENTED: Bot tokens are encrypted before storage and never returned by API.
- IMPLEMENTED: Telegram settings include event preferences for submitted, confirmed, failed, rejected, and dry-run.
- IMPLEMENTED: UI warns Telegram is third-party infrastructure.
- NOT_TESTED: Real Telegram send was not performed in this audit.

## Notification Events

- IMPLEMENTED: Dry-run accepted/rejected.
- IMPLEMENTED: Transaction submitted/confirmed/failed/rejected.
- IMPLEMENTED: Wallet paused due risk limit.
- IMPLEMENTED: Emergency pause.
- PARTIAL: Delivery failure generally does not block core operation, which is correct for local usability but needs alerting in live mode.

## Delivery Audit

- IMPLEMENTED: `notification_deliveries` table captures channel, event type, status, request id, job id, wallet id, transaction id, destination preview, error code/message.
- IMPLEMENTED: Ops summary counts failed notification deliveries.
- PARTIAL: No UI table for notification delivery history was identified.

## Request/Job IDs

- IMPLEMENTED: Request context exists and request IDs are used in audit metadata.
- IMPLEMENTED: Scheduler notification jobs carry request ids and job ids.
- PARTIAL: Request/job correlation is not uniformly exposed in frontend transaction detail.

## Ops Summary

- IMPLEMENTED: `/api/ops/summary` returns runtime, vault, emergency pause, notification failures, scheduler failures, and transaction counts.
- IMPLEMENTED: Integration test covers ops summary.
- PARTIAL: Ops summary is authenticated via API session, but no role separation exists.

## Prometheus Metrics

- IMPLEMENTED: `/metrics` route exposes Prometheus text.
- IMPLEMENTED: Metrics include login failures, vault lock state, emergency pause state, notification deliveries, scheduler jobs, queue depth, RPC health, alert webhook totals.
- PARTIAL: `/metrics` is open unless `METRICS_TOKEN` is set.

## Alert Webhook

- IMPLEMENTED: Alert webhook code supports optional bearer token.
- IMPLEMENTED: Alerts include emergency pause, vault unlock, stuck transaction, dropped transaction, and scheduler failure.
- NOT_TESTED: Real alert webhook delivery was not tested.
- PARTIAL: No alert escalation routing or acknowledgement workflow exists.

## Logs And Redaction

- IMPLEMENTED: Fastify logger redacts authorization, cookies, private keys, encrypted private keys, encrypted bot tokens, Telegram bot tokens, seed phrases, master keys, and decrypted secrets.
- IMPLEMENTED: Alert webhook redacts sensitive payload keys.
- PARTIAL: Operators must still avoid printing env files, encrypted backups, or private keys in shell/chat.

## Stuck/Dropped Tx Alerting

- IMPLEMENTED: Missing receipt policy can set `STUCK` and `DROPPED`.
- IMPLEMENTED: Stuck/dropped transitions trigger alert webhook calls.
- PARTIAL: Replacement detection remains operator-reviewed.

## Monitoring Gaps

- HIGH / PARTIAL: Metrics token not required in production config.
- HIGH / NOT_TESTED: Alert webhook not tested.
- MEDIUM / PARTIAL: No Grafana/Prometheus deployment manifests.
- MEDIUM / PARTIAL: No notification delivery UI.
- MEDIUM / PARTIAL: No SLOs/error budgets for RPC, quote provider, scheduler, or transaction finality.

## Production Observability Requirements

- Require `METRICS_TOKEN` and internal-only metrics routing.
- Configure `ALERT_WEBHOOK_URL` and token.
- Create alerts for stuck/dropped tx, emergency pause, scheduler failure, provider 429, quote validation failures, Redis/Postgres health, vault unlock, and live-mode enablement.
- Run alert drill before tiny manual live test.
- Add dashboard for queue depth, failed jobs, pending transactions, aggregate risk, and notification failures.

## Acceptance Criteria

- Test alert webhook delivery creates success metrics.
- Stuck/dropped simulated transaction fires alerts.
- Metrics endpoint is authenticated or private.
- Operator can correlate request id, job id, transaction id, and alert event.
