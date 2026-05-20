import type { FastifyInstance } from "fastify";
import type { DbClient } from "./db/client.js";
import { aggregateRiskLimits } from "./db/schema.js";
import {
  checkAggregateRisk,
  getAggregateLimits,
  getAggregateStats,
  upsertAggregateStats
} from "./risk/aggregate-risk.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole, requireReauth } from "./auth/rbac.js";
import type { AuthContext } from "./auth/auth-middleware.js";

const updateLimitsSchema = z.object({
  maxDailyTradeUsd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maxDailyGasUsd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maxPendingTradeUsd: z.string().regex(/^\d+(\.\d+)?$/).optional(),
  maxPendingWallets: z.number().int().min(1).optional(),
  maxFailedTxPerDay: z.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export const registerRiskRoutes = async (
  server: FastifyInstance,
  db: DbClient,
  _context: AuthContext,
) => {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  server.get("/api/risk/aggregate", async (_req, _reply) => {
    const today = new Date().toISOString().slice(0, 10);
    const [limits, stats, pendingResult] = await Promise.all([
      getAggregateLimits(db),
      getAggregateStats(db, today),
      checkAggregateRisk(db, 0, 0),
    ]);

    return {
      limits,
      stats: {
        ...stats,
        totalPendingUsd: pendingResult.stats.totalPendingUsd,
      },
      enabled: limits?.enabled ?? false,
    };
  });

  server.get("/api/risk/aggregate/stats", async (_req, _reply) => {
    const today = new Date().toISOString().slice(0, 10);
    return await getAggregateStats(db, today);
  });

  server.get("/api/risk/aggregate/limits", async (_req, _reply) => {
    return await getAggregateLimits(db);
  });

  server.patch<{ Body: z.infer<typeof updateLimitsSchema> }>(
    "/api/risk/aggregate/limits",
    async (request, reply) => {
      try {
        await requireRole(_context, request, reply, "admin");
        await requireReauth(_context, request, reply);
        if (_context.rateLimitProvider) {
          await _context.rateLimitProvider.assertLimit(
            `risk:limits:${request.ip}`,
            10,
            60_000,
          );
        }
      const parsed = updateLimitsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: "Invalid limit values",
          details: parsed.error.issues,
        });
      }

      const existing = await getAggregateLimits(db);
      const updates = parsed.data;

      if (existing) {
        const updated = await db
          .update(aggregateRiskLimits)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(aggregateRiskLimits.chainId, 8453))
          .returning();
        return updated[0] ?? existing;
      } else {
        const created = await db
          .insert(aggregateRiskLimits)
          .values({
            chainId: 8453,
            maxDailyTradeUsd: updates.maxDailyTradeUsd ?? "10000",
            maxDailyGasUsd: updates.maxDailyGasUsd ?? "500",
            maxPendingTradeUsd: updates.maxPendingTradeUsd ?? "2000",
            maxPendingWallets: updates.maxPendingWallets ?? 10,
            maxFailedTxPerDay: updates.maxFailedTxPerDay ?? 5,
            enabled: updates.enabled ?? true,
          })
          .returning();
        return reply.code(201).send(created[0]);
      }
    }
  );

  server.post("/api/risk/aggregate/refresh-stats", async (_req, _reply) => {
    await upsertAggregateStats(db);
    const today = new Date().toISOString().slice(0, 10);
    return await getAggregateStats(db, today);
  });
  /* eslint-enable @typescript-eslint/no-unused-vars */
};