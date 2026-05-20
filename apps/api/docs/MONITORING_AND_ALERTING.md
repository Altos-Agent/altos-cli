# Monitoring and Alerting

Operational monitoring foundation for base-orchestrator — Prometheus metrics, alert webhooks, and Grafana integration.

## Endpoints

### GET /metrics

Prometheus-compatible text format metrics endpoint.

**Auth:** If `METRICS_TOKEN` is set, requires `Authorization: Bearer <token>` header. Without the token the endpoint is open (suitable for local-only access in dev/test).

**No secrets are ever emitted.** Wallet addresses, tokens, private keys, and session IDs are explicitly excluded from all metric labels.

#### Standard Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `api_requests_total` | counter | `method`, `path`, `status` | Total API requests |
| `api_request_duration_seconds` | counter | `method`, `path` | Request duration |
| `auth_login_failures_total` | counter | `reason` | Failed login attempts |
| `vault_locked_state` | gauge | — | Vault lock state (1=locked, 0=unlocked) |
| `emergency_pause_state` | gauge | — | Emergency pause state (1=paused, 0=normal) |
| `transactions_by_status_total` | counter | `status` | Transactions by status |
| `transaction_stuck_total` | gauge | — | Current stuck transaction count |
| `transaction_dropped_total` | gauge | — | Current dropped transaction count |
| `notification_delivery_failures_total` | counter | `channel`, `error_code` | Notification failures |
| `scheduler_jobs_by_status_total` | counter | `status` | Scheduler jobs by status |
| `queue_depth` | gauge | `queue` | Estimated queue depth |
| `quote_provider_failures_total` | counter | `provider`, `error_type` | Quote provider failures |
| `rpc_health_status` | gauge | `dependency` | RPC health (1=ok, 0=down) |
| `alert_webhook_total` | counter | `event`, `result` | Alert webhook deliveries |

### GET /api/ops/summary

Operational summary for UI/Ops dashboard.

```json
{
  "metricsAvailable": true,
  "lastAlertStatus": null,
  "stuckTxCount": 0,
  "droppedTxCount": 0,
  "notificationFailuresCount": 0,
  "authFailuresCount": 0,
  "schedulerFailedJobCount": 0,
  "submittedTxCount": 1,
  "failedTxCount": 0,
  "emergencyPauseStatus": { "globalEmergencyPaused": false },
  "vaultStatus": { "status": "LOCKED" },
  "queueDepth": null
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `METRICS_TOKEN` | No | Bearer token protecting `/metrics` endpoint |
| `ALERT_WEBHOOK_URL` | No | Webhook URL for critical event alerts |
| `ALERT_WEBHOOK_TOKEN` | No | Bearer token sent as `Authorization: Bearer <token>` header |

## Alert Webhook

When `ALERT_WEBHOOK_URL` is configured, the following events trigger a POST request with a JSON payload:

### Events

| Event | Severity | Trigger |
|-------|----------|---------|
| `emergency_pause_enabled` | critical | Global emergency pause activated |
| `live_mode_attempted_unsafe` | critical | Live mode blocked by safety check |
| `stuck_transaction` | warning | Transaction receipt missing after stuck timeout |
| `dropped_transaction` | critical | Transaction dropped or replaced |
| `notification_failure_spike` | warning | Multiple notification delivery failures |
| `repeated_login_failures` | warning | Multiple login failures detected |
| `vault_unlock_event` | info | Vault unlocked |
| `scheduler_failure` | error | Scheduler loop tick failed |

### Payload Format

```json
{
  "event": "stuck_transaction",
  "timestamp": "2026-05-14T00:00:00.000Z",
  "requestId": "req-abc123",
  "service": "base-orchestrator",
  "severity": "warning",
  "message": "Transaction tx-123 on wallet wallet-456 is stuck and may require operator review",
  "details": {
    "transactionId": "tx-123",
    "walletId": "wallet-456"
  }
}
```

### Security

- **No secrets in payloads.** Sensitive fields (`walletAddress`, `botToken`, `privateKey`, `sessionId`, `encryptedPrivateKey`) are redacted to `[redacted]` before sending.
- **Generic IDs only.** Transaction and wallet IDs are included but never wallet addresses or full hashes.
- **Fire-and-forget.** Webhook failures never break core application flows. Failures are tracked via `alert_webhook_total{failure}` metric.

## Prometheus Scrape Config

```yaml
scrape_configs:
  - job_name: "base-orchestrator"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["localhost:4100"]
    # If METRICS_TOKEN is set:
    bearer_token: "your-metrics-token"

  # Alternative: use authorization header
  - job_name: "base-orchestrator-auth"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["localhost:4100"]
    authorization:
      type: "Bearer"
      credentials: "your-metrics-token"
```

**Note:** The `/metrics` endpoint does not require authentication when `METRICS_TOKEN` is unset. Restrict network access accordingly (e.g., `network_policy` in Kubernetes, security groups in AWS).

## Grafana Dashboard Fields

Recommended dashboard panels:

| Panel | Metric / Query | Notes |
|-------|----------------|-------|
| Request Rate | `rate(api_requests_total[5m])` | By `method`, `path` |
| Error Rate | `rate(api_requests_total{status=~"5.."}[5m])` | |
| p50 Latency | `rate(api_request_duration_seconds_sum[5m]) / rate(api_request_duration_seconds_count[5m])` | |
| Auth Failures | `auth_login_failures_total` | By `reason` label |
| Vault State | `vault_locked_state` | 1=locked, 0=unlocked |
| Emergency Pause | `emergency_pause_state` | 1=paused |
| Stuck Transactions | `transaction_stuck_total` | |
| Dropped Transactions | `transaction_dropped_total` | |
| Failed Notifications | `rate(notification_delivery_failures_total[5m])` | By `channel`, `error_code` |
| Scheduler Jobs | `scheduler_jobs_by_status_total` | By `status` |
| Quote Provider Errors | `rate(quote_provider_failures_total[5m])` | By `provider`, `error_type` |
| RPC Health | `rpc_health_status` | By `dependency` (1=ok, 0=down) |
| Alert Webhook | `rate(alert_webhook_total[5m])` | By `event`, `result` |

## Security Warnings

- **Do not expose `/metrics` publicly.** Without `METRICS_TOKEN`, the endpoint is open. Always use network-level restrictions or set `METRICS_TOKEN`.
- **Never include `METRICS_TOKEN` in commit history.** Store in a secrets manager.
- **Alert webhook payloads are redacted but not encrypted.** Do not send sensitive data in alert details even with redaction.
- **METRICS_TOKEN is not a security boundary** — it prevents casual access to metrics. For stronger auth, proxy through a service that enforces its own authentication.

## Alerting Rules (Prometheus/Grafana)

```yaml
groups:
  - name: base-orchestrator
    rules:
      - alert: EmergencyPauseActive
        expr: emergency_pause_state == 1
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Emergency pause is active on base-orchestrator"

      - alert: VaultLocked
        expr: vault_locked_state == 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Vault has been locked for 5 minutes"

      - alert: StuckTransactions
        expr: transaction_stuck_total > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "{{ $value }} stuck transactions require operator review"

      - alert: DroppedTransactions
        expr: transaction_dropped_total > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $value }} dropped transactions detected"

      - alert: HighAuthFailureRate
        expr: rate(auth_login_failures_total[5m]) > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High rate of login failures"

      - alert: RpcDependencyDown
        expr: rpc_health_status == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "RPC dependency {{ $labels.dependency }} is down"

      - alert: NotificationFailures
        expr: rate(notification_delivery_failures_total[5m]) > 5
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "High notification delivery failure rate"

      - alert: AlertWebhookFailure
        expr: rate(alert_webhook_total{result="failure"}[10m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Alert webhook has failing deliveries"
```

## Ops Dashboard Summary

The `/api/ops/summary` endpoint is designed for an internal ops page with:

- Metrics availability indicator
- Last alert status
- Stuck and dropped transaction counts
- Notification failure count
- Auth failure count (from metrics registry)
- Scheduler failed job count

## Dependencies

Metrics are maintained in-memory with no external dependencies. Queue depth (`queue_depth`) is set to `null` by default since BullMQ queue inspection requires Redis and is optional. Set queue depth values in the scheduler service if needed.