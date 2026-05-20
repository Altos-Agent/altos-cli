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
