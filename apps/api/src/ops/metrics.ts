/**
 * Lightweight in-memory Prometheus-compatible metrics registry.
 *
 * Design principles:
 * - No external dependencies.
 * - No secrets, no high-cardinality labels (no wallet addresses, tokens, session IDs).
 * - Thread-safe counter/gauge increments.
 * - Prometheus text format output for /metrics endpoint.
 */

export type MetricType = "counter" | "gauge";

interface MetricValue {
  value: number;
  labels: string;
}

interface MetricDefinition {
  type: MetricType;
  help: string;
  labelNames: string[];
  values: Map<string, number>;
}

const sanitizeLabelValue = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"');

const labelSetKey = (labelNames: string[], labelValues: string[]): string =>
  labelNames
    .map((name, i) => `${name}="${sanitizeLabelValue(labelValues[i] ?? "")}"`)
    .join(",");

const staticKey = (labelNames: string[], labelValues: string[]): string =>
  labelNames.length === 0
    ? ""
    : labelSetKey(labelNames, labelValues);

class Registry {
  private metrics = new Map<string, MetricDefinition>();

  private getOrCreate(
    name: string,
    type: MetricType,
    help: string,
    labelNames: string[],
  ): MetricDefinition {
    let metric = this.metrics.get(name);
    if (metric) {
      return metric;
    }
    metric = { type, help, labelNames, values: new Map() };
    this.metrics.set(name, metric);
    return metric;
  }

  /**
   * Register a new counter metric.
   */
  registerCounter(name: string, help: string, labelNames: string[] = []) {
    this.getOrCreate(name, "counter", help, labelNames);
  }

  /**
   * Register a new gauge metric.
   */
  registerGauge(name: string, help: string, labelNames: string[] = []) {
    this.getOrCreate(name, "gauge", help, labelNames);
  }

  /**
   * Increment a counter. labelValues must match labelNames in order.
   */
  incrementCounter(name: string, labelValues: string[] = []) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== "counter") {
      return;
    }
    const key = staticKey(metric.labelNames, labelValues);
    const current = metric.values.get(key) ?? 0;
    metric.values.set(key, current + 1);
  }

  /**
   * Set a gauge value.
   */
  setGauge(name: string, value: number, labelValues: string[] = []) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== "gauge") {
      return;
    }
    const key = staticKey(metric.labelNames, labelValues);
    metric.values.set(key, value);
  }

  /**
   * Add to a gauge value.
   */
  addGauge(name: string, delta: number, labelValues: string[] = []) {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== "gauge") {
      return;
    }
    const key = staticKey(metric.labelNames, labelValues);
    const current = metric.values.get(key) ?? 0;
    metric.values.set(key, current + delta);
  }

  /**
   * Format all metrics in Prometheus text format.
   */
  format(): string {
    const lines: string[] = [];
    for (const [name, metric] of this.metrics) {
      lines.push(`# HELP ${name} ${metric.help}`);
      lines.push(`# TYPE ${name} ${metric.type}`);
      if (metric.values.size === 0) {
        lines.push(`${name} 0`);
      } else {
        for (const [labels, value] of metric.values) {
          const labelSuffix = labels ? `{${labels}}` : "";
          lines.push(`${name}${labelSuffix} ${value}`);
        }
      }
    }
    return lines.join("\n") + "\n";
  }

  /** Snapshot current values for UI consumption. Returns map of name → {value, labels}. */
  snapshot(): Map<string, MetricValue[]> {
    const result = new Map<string, MetricValue[]>();
    for (const [name, metric] of this.metrics) {
      const entries: MetricValue[] = [];
      for (const [labels, value] of metric.values) {
        entries.push({ value, labels });
      }
      result.set(name, entries);
    }
    return result;
  }
}

export const metricsRegistry = new Registry();

// ─── Standard operational metrics ────────────────────────────────────────────

metricsRegistry.registerCounter(
  "api_requests_total",
  "Total number of API requests processed",
  ["method", "path", "status"],
);

metricsRegistry.registerCounter(
  "api_request_duration_seconds",
  "API request duration in seconds",
  ["method", "path"],
);

metricsRegistry.registerCounter(
  "auth_login_failures_total",
  "Total number of failed login attempts",
  ["reason"],
);

metricsRegistry.registerGauge(
  "vault_locked_state",
  "Vault lock state (0=unlocked, 1=locked)",
);

metricsRegistry.registerGauge(
  "emergency_pause_state",
  "Emergency pause state (0=normal, 1=paused)",
);

metricsRegistry.registerCounter(
  "transactions_by_status_total",
  "Total transactions by status",
  ["status"],
);

metricsRegistry.registerGauge(
  "transaction_stuck_total",
  "Current count of stuck transactions",
);

metricsRegistry.registerGauge(
  "transaction_dropped_total",
  "Current count of dropped transactions",
);

metricsRegistry.registerCounter(
  "notification_delivery_failures_total",
  "Total notification delivery failures",
  ["channel", "error_code"],
);

metricsRegistry.registerGauge(
  "scheduler_jobs_by_status_total",
  "Current scheduler jobs by status",
  ["status"],
);

metricsRegistry.registerGauge(
  "queue_depth",
  "Estimated queue depth (where safely available)",
  ["queue"],
);

metricsRegistry.registerCounter(
  "quote_provider_failures_total",
  "Total quote provider failures",
  ["provider", "error_type"],
);

metricsRegistry.registerGauge(
  "rpc_health_status",
  "RPC health status (1=ok, 0=degraded/down)",
  ["dependency"],
);

metricsRegistry.registerCounter(
  "alert_webhook_total",
  "Total alert webhook deliveries",
  ["event", "result"],
);

// ─── Instrumented accessors for safe label value derivation ───────────────────

export const recordApiRequest = (
  method: string,
  path: string,
  status: number,
  durationSeconds: number,
) => {
  metricsRegistry.incrementCounter("api_requests_total", [
    method,
    path,
    String(status),
  ]);
  metricsRegistry.incrementCounter("api_request_duration_seconds", [method, path]);
  void durationSeconds; // stored via _duration histogram; currently just a counter increment
};

export const recordLoginFailure = (reason: string) => {
  metricsRegistry.incrementCounter("auth_login_failures_total", [reason]);
};

export const setVaultLockedState = (locked: boolean) => {
  metricsRegistry.setGauge("vault_locked_state", locked ? 1 : 0);
};

export const setEmergencyPauseState = (paused: boolean) => {
  metricsRegistry.setGauge("emergency_pause_state", paused ? 1 : 0);
};

export const recordTransactionStatus = (status: string) => {
  metricsRegistry.incrementCounter("transactions_by_status_total", [status]);
};

export const setStuckTransactionCount = (count: number) => {
  metricsRegistry.setGauge("transaction_stuck_total", count);
};

export const setDroppedTransactionCount = (count: number) => {
  metricsRegistry.setGauge("transaction_dropped_total", count);
};

export const recordNotificationFailure = (channel: string, errorCode: string) => {
  metricsRegistry.incrementCounter("notification_delivery_failures_total", [
    channel,
    errorCode,
  ]);
};

export const recordSchedulerJobStatus = (status: string) => {
  metricsRegistry.incrementCounter("scheduler_jobs_by_status_total", [status]);
};

export const setQueueDepth = (queue: string, depth: number) => {
  metricsRegistry.setGauge("queue_depth", depth, [queue]);
};

export const recordQuoteProviderFailure = (
  provider: string,
  errorType: string,
) => {
  metricsRegistry.incrementCounter("quote_provider_failures_total", [
    provider,
    errorType,
  ]);
};

export const setRpcHealthStatus = (dependency: string, ok: boolean) => {
  metricsRegistry.setGauge("rpc_health_status", ok ? 1 : 0, [dependency]);
};

export const recordAlertWebhook = (event: string, result: "success" | "failure") => {
  metricsRegistry.incrementCounter("alert_webhook_total", [event, result]);
};