import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import { notificationDeliveries, schedulerJobs, transactions } from "../db/schema.js";
import { getRuntimeStatus } from "../runtime/runtime-status.js";
import { getEmergencyPauseStatus } from "../security/emergency-pause.js";
import { getVaultStatus } from "../vault/vault-lock.js";
import { getHealthStatus } from "./health.js";
import { metricsRegistry } from "./metrics.js";
import { refreshTransactionalMetrics } from "./metrics-routes.js";

export const registerOpsRoutes = async (
  server: FastifyInstance,
  db: DbClient,
) => {
  server.get("/api/ops/summary", async () => {
    await refreshTransactionalMetrics(db);

    const [
      notificationFailures,
      submittedTransactions,
      failedTransactions,
      stuckTransactions,
      droppedTransactions,
      emergencyPause,
      vaultStatus,
      runtimeStatus,
      healthStatus,
      schedulerFailedJobs,
    ] = await Promise.all([
      db
        .select({ id: notificationDeliveries.id })
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.status, "FAILED")),
      db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.status, "SUBMITTED")),
      db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.status, "FAILED")),
      db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.status, "STUCK")),
      db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.status, "DROPPED")),
      getEmergencyPauseStatus(db),
      getVaultStatus(),
      getRuntimeStatus(db),
      getHealthStatus(db),
      db
        .select({ id: schedulerJobs.id })
        .from(schedulerJobs)
        .where(eq(schedulerJobs.status, "FAILED")),
    ]);

    const metrics = metricsRegistry.snapshot();
    const authFailuresEntry = metrics.get("auth_login_failures_total");
    const authFailuresCount = authFailuresEntry
      ? authFailuresEntry.reduce((sum, e) => sum + e.value, 0)
      : null;

    return {
      metricsAvailable: true,
      lastAlertStatus: null as string | null,
      stuckTxCount: stuckTransactions.length,
      droppedTxCount: droppedTransactions.length,
      notificationFailuresCount: notificationFailures.length,
      authFailuresCount,
      notificationFailuresTotal: notificationFailures.length,
      schedulerFailedJobCount: schedulerFailedJobs.length,
      submittedTxCount: submittedTransactions.length,
      failedTxCount: failedTransactions.length,
      emergencyPauseStatus: emergencyPause,
      vaultStatus,
      runtimeStatus,
      healthStatus,
      queueDepth: null as number | null,
    };
  });
};