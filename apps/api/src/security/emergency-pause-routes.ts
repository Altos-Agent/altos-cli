import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import {
  assertNoRequestBody,
  handleValidationError
} from "../http/validation.js";
import {
  disableGlobalEmergencyPause,
  enableGlobalEmergencyPause,
  getEmergencyPauseStatus,
  isEmergencyPauseError,
} from "./emergency-pause.js";
import { requireRole, requireReauth, requireConfirmation } from "../auth/rbac.js";
import type { AuthContext } from "../auth/auth-middleware.js";

const handleEmergencyPauseError = (error: unknown) => {
  if (isEmergencyPauseError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message },
    };
  }
  throw error;
};

export const registerEmergencyPauseRoutes = async (
  server: FastifyInstance,
  db: DbClient,
  _context: AuthContext,
) => {
  server.get("/api/emergency-pause", async () => await getEmergencyPauseStatus(db));

  server.post("/api/emergency-pause/enable", async (request, reply) => {
    try {
      assertNoRequestBody(request.body);
      return await enableGlobalEmergencyPause(db);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleEmergencyPauseError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });

  server.post("/api/emergency-pause/disable", async (request, reply) => {
    try {
      await requireRole(_context, request, reply, "admin");
      await requireReauth(_context, request, reply);
      await requireConfirmation(_context, request, reply, "DISABLE EMERGENCY PAUSE");
      if (_context.rateLimitProvider) {
        await _context.rateLimitProvider.assertLimit(
          `emergency-pause:disable:${request.ip}`,
          5,
          60_000,
        );
      }
      assertNoRequestBody(request.body);
      return await disableGlobalEmergencyPause(db);
    } catch (error) {
      const validation = handleValidationError(error, reply);
      if (validation) return validation;
      const handled = handleEmergencyPauseError(error);
      return reply.code(handled.statusCode).send(handled.body);
    }
  });
};
