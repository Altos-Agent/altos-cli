import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import { aggregateRiskReservations } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export async function registerRiskReservationRoutes(
  app: FastifyInstance,
  db: DbClient
) {
  app.get("/api/risk-reservations", async (req) => {
    const { status, walletId, limit = "100" } = req.query as Record<string, string>;

    const conditions = [];
    if (status) conditions.push(eq(aggregateRiskReservations.status, status));
    if (walletId) conditions.push(eq(aggregateRiskReservations.walletId, walletId));

    const rows = await db
      .select()
      .from(aggregateRiskReservations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${aggregateRiskReservations.createdAt} DESC`)
      .limit(Number(limit));

    return { data: rows, meta: { total: rows.length } };
  });

  app.get("/api/risk-reservations/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(aggregateRiskReservations)
      .where(eq(aggregateRiskReservations.id, id))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Risk reservation not found" } });
    }
    return { data: row };
  });
}