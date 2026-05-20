import type { FastifyInstance } from "fastify";
import { walletScheduleSchema } from "@base-orchestrator/shared";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import {
  assertNoRequestBody,
  handleValidationError,
  parseIdParams,
  parseRequestBody
} from "../http/validation.js";
import { isEmergencyPauseError } from "../security/emergency-pause.js";
import {
  isSchedulerError,
  SchedulerService,
  type WalletScheduleInput
} from "./scheduler-service.js";
import {
  getOccurrencesForSchedule,
  getOccurrencesForWallet,
} from "./occurrence.service.js";

interface IdParams {
  id: string;
}

const schedulerPurgeSchema = z.object({
  confirm: z.literal("PURGE SCHEDULER QUEUES")
});

const handleSchedulerError = (error: unknown) => {
  if (isEmergencyPauseError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }
  if (isSchedulerError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }

  throw error;
};

export const createSchedulerRoutes = (db: DbClient) => {
  const scheduler = new SchedulerService(db);

  return async (server: FastifyInstance) => {
    server.get("/api/scheduler/status", async () => await scheduler.status());

    server.post("/api/scheduler/start", async (request, reply) => {
      try {
        assertNoRequestBody(request.body);
        return await scheduler.start();
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleSchedulerError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    });

    server.post("/api/scheduler/pause", async (request, reply) => {
      try {
        assertNoRequestBody(request.body);
        return await scheduler.pause();
      } catch (error) {
        return handleValidationError(error, reply);
      }
    });

    server.post("/api/scheduler/stop", async (request, reply) => {
      try {
        assertNoRequestBody(request.body);
        return await scheduler.stop();
      } catch (error) {
        return handleValidationError(error, reply);
      }
    });

    server.post("/api/scheduler/purge", async (request, reply) => {
      try {
        const body = parseRequestBody(schedulerPurgeSchema, request.body);
        return await scheduler.purgeQueues(body.confirm);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleSchedulerError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    });

    server.get<{ Params: IdParams }>(
      "/api/wallets/:id/schedule",
      async (request, reply) => {
        try {
          const params = parseIdParams(request.params);
          return await scheduler.getWalletSchedule(params.id);
        } catch (error) {
          const validation = handleValidationError(error, reply);
          if (validation) return validation;
          const handled = handleSchedulerError(error);
          return reply.code(handled.statusCode).send(handled.body);
        }
      }
    );

    server.post<{ Params: IdParams; Body: WalletScheduleInput }>(
      "/api/wallets/:id/schedule",
      async (request, reply) => {
        try {
          const params = parseIdParams(request.params);
          const body = parseRequestBody(walletScheduleSchema, request.body);
          return await scheduler.updateWalletSchedule(
            params.id,
            body
          );
        } catch (error) {
          const validation = handleValidationError(error, reply);
          if (validation) return validation;
          const handled = handleSchedulerError(error);
          return reply.code(handled.statusCode).send(handled.body);
        }
      }
    );

    server.post<{ Params: IdParams }>(
      "/api/wallets/:id/emergency-pause",
      async (request, reply) => {
        try {
          const params = parseIdParams(request.params);
          assertNoRequestBody(request.body);
          return await scheduler.emergencyPause(params.id);
        } catch (error) {
          const validation = handleValidationError(error, reply);
          if (validation) return validation;
          const handled = handleSchedulerError(error);
          return reply.code(handled.statusCode).send(handled.body);
        }
      }
    );

    // Occurrence visibility endpoints
    server.get<{ Params: IdParams }>(
      "/api/wallets/:id/occurrences",
      async (request, reply) => {
        try {
          const params = parseIdParams(request.params);
          return await getOccurrencesForWallet(db, params.id, 50);
        } catch (error) {
          const validation = handleValidationError(error, reply);
          if (validation) return validation;
          throw error;
        }
      }
    );

    server.get<{ Params: IdParams }>(
      "/api/schedules/:id/occurrences",
      async (request, reply) => {
        try {
          const params = parseIdParams(request.params);
          return await getOccurrencesForSchedule(db, params.id, 50);
        } catch (error) {
          const validation = handleValidationError(error, reply);
          if (validation) return validation;
          throw error;
        }
      }
    );
  };
};
