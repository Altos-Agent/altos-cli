import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import {
  listDeadLetterJobs,
  markDeadLetterResolved,
  replayDeadLetterJob,
  getDlqStats,
} from "./dlq.service.js";
import { handleValidationError } from "../http/validation.js";

const resolveBodySchema = z.object({
  resolvedBy: z.string().optional().default("operator"),
  resolutionNote: z.string().optional(),
});

const replayBodySchema = z.object({
  // Currently no additional params needed
});

export const createDlqRoutes = (db: DbClient) => {
  return async (server: FastifyInstance) => {
    // List DLQ entries
    server.get("/api/dlq", async (request, reply) => {
      try {
        const { query } = request as { query: {
          queueName?: string;
          walletId?: string;
          pairId?: string;
          errorCode?: string;
          includeResolved?: string;
          limit?: string;
          offset?: string;
        }};

        const result = await listDeadLetterJobs(db, {
          queueName: query.queueName,
          walletId: query.walletId,
          pairId: query.pairId,
          errorCode: query.errorCode,
          includeResolved: query.includeResolved === "true",
          limit: query.limit ? parseInt(query.limit) : undefined,
          offset: query.offset ? parseInt(query.offset) : undefined,
        });

        return reply.send(result);
      } catch (error) {
        return handleValidationError(error, reply);
      }
    });

    // Get DLQ stats
    server.get("/api/dlq/stats", async () => {
      return await getDlqStats(db);
    });

    // Resolve a DLQ entry
    server.post<{ Params: { id: string } }>(
      "/api/dlq/:id/resolve",
      async (request, reply) => {
        try {
          const { id } = request.params;
          const body = parseRequestBody(resolveBodySchema, request.body);

          const result = await markDeadLetterResolved(db, {
            id,
            resolvedBy: body.resolvedBy,
            resolutionNote: body.resolutionNote ?? undefined,
          });

          if (!result) {
            return reply.code(404).send({ error: "DLQ entry not found" });
          }

          return reply.send(result);
        } catch (error) {
          return handleValidationError(error, reply);
        }
      }
    );

    // Replay a DLQ entry (DRY_RUN only)
    server.post<{ Params: { id: string } }>(
      "/api/dlq/:id/replay",
      async (request, reply) => {
        try {
          const { id } = request.params;

          // Note: In a real implementation, we need access to queues here
          // For now, this is a stub that returns information about the limitation
          const result = await replayDeadLetterJob(db, {
            id,
            // Queues would be injected in real implementation
            queues: {
              tradeQueue: { add: async () => ({}) },
              quoteQueue: { add: async () => ({}) },
              confirmationQueue: { add: async () => ({}) },
              notificationQueue: { add: async () => ({}) },
            },
          });

          return reply.send(result);
        } catch (error) {
          return handleValidationError(error, reply);
        }
      }
    );
  };
};

// Simple request body parsing helper
const parseRequestBody = <T>(schema: z.ZodSchema<T>, body: unknown): T => {
  return schema.parse(body);
};