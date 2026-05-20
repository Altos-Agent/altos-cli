import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import {
  assertNoRequestBody,
  handleValidationError,
  parseIdParams
} from "../http/validation.js";
import {
  getTransaction,
  isTransactionConfirmationError,
  listTransactions,
  refreshTransactionConfirmation
} from "./confirmation.js";
import { TransactionManager } from "./transaction-manager.js";

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
  const transactionManager = new TransactionManager(db);
  server.get("/api/transactions", async () => await listTransactions(db));

  server.get(
    "/api/transactions/requests",
    async () => await transactionManager.listRequests()
  );

  server.get<{ Params: IdParams }>(
    "/api/wallets/:id/pending",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        return await transactionManager.getWalletPending(params.id);
      } catch (error) {
        return handleValidationError(error, reply);
      }
    }
  );

  server.get<{ Params: IdParams }>(
    "/api/transactions/:id",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        return await getTransaction(db, params.id);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleTransactionError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams }>(
    "/api/transactions/:id/refresh",
    async (request, reply) => {
      try {
        const params = parseIdParams(request.params);
        assertNoRequestBody(request.body);
        return await refreshTransactionConfirmation(db, params.id);
      } catch (error) {
        const validation = handleValidationError(error, reply);
        if (validation) return validation;
        const handled = handleTransactionError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
};
