/**
 * Prometheus-compatible /metrics endpoint.
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { transactions } from "../db/schema.js";
import { getRuntimeConfig } from "../config/runtime-config.js";
import { metricsRegistry } from "./metrics.js";

export const registerMetricsRoutes = async (
  server: FastifyInstance,
  db: DbClient,
) => {
  /**
   * GET /metrics
   *
   * Prometheus-compatible text format metrics.
   *
   * Auth: if METRICS_TOKEN is set, requires Authorization: Bearer <token> header.
   * Without METRICS_TOKEN the endpoint is open (suitable for local-only access).
   *
   * No secrets are ever emitted in metrics output.
   */
  server.get("/metrics", async (request, reply) => {
    const config = getRuntimeConfig();

    if (config.metricsToken !== null) {
      const authHeader =
        request.headers["authorization"] ?? request.headers["Authorization"];
      const token =
        typeof authHeader === "string"
          ? authHeader.replace(/^bearer\s+/i, "")
          : null;

      if (token !== config.metricsToken) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    }

    await refreshTransactionalMetrics(db);

    const body = metricsRegistry.format();
    return reply
      .code(200)
      .header("content-type", "text/plain; version=0.0.4; charset=utf-8")
      .send(body);
  });
};

/**
 * Refresh transaction-based metrics from the database.
 * Call this before emitting /metrics so gauge values are current.
 */
export const refreshTransactionalMetrics = async (db: DbClient) => {
  const [stuckRows, droppedRows] = await Promise.all([
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.status, "STUCK")),
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.status, "DROPPED")),
  ]);

  const { setStuckTransactionCount, setDroppedTransactionCount } = await import(
    "./metrics.js"
  );
  setStuckTransactionCount(stuckRows.length);
  setDroppedTransactionCount(droppedRows.length);
};