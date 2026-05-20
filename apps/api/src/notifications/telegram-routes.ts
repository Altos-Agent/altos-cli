import type { FastifyInstance } from "fastify";
import { telegramSettingsSchema } from "@base-orchestrator/shared";
import type { DbClient } from "../db/client.js";
import {
  assertNoRequestBody,
  handleValidationError,
  parseRequestBody
} from "../http/validation.js";
import {
  createTelegramService,
  isTelegramError,
  type UpdateTelegramSettingsInput
} from "./telegram.js";
import {
  assertLocalRateLimit,
  isLocalRateLimitError
} from "../http/rate-limit.js";
import { requireRole } from "../auth/rbac.js";
import type { AuthContext } from "../auth/auth-middleware.js";

const handleError = (error: unknown) => {
  if (isTelegramError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }
  if (isLocalRateLimitError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }

  throw error;
};

export const registerTelegramRoutes = async (
  server: FastifyInstance,
  db: DbClient,
  _context: AuthContext,
) => {
  const telegram = createTelegramService(db);

  server.get("/api/settings/telegram", async () => await telegram.getSettings());

  server.put<{ Body: UpdateTelegramSettingsInput }>(
    "/api/settings/telegram",
    async (request, reply) => {
      try {
        await requireRole(_context, request, reply, "operator");
        const body = parseRequestBody(telegramSettingsSchema, request.body);
        return await telegram.updateSettings(body);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post("/api/settings/telegram/test", async (request, reply) => {
    try {
      await requireRole(_context, request, reply, "operator");
      assertNoRequestBody(request.body);
      assertLocalRateLimit({
        key: `telegram:test:${request.ip}`,
        limit: 5,
        windowMs: 60_000
      });
      return await telegram.sendTest();
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
};
