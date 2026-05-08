import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import {
  getTransaction,
  isTransactionConfirmationError,
  listTransactions,
  refreshTransactionConfirmation
} from "./confirmation.js";

interface IdParams {
  id: string;
}

const handleTransactionError = (error: unknown) => {
  if (isTransactionConfirmationError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }

  throw error;
};

export const registerTransactionRoutes = async (
  server: FastifyInstance,
  db: DbClient
) => {
  server.get("/api/transactions", async () => await listTransactions(db));

  server.get<{ Params: IdParams }>(
    "/api/transactions/:id",
    async (request, reply) => {
      try {
        return await getTransaction(db, request.params.id);
      } catch (error) {
        const handled = handleTransactionError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/transactions/:id/refresh",
    async (request, reply) => {
      try {
        return await refreshTransactionConfirmation(db, request.params.id);
      } catch (error) {
        const handled = handleTransactionError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
};
