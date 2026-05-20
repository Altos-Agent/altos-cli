/**
 * Alert webhook dispatcher.
 *
 * Safety properties:
 * - Fire-and-forget: webhook failures never throw or break core flows.
 * - No secrets in payloads (generic IDs, no addresses, no tokens).
 * - Configurable via ALERT_WEBHOOK_URL environment variable.
 * - Supports optional bearer token auth via ALERT_WEBHOOK_TOKEN.
 */

import { getRuntimeConfig } from "../config/runtime-config.js";
import { getCurrentRequestId } from "../http/request-context.js";
import { recordAlertWebhook } from "./metrics.js";

export type AlertEvent =
  | "emergency_pause_enabled"
  | "live_mode_attempted_unsafe"
  | "stuck_transaction"
  | "dropped_transaction"
  | "wallet_quarantined"
  | "notification_failure_spike"
  | "repeated_login_failures"
  | "vault_unlock_event"
  | "scheduler_failure";

export interface AlertPayload {
  event: AlertEvent;
  timestamp: string;
  requestId: string | null;
  service: string;
  severity: "info" | "warning" | "critical";
  message: string;
  details: Record<string, string | number | boolean | null>;
}

const redactSensitiveFields = (details: AlertPayload["details"]): AlertPayload["details"] => {
  const sanitized: AlertPayload["details"] = {};
  const sensitiveKeys = [
    "address",
    "walletAddress",
    "privateKey",
    "encryptedPrivateKey",
    "token",
    "secret",
    "password",
    "tokenIn",
    "tokenOut",
    "sessionId",
    "session",
  ];
  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(
      (sk) => lowerKey.includes(sk),
    );
    if (isSensitive && typeof value === "string") {
      sanitized[key] = "[redacted]";
    } else if (value === null || value === undefined) {
      sanitized[key] = null;
    } else if (typeof value === "object") {
      sanitized[key] = "[redacted]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

const buildPayload = (
  event: AlertEvent,
  message: string,
  severity: AlertPayload["severity"],
  details: Record<string, string | number | boolean | null>,
): AlertPayload => ({
  event,
  timestamp: new Date().toISOString(),
  requestId: getCurrentRequestId() ?? null,
  service: "base-orchestrator",
  severity,
  message,
  details: redactSensitiveFields(details),
});

const getWebhookConfig = () => {
  const config = getRuntimeConfig();
  return {
    url: config.alertWebhookUrl,
    token: config.alertWebhookToken,
  };
};

/**
 * Dispatch an alert. Returns true if sent or no-op; false if blocked.
 * Never throws — webhook failures are swallowed and logged only via metrics.
 */
export const dispatchAlert = async (
  event: AlertEvent,
  message: string,
  severity: AlertPayload["severity"] = "warning",
  details: Record<string, string | number | boolean | null> = {},
): Promise<boolean> => {
  const { url, token } = getWebhookConfig();

  if (!url) {
    return false;
  }

  const payload = buildPayload(event, message, severity, details);

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      recordAlertWebhook(event, "failure");
      return false;
    }
    recordAlertWebhook(event, "success");
    return true;
  } catch {
    recordAlertWebhook(event, "failure");
    return false;
  }
};

export const alertIfStuckTransaction = async (
  txId: string,
  walletId: string,
) => {
  await dispatchAlert(
    "stuck_transaction",
    `Transaction ${txId} on wallet ${walletId} is stuck and may require operator review`,
    "warning",
    { transactionId: txId, walletId },
  );
};

export const alertIfDroppedTransaction = async (
  txId: string,
  walletId: string,
) => {
  await dispatchAlert(
    "dropped_transaction",
    `Transaction ${txId} on wallet ${walletId} was dropped or replaced`,
    "critical",
    { transactionId: txId, walletId },
  );
};

export const alertEmergencyPauseEnabled = async () => {
  await dispatchAlert(
    "emergency_pause_enabled",
    "Global emergency pause was enabled on base-orchestrator",
    "critical",
    {},
  );
};

export const alertLiveModeAttemptedUnsafe = async (reason: string) => {
  await dispatchAlert(
    "live_mode_attempted_unsafe",
    `Live mode was attempted but blocked: ${reason}`,
    "critical",
    { reason },
  );
};

export const alertNotificationFailureSpike = async (count: number) => {
  await dispatchAlert(
    "notification_failure_spike",
    `${count} notification failures detected in recent window`,
    "warning",
    { failureCount: count },
  );
};

export const alertRepeatedLoginFailures = async (count: number) => {
  await dispatchAlert(
    "repeated_login_failures",
    `${count} login failures detected in recent window`,
    "warning",
    { failureCount: count },
  );
};

export const alertVaultUnlock = async () => {
  await dispatchAlert(
    "vault_unlock_event",
    "Vault was unlocked",
    "info",
    {},
  );
};

export const alertSchedulerFailure = async (reason: string) => {
  await dispatchAlert(
    "scheduler_failure",
    `Scheduler encountered a failure: ${reason}`,
    "error" as AlertPayload["severity"],
    { reason },
  );
};

export const alertQuoteProviderFailure = async (
  provider: string,
  errorType: string,
) => {
  await dispatchAlert(
    "notification_failure_spike",
    `Quote provider ${provider} failure: ${errorType}`,
    "warning",
    { provider, errorType },
  );
};

export const emitStuckTxAlert = async (
  walletAddress: string,
  stuckTxHashes: string[],
) => {
  await dispatchAlert(
    "stuck_transaction",
    `Stuck transaction(s) detected on wallet ${walletAddress}: ${stuckTxHashes.join(", ")}`,
    "critical",
    { walletAddress, stuckTxHashes: stuckTxHashes.join(", ") },
  );
};

export const emitDroppedTxAlert = async (
  walletAddress: string,
  droppedTxHashes: string[],
) => {
  await dispatchAlert(
    "dropped_transaction",
    `Dropped transaction(s) detected on wallet ${walletAddress}: ${droppedTxHashes.join(", ")}`,
    "critical",
    { walletAddress, droppedTxHashes: droppedTxHashes.join(", ") },
  );
};

export const emitWalletQuarantinedAlert = async (
  walletAddress: string,
  walletName: string,
) => {
  await dispatchAlert(
    "wallet_quarantined",
    `Wallet ${walletName} (${walletAddress}) has been quarantined due to nonce issues`,
    "critical",
    { walletAddress, walletName },
  );
};