import type { FastifyInstance } from "fastify";
import type { DbClient } from "../db/client.js";
import {
  createApprovalService,
  isApprovalError,
  type ApprovalRequestInput
} from "./approval-service.js";

interface IdParams {
  id: string;
}

const handleApprovalError = (error: unknown) => {
  if (isApprovalError(error)) {
    return {
      statusCode: error.statusCode,
      body: { error: error.message }
    };
  }

  throw error;
};

export const registerApprovalRoutes = async (
  server: FastifyInstance,
  db: DbClient
) => {
  const approvalService = createApprovalService(db);

  server.get<{ Params: IdParams }>(
    "/api/wallets/:id/allowances",
    async (request, reply) => {
      try {
        return await approvalService.listWalletAllowances(request.params.id);
      } catch (error) {
        const handled = handleApprovalError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams; Body: ApprovalRequestInput }>(
    "/api/wallets/:id/approve",
    async (request, reply) => {
      try {
        const result = await approvalService.approve(
          request.params.id,
          request.body
        );
        return reply.code(result.accepted ? 201 : 200).send(result);
      } catch (error) {
        const handled = handleApprovalError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );

  server.post<{ Params: IdParams; Body: ApprovalRequestInput }>(
    "/api/wallets/:id/revoke",
    async (request, reply) => {
      try {
        const result = await approvalService.revoke(
          request.params.id,
          request.body
        );
        return reply.code(result.accepted ? 201 : 200).send(result);
      } catch (error) {
        const handled = handleApprovalError(error);
        return reply.code(handled.statusCode).send(handled.body);
      }
    }
  );
};
