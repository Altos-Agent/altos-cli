import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import {
  isSchedulerError,
  SchedulerService,
  type WalletScheduleInput
} from "./scheduler-service.js";

interface IdParams {
  id: string;
}

const handleSchedulerError = (error: unknown) => {
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

    server.post("/api/scheduler/start", async (_request, reply) => {
      try {
        return await scheduler.start();
      } catch (error) {
        const handled = handleSchedulerError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    });

    server.post("/api/scheduler/stop", async () => await scheduler.stop());

    server.get<{ Params: IdParams }>(
      "/api/wallets/:id/schedule",
      async (request, reply) => {
        try {
          return await scheduler.getWalletSchedule(request.params.id);
        } catch (error) {
          const handled = handleSchedulerError(error);
          return reply.code(handled.statusCode).send(handled.body);
        }
      }
    );

    server.post<{ Params: IdParams; Body: WalletScheduleInput }>(
      "/api/wallets/:id/schedule",
      async (request, reply) => {
        try {
          return await scheduler.updateWalletSchedule(
            request.params.id,
            request.body
          );
        } catch (error) {
          const handled = handleSchedulerError(error);
          return reply.code(handled.statusCode).send(handled.body);
        }
      }
    );

    server.post<{ Params: IdParams }>(
      "/api/wallets/:id/emergency-pause",
      async (request, reply) => {
        try {
          return await scheduler.emergencyPause(request.params.id);
        } catch (error) {
          const handled = handleSchedulerError(error);
          return reply.code(handled.statusCode).send(handled.body);
        }
      }
    );
  };
};
