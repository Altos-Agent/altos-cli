import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import {
  createTelegramService,
  isTelegramError,
  type UpdateTelegramSettingsInput
} from "./telegram.js";

const handleError = (error: unknown) => {
  if (isTelegramError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }

  throw error;
};

export const registerTelegramRoutes = async (
  server: FastifyInstance,
  db: DbClient
) => {
  const telegram = createTelegramService(db);

  server.get("/api/settings/telegram", async () => await telegram.getSettings());

  server.put<{ Body: UpdateTelegramSettingsInput }>(
    "/api/settings/telegram",
    async (request, reply) => {
      try {
        return await telegram.updateSettings(request.body);
      } catch (error) {
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post("/api/settings/telegram/test", async (_request, reply) => {
    try {
      return await telegram.sendTest();
    } catch (error) {
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
};
