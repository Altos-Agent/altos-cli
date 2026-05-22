import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import { scheduleOccurrences } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export async function registerOccurrenceRoutes(
  app: FastifyInstance,
  db: DbClient
) {
  app.get("/api/occurrences", async (req) => {
    const { walletId, scheduleId, status, mode, limit = "100" } = req.query as Record<string, string>;

    const conditions = [];
    if (walletId) conditions.push(eq(scheduleOccurrences.walletId, walletId));
    if (scheduleId) conditions.push(eq(scheduleOccurrences.scheduleId, scheduleId));
    if (status) conditions.push(eq(scheduleOccurrences.status, status as any));
    if (mode) conditions.push(eq(scheduleOccurrences.mode, mode as any));

    const rows = await db
      .select()
      .from(scheduleOccurrences)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(sql`${scheduleOccurrences.scheduledFor} DESC`)
      .limit(Number(limit));

    return { data: rows, meta: { total: rows.length } };
  });

  app.get("/api/occurrences/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(scheduleOccurrences)
      .where(eq(scheduleOccurrences.id, id))
      .limit(1);

    if (!row) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Occurrence not found" } });
    }
    return { data: row };
  });
}